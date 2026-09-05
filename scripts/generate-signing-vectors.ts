/**
 * Generates the FROZEN Stacks transaction-signing vectors.
 *
 * Sibling of generate-vectors.ts, kept separate so that regenerating signing
 * vectors can never rewrite the frozen wallet-identity (derivation) vectors.
 *
 * For each fixed, synthetic input it builds an unsigned transaction with
 * @stacks/transactions' own builders, signs it via THIS library, and then
 * cross-validates the result WITHOUT re-running the code under test:
 *   - the frozen signed bytes deserialize, and verifyOrigin() recovers a public
 *     key whose hash equals the spending condition's signer;
 *   - the recovered public key equals the account-0 key that @stacks/wallet-sdk
 *     derives independently from the same mnemonic;
 *   - the txid recomputes from the frozen bytes;
 *   - the signed bytes with the signature blanked equal the unsigned bytes, so
 *     the signer changed nothing but the origin signature.
 * It aborts before writing if anything disagrees.
 *
 * The PRF inputs are fixed byte patterns — test vectors, NOT real wallets. The
 * addresses involved must never be funded. Run: `npm run gen:vectors:signing`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bytesToHex } from "@noble/hashes/utils.js";
import {
  AuthType,
  Pc,
  PostConditionMode,
  type PostCondition,
  type StacksTransactionWire,
  deserializeTransaction,
  emptyMessageSignature,
  getAddressFromPublicKey,
  isSingleSig,
  makeUnsignedContractCall,
  makeUnsignedSTXTokenTransfer,
  privateKeyToPublic,
  publicKeyFromSignatureVrs,
  sigHashPreSign,
} from "@stacks/transactions";
import { generateWallet } from "@stacks/wallet-sdk";

import { DEFAULT_SALT } from "../src/wallet-identity";
import { prfBytesToMnemonic, prfBytesToRoot } from "../src/derivation/seed";
import { STACKS_PATH } from "../src/derivation/paths";
import {
  signStacksTransaction,
  type SignStacksTransactionOptions,
  type SignStacksTransactionResult,
} from "../src/signing";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixed corpus
// ---------------------------------------------------------------------------

const SIGNER_PRF = new Uint8Array(32).fill(0x07);
const FOREIGN_PRF = new Uint8Array(32).fill(0x08);

type Network = "mainnet" | "testnet";

/** Compressed public key hex of the account-0 Stacks key, via this library's root. */
function accountZeroPublicKey(prf: Uint8Array): string {
  const { root } = prfBytesToRoot(prf, DEFAULT_SALT);
  try {
    const node = root.derive(STACKS_PATH);
    if (!node.privateKey) throw new Error("no private key");
    const pub = privateKeyToPublic(`${bytesToHex(node.privateKey)}01`);
    return typeof pub === "string" ? pub : bytesToHex(pub);
  } finally {
    root.wipePrivateData();
  }
}

/** Independent reference: account-0 public key via @stacks/wallet-sdk's own HD traversal. */
async function referencePublicKey(prf: Uint8Array): Promise<string> {
  const mnemonic = prfBytesToMnemonic(prf, DEFAULT_SALT);
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const account = wallet.accounts[0];
  if (!account) throw new Error("wallet-sdk produced no account");
  const pub = privateKeyToPublic(account.stxPrivateKey);
  return typeof pub === "string" ? pub : bytesToHex(pub);
}

const signerPublicKey = accountZeroPublicKey(SIGNER_PRF);
const foreignPublicKey = accountZeroPublicKey(FOREIGN_PRF);

// ---------------------------------------------------------------------------
// Vector definitions (spec §6, seven classes)
// ---------------------------------------------------------------------------

interface TransferInput {
  type: "stx-transfer";
  network: Network;
  originPublicKey: string;
  recipient: string;
  amount: string;
  fee: string;
  nonce: string;
  memo: string;
  sponsored: boolean;
}

interface ContractCallInput {
  type: "contract-call";
  network: Network;
  originPublicKey: string;
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: never[];
  fee: string;
  nonce: string;
  postConditionMode: "allow" | "deny";
  postConditions: PostCondition[];
  sponsored: boolean;
}

type VectorInput = TransferInput | ContractCallInput;

interface VectorDef {
  name: string;
  class: number;
  description: string;
  input: VectorInput;
  options: Omit<SignStacksTransactionOptions, "salt">;
  /** Which PRF signs: the corpus signer, or (class 6) the signer against a foreign origin. */
  expectError?: "UnprotectedAssetMovementError" | "OriginAddressMismatchError";
}

function transfer(
  network: Network,
  originPublicKey: string,
  extra: Partial<TransferInput> = {},
): TransferInput {
  return {
    type: "stx-transfer",
    network,
    originPublicKey,
    recipient: getAddressFromPublicKey(foreignPublicKey, network),
    amount: "1000",
    fee: "200",
    nonce: "7",
    memo: "",
    sponsored: false,
    ...extra,
  };
}

function contractCall(
  network: Network,
  originPublicKey: string,
  postConditionMode: "allow" | "deny",
  postConditions: PostCondition[],
): ContractCallInput {
  return {
    type: "contract-call",
    network,
    originPublicKey,
    contractAddress: getAddressFromPublicKey(foreignPublicKey, network),
    contractName: "example",
    functionName: "noop",
    functionArgs: [],
    fee: "300",
    nonce: "9",
    postConditionMode,
    postConditions,
    sponsored: false,
  };
}

const signerMainnet = getAddressFromPublicKey(signerPublicKey, "mainnet");

const DEFS: VectorDef[] = [
  {
    name: "standard-transfer-mainnet",
    class: 1,
    description: "Standard STX transfer, mainnet, Deny mode, no post-conditions → complete",
    input: transfer("mainnet", signerPublicKey),
    options: {},
  },
  {
    name: "standard-transfer-testnet",
    class: 2,
    description: "Standard STX transfer, testnet → complete (fence follows the version byte)",
    input: transfer("testnet", signerPublicKey),
    options: {},
  },
  {
    name: "sponsored-transfer-mainnet",
    class: 3,
    description: "Sponsored STX transfer, mainnet → origin-signed; no txid exists",
    input: transfer("mainnet", signerPublicKey, { sponsored: true }),
    options: {},
  },
  {
    name: "contract-call-deny-with-post-conditions",
    class: 4,
    description: "Contract call, Deny mode with one STX post-condition → complete",
    input: contractCall("mainnet", signerPublicKey, "deny", [
      Pc.principal(signerMainnet).willSendEq(1000n).ustx(),
    ]),
    options: {},
  },
  {
    name: "contract-call-allow-without-flag",
    class: 5,
    description: "Contract call, Allow mode, no opt-in flag → UnprotectedAssetMovementError",
    input: contractCall("mainnet", signerPublicKey, "allow", []),
    options: {},
    expectError: "UnprotectedAssetMovementError",
  },
  {
    name: "foreign-origin-mainnet",
    class: 6,
    description: "Transfer whose origin is another passkey's key → OriginAddressMismatchError",
    input: transfer("mainnet", foreignPublicKey),
    options: {},
    expectError: "OriginAddressMismatchError",
  },
  {
    name: "contract-call-allow-with-flag",
    class: 7,
    description: "Contract call, Allow mode with allowUnprotectedAssetMovement: true → complete",
    input: contractCall("mainnet", signerPublicKey, "allow", []),
    options: { allowUnprotectedAssetMovement: true },
  },
];

// ---------------------------------------------------------------------------
// Build + sign + cross-validate
// ---------------------------------------------------------------------------

async function buildUnsigned(input: VectorInput): Promise<StacksTransactionWire> {
  if (input.type === "stx-transfer") {
    return makeUnsignedSTXTokenTransfer({
      recipient: input.recipient,
      amount: BigInt(input.amount),
      publicKey: input.originPublicKey,
      fee: BigInt(input.fee),
      nonce: BigInt(input.nonce),
      memo: input.memo,
      network: input.network,
      sponsored: input.sponsored,
    });
  }
  return makeUnsignedContractCall({
    contractAddress: input.contractAddress,
    contractName: input.contractName,
    functionName: input.functionName,
    functionArgs: input.functionArgs,
    publicKey: input.originPublicKey,
    fee: BigInt(input.fee),
    nonce: BigInt(input.nonce),
    network: input.network,
    postConditionMode: input.postConditionMode,
    postConditions: input.postConditions,
    sponsored: input.sponsored,
  });
}

function assertEq(mine: string, ref: string, what: string): void {
  if (mine !== ref) {
    throw new Error(`CROSS-VALIDATION FAILED: ${what}\n  mine: ${mine}\n  ref:  ${ref}`);
  }
}

/**
 * Independent checks on frozen signed bytes. Uses only @stacks/transactions'
 * deserializer and verifier plus the wallet-sdk reference key — never this
 * library's signer.
 */
function crossValidateSigned(
  name: string,
  unsignedHex: string,
  signedHex: string,
  result: SignStacksTransactionResult,
  refPublicKey: string,
): void {
  const parsed = deserializeTransaction(signedHex);
  // 1. Signature verifies against the spending condition's signer hash.
  parsed.verifyOrigin();

  // 2. The signer's public key is the reference key (wallet-sdk's own derivation).
  const cond = parsed.auth.spendingCondition;
  if (!isSingleSig(cond)) throw new Error(`${name}: expected single-sig origin`);
  const preSign = sigHashPreSign(parsed.verifyBegin(), AuthType.Standard, cond.fee, cond.nonce);
  const recovered = publicKeyFromSignatureVrs(preSign, cond.signature.data, cond.keyEncoding);
  assertEq(recovered, refPublicKey, `${name}: recovered public key vs @stacks/wallet-sdk`);
  assertEq(result.publicKey, refPublicKey, `${name}: reported public key vs @stacks/wallet-sdk`);

  // 3. txid recomputes from the frozen bytes (complete arm only).
  if (result.kind === "complete") {
    assertEq(parsed.txid(), result.txid, `${name}: txid recomputed from frozen bytes`);
  }

  // 4. Blanking the signature reproduces the unsigned bytes exactly: nothing
  //    but the origin signature changed.
  cond.signature = emptyMessageSignature();
  assertEq(parsed.serialize(), unsignedHex, `${name}: signed-minus-signature vs unsigned bytes`);
}

const signerRef = await referencePublicKey(SIGNER_PRF);
assertEq(signerPublicKey, signerRef, "corpus signer public key vs @stacks/wallet-sdk");
const foreignRef = await referencePublicKey(FOREIGN_PRF);
assertEq(foreignPublicKey, foreignRef, "corpus foreign public key vs @stacks/wallet-sdk");

const vectors = [];
for (const def of DEFS) {
  const unsigned = await buildUnsigned(def.input);
  const unsignedHex = unsigned.serialize();
  const originAddress = getAddressFromPublicKey(def.input.originPublicKey, def.input.network);

  // Sanity: identical inputs must rebuild identical unsigned bytes.
  assertEq((await buildUnsigned(def.input)).serialize(), unsignedHex, `${def.name}: unsigned determinism`);

  const base = {
    name: def.name,
    class: def.class,
    description: def.description,
    signerPrfBytesHex: bytesToHex(SIGNER_PRF),
    salt: DEFAULT_SALT,
    options: def.options,
    input: def.input,
    originAddress,
    unsignedHex,
  };

  if (def.expectError) {
    let caught: unknown;
    try {
      signStacksTransaction(SIGNER_PRF, unsigned, def.options);
    } catch (e) {
      caught = e;
    }
    const err = caught as { name?: string; derivedAddress?: string; originAddress?: string };
    assertEq(err?.name ?? "<no throw>", def.expectError, `${def.name}: expected error`);
    if (!isSingleSig(unsigned.auth.spendingCondition)) throw new Error("single-sig expected");
    assertEq(
      unsigned.auth.spendingCondition.signature.data,
      emptyMessageSignature().data,
      `${def.name}: no signature applied on refusal`,
    );
    const expected: Record<string, string> = { error: def.expectError };
    if (def.expectError === "OriginAddressMismatchError") {
      expected.derivedAddress = err.derivedAddress ?? "";
      expected.originAddress = err.originAddress ?? "";
      assertEq(expected.derivedAddress, getAddressFromPublicKey(signerPublicKey, def.input.network), `${def.name}: derivedAddress`);
      assertEq(expected.originAddress, originAddress, `${def.name}: originAddress`);
    }
    vectors.push({ ...base, expected });
    console.log(`OK ${def.name}: ${def.expectError}`);
    continue;
  }

  const result = signStacksTransaction(SIGNER_PRF, unsigned, def.options);
  const signedHex = bytesToHex(result.transaction);
  assertEq(
    signStacksTransaction(SIGNER_PRF, await buildUnsigned(def.input), def.options).transaction.length.toString(),
    result.transaction.length.toString(),
    `${def.name}: re-sign length`,
  );
  crossValidateSigned(def.name, unsignedHex, signedHex, result, signerRef);

  const expectedKind = def.input.sponsored ? "origin-signed" : "complete";
  assertEq(result.kind, expectedKind, `${def.name}: result kind`);

  const expected =
    result.kind === "complete"
      ? { kind: result.kind, signedHex, txid: result.txid, publicKey: result.publicKey }
      : { kind: result.kind, signedHex, publicKey: result.publicKey, txid: null };
  vectors.push({ ...base, expected });
  console.log(`OK ${def.name}: ${result.kind}${result.kind === "complete" ? ` txid ${result.txid}` : ""}`);
}

const output = {
  _comment:
    "FROZEN Stacks transaction-signing vectors — see docs/wallet-identity.md and README §Transaction signing. Inputs are fixed public byte patterns (test vectors, not real wallets — never fund these addresses). Each entry records every input, the exact unsigned bytes, and the exact expected output; an implementation that reproduces them byte-for-byte implements the signer. Regenerating with different constants is a breaking change.",
  salt: DEFAULT_SALT,
  prfCorpus: {
    signer: bytesToHex(SIGNER_PRF),
    foreign: bytesToHex(FOREIGN_PRF),
    note: "signer = 32 × 0x07 (the passkey that signs every vector); foreign = 32 × 0x08 (another passkey, used as recipient / contract address, and as the origin of the mismatch control)",
  },
  signerPublicKey,
  foreignPublicKey,
  signatureScheme: "secp256k1 ECDSA, RFC 6979 deterministic (canonical low-s), recoverable VRS as @stacks/transactions serializes it",
  generatedBy: "scripts/generate-signing-vectors.ts",
  crossValidatedWith: [
    "@stacks/transactions deserializeTransaction + verifyOrigin (signature recovers to the signer hash)",
    "@stacks/wallet-sdk (independent account-0 key derivation; recovered public key must match)",
    "txid recomputed from the frozen bytes",
    "signed bytes with the signature blanked == unsigned bytes",
  ],
  vectors,
};

const outPath = resolve(here, "../test/vectors/signing.vectors.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\nWrote ${vectors.length} cross-validated signing vectors -> ${outPath}`);
