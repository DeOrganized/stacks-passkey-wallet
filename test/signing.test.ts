import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
import { hashMessage as refHashMessage } from "@stacks/encryption";
import {
  AuthType,
  Pc,
  PostConditionMode,
  type StacksTransactionWire,
  deserializeTransaction,
  emptyMessageSignature,
  getAddressFromPublicKey,
  isSingleSig,
  makeUnsignedContractCall,
  makeUnsignedSTXTokenTransfer,
  privateKeyToPublic,
} from "@stacks/transactions";

import { prfBytesToRoot } from "../src/derivation/seed";
import {
  BITCOIN_NATIVE_SEGWIT_PATH,
  STACKS_PATH,
  bitcoinNativeSegwitPath,
} from "../src/derivation/paths";
import { deriveBitcoinAccount } from "../src/derivation/bitcoin";
import { deriveStacksAccount } from "../src/derivation/stacks";
import { OriginAddressMismatchError, UnprotectedAssetMovementError } from "../src/errors";
import {
  hashStacksMessage,
  signBitcoinPsbt,
  signStacksMessage,
  signStacksTransaction,
  signStacksTransactionWithRoot,
  verifyStacksMessage,
} from "../src/signing";
import { DEFAULT_SALT } from "../src/wallet-identity";

const prf = new Uint8Array(32).fill(0x07);

describe("Stacks message signing", () => {
  it("message hash matches @stacks/encryption reference (clean-room)", () => {
    for (const msg of ["", "hello", "DeOrganized passkey wallet ✨", "a".repeat(500)]) {
      expect(bytesToHex(hashStacksMessage(msg))).toBe(bytesToHex(refHashMessage(msg)));
    }
  });

  it("signs and verifies via public-key recovery", () => {
    const message = "sign-in to deorganized.com";
    const { signature, publicKey } = signStacksMessage(prf, message);
    expect(verifyStacksMessage(message, signature, publicKey)).toBe(true);
  });

  it("rejects a tampered message", () => {
    const { signature, publicKey } = signStacksMessage(prf, "amount: 10 STX");
    expect(verifyStacksMessage("amount: 1000 STX", signature, publicKey)).toBe(false);
  });
});

describe("Bitcoin PSBT signing", () => {
  function buildUnsignedPsbt(): Uint8Array {
    const { root } = prfBytesToRoot(prf);
    try {
      const node = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
      const wpkh = btc.p2wpkh(node.publicKey!, btc.NETWORK);
      const tx = new btc.Transaction();
      tx.addInput({
        txid: hexToBytes("11".repeat(32)),
        index: 0,
        witnessUtxo: { script: wpkh.script, amount: 100_000n },
      });
      tx.addOutputAddress(wpkh.address!, 90_000n, btc.NETWORK);
      return tx.toPSBT();
    } finally {
      root.wipePrivateData();
    }
  }

  it("signs a P2WPKH input with the derived key and finalizes", () => {
    const { psbt: signed, signedInputs } = signBitcoinPsbt(prf, buildUnsignedPsbt());
    expect(signedInputs).toBe(1);

    const tx = btc.Transaction.fromPSBT(signed);
    tx.finalize();
    expect(tx.getInput(0).finalScriptWitness).toBeDefined();
    expect(tx.id).toMatch(/^[0-9a-f]{64}$/);
  });

  // Coherence: a PSBT whose input pays the TESTNET account (coin type 1') must be
  // signable with network:"testnet". If signing derived at the mainnet path (the
  // pre-fix bug), the key wouldn't match the input's script and 0 inputs sign.
  it("signs a testnet input — signing key matches the testnet address (coin type 1')", () => {
    const { root } = prfBytesToRoot(prf);
    let psbt: Uint8Array;
    try {
      const node = root.derive(bitcoinNativeSegwitPath(0, "testnet"));
      const wpkh = btc.p2wpkh(node.publicKey!, btc.TEST_NETWORK);
      // The input's script must correspond to the testnet account address.
      expect(wpkh.address).toBe(deriveBitcoinAccount(root, "testnet").address);
      const tx = new btc.Transaction();
      tx.addInput({
        txid: hexToBytes("22".repeat(32)),
        index: 0,
        witnessUtxo: { script: wpkh.script, amount: 100_000n },
      });
      tx.addOutputAddress(wpkh.address!, 90_000n, btc.TEST_NETWORK);
      psbt = tx.toPSBT();
    } finally {
      root.wipePrivateData();
    }

    const { signedInputs } = signBitcoinPsbt(prf, psbt, { network: "testnet" });
    expect(signedInputs).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stacks transaction signing
// ---------------------------------------------------------------------------

type Network = "mainnet" | "testnet";

/** Compressed public key hex for the account-0 Stacks key of a root. */
function stacksPublicKeyHex(root: HDKey): string {
  const node = root.derive(STACKS_PATH);
  const pub = privateKeyToPublic(`${bytesToHex(node.privateKey!)}01`);
  return typeof pub === "string" ? pub : bytesToHex(pub);
}

/** A different passkey's account-0 key — the "wrong passkey answered" case. */
const FOREIGN_PRF = new Uint8Array(32).fill(0x08);

function foreignPublicKey(): string {
  const { root } = prfBytesToRoot(FOREIGN_PRF);
  try {
    return stacksPublicKeyHex(root);
  } finally {
    root.wipePrivateData();
  }
}

/** A standard STX transfer from `publicKey`; fee and nonce fixed so no network call is made. */
function unsignedTransfer(
  publicKey: string,
  network: Network,
  extra: { sponsored?: boolean } = {},
): Promise<StacksTransactionWire> {
  return makeUnsignedSTXTokenTransfer({
    recipient: getAddressFromPublicKey(foreignPublicKey(), network),
    amount: 1_000n,
    publicKey,
    fee: 200n,
    nonce: 7n,
    network,
    ...extra,
  });
}

function unsignedContractCall(
  publicKey: string,
  network: Network,
  postConditionMode: PostConditionMode,
  withPostConditions: boolean,
): Promise<StacksTransactionWire> {
  const origin = getAddressFromPublicKey(publicKey, network);
  return makeUnsignedContractCall({
    contractAddress: getAddressFromPublicKey(foreignPublicKey(), network),
    contractName: "example",
    functionName: "noop",
    functionArgs: [],
    publicKey,
    fee: 300n,
    nonce: 9n,
    network,
    postConditionMode,
    postConditions: withPostConditions ? [Pc.principal(origin).willSendEq(1_000n).ustx()] : [],
  });
}

function originSignatureHex(tx: StacksTransactionWire): string {
  const cond = tx.auth.spendingCondition;
  if (!isSingleSig(cond)) throw new Error("test expects a single-sig origin");
  return cond.signature.data;
}

const UNSIGNED = emptyMessageSignature().data;

/** JSON with BigInt fields rendered as strings, for structural snapshots. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

describe("Stacks transaction signing (WithRoot)", () => {
  const { root } = prfBytesToRoot(prf);
  const publicKey = stacksPublicKeyHex(root);

  it("standard mainnet transfer → complete, with a verifiable signature and matching txid", async () => {
    const tx = await unsignedTransfer(publicKey, "mainnet");
    const result = signStacksTransactionWithRoot(root, tx);

    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") return;
    expect(result.publicKey).toBe(publicKey);
    expect(result.txid).toMatch(/^[0-9a-f]{64}$/);

    // Independent round-trip: deserialize the returned bytes, verify the origin
    // signature recovers to the spending condition's signer, recompute the txid.
    const parsed = deserializeTransaction(result.transaction);
    expect(() => parsed.verifyOrigin()).not.toThrow();
    expect(parsed.txid()).toBe(result.txid);
    expect(parsed.auth.authType).toBe(AuthType.Standard);
  });

  it("testnet transfer with the same key → complete (fence follows the version byte)", async () => {
    const tx = await unsignedTransfer(publicKey, "testnet");
    const result = signStacksTransactionWithRoot(root, tx);
    expect(result.kind).toBe("complete");
    expect(() => deserializeTransaction(result.transaction).verifyOrigin()).not.toThrow();
  });

  it("sponsored transfer → origin-signed with no txid field of any kind", async () => {
    const tx = await unsignedTransfer(publicKey, "mainnet", { sponsored: true });
    const result = signStacksTransactionWithRoot(root, tx);

    expect(result.kind).toBe("origin-signed");
    expect("txid" in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["kind", "publicKey", "transaction"]);

    const parsed = deserializeTransaction(result.transaction);
    expect(parsed.auth.authType).toBe(AuthType.Sponsored);
    expect(() => parsed.verifyOrigin()).not.toThrow();
  });

  it("contract call, Deny mode with post-conditions → complete, post-conditions untouched", async () => {
    const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Deny, true);
    const before = tx.postConditions.values.length;
    const result = signStacksTransactionWithRoot(root, tx);
    expect(result.kind).toBe("complete");
    const parsed = deserializeTransaction(result.transaction);
    expect(parsed.postConditionMode).toBe(PostConditionMode.Deny);
    expect(parsed.postConditions.values.length).toBe(before);
  });

  it("Deny mode with no post-conditions signs without a flag", async () => {
    const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Deny, false);
    expect(signStacksTransactionWithRoot(root, tx).kind).toBe("complete");
  });

  it("Allow mode without the flag → UnprotectedAssetMovementError, nothing signed", async () => {
    const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Allow, false);
    expect(() => signStacksTransactionWithRoot(root, tx)).toThrowError(
      UnprotectedAssetMovementError,
    );
    expect(originSignatureHex(tx)).toBe(UNSIGNED);
  });

  it("Allow mode with allowUnprotectedAssetMovement: true → complete", async () => {
    const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Allow, false);
    const result = signStacksTransactionWithRoot(root, tx, { allowUnprotectedAssetMovement: true });
    expect(result.kind).toBe("complete");
    expect(() => deserializeTransaction(result.transaction).verifyOrigin()).not.toThrow();
  });

  for (const network of ["mainnet", "testnet"] as const) {
    it(`${network}: foreign origin → OriginAddressMismatchError with both addresses, nothing signed`, async () => {
      const foreign = foreignPublicKey();
      const tx = await unsignedTransfer(foreign, network);
      let caught: unknown;
      try {
        signStacksTransactionWithRoot(root, tx);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(OriginAddressMismatchError);
      const err = caught as OriginAddressMismatchError;
      expect(err.derivedAddress).toBe(deriveStacksAccount(root, network).address);
      expect(err.originAddress).toBe(getAddressFromPublicKey(foreign, network));
      expect(err.derivedAddress).not.toBe(err.originAddress);
      expect(originSignatureHex(tx)).toBe(UNSIGNED);
    });
  }

  it("the origin fence runs before the post-condition check", async () => {
    const tx = await unsignedContractCall(foreignPublicKey(), "mainnet", PostConditionMode.Allow, false);
    expect(() => signStacksTransactionWithRoot(root, tx)).toThrowError(OriginAddressMismatchError);
    expect(originSignatureHex(tx)).toBe(UNSIGNED);
  });

  it("modifies nothing on the wire object except the origin signature", async () => {
    const tx = await unsignedContractCall(publicKey, "testnet", PostConditionMode.Deny, true);
    const cond = tx.auth.spendingCondition;
    const snapshot = () => ({
      fee: cond.fee,
      nonce: cond.nonce,
      signer: cond.signer,
      hashMode: cond.hashMode,
      authType: tx.auth.authType,
      mode: tx.postConditionMode,
      postConditions: tx.postConditions.values.map((pc) => stable(pc)),
      version: tx.transactionVersion,
      chainId: tx.chainId,
      payload: stable(tx.payload),
    });
    const before = snapshot();
    expect(originSignatureHex(tx)).toBe(UNSIGNED);
    signStacksTransactionWithRoot(root, tx);
    expect(originSignatureHex(tx)).not.toBe(UNSIGNED);
    expect(snapshot()).toEqual(before);
  });

  it("is deterministic: identical unsigned bytes → identical signed bytes and txid", async () => {
    const a = signStacksTransactionWithRoot(root, await unsignedTransfer(publicKey, "mainnet"));
    const b = signStacksTransactionWithRoot(root, await unsignedTransfer(publicKey, "mainnet"));
    expect(bytesToHex(a.transaction)).toBe(bytesToHex(b.transaction));
    expect(a.kind === "complete" && b.kind === "complete" && a.txid === b.txid).toBe(true);
  });

  it("WithRoot does not wipe the caller's root", async () => {
    signStacksTransactionWithRoot(root, await unsignedTransfer(publicKey, "mainnet"));
    expect(root.privateKey).not.toBeNull();
  });
});

describe("Stacks transaction signing (prfBytes entry)", () => {
  const publicKey = (() => {
    const { root } = prfBytesToRoot(prf);
    try {
      return stacksPublicKeyHex(root);
    } finally {
      root.wipePrivateData();
    }
  })();

  it("delegates to WithRoot: same seed, same transaction → identical result", async () => {
    const viaPrf = signStacksTransaction(prf, await unsignedTransfer(publicKey, "mainnet"));
    const { root } = prfBytesToRoot(prf);
    try {
      const viaRoot = signStacksTransactionWithRoot(root, await unsignedTransfer(publicKey, "mainnet"));
      expect(bytesToHex(viaPrf.transaction)).toBe(bytesToHex(viaRoot.transaction));
      expect(viaPrf.publicKey).toBe(viaRoot.publicKey);
      expect(viaPrf.kind).toBe("complete");
      expect(viaPrf.kind === "complete" && viaRoot.kind === "complete" && viaPrf.txid === viaRoot.txid).toBe(true);
    } finally {
      root.wipePrivateData();
    }
  });

  it("passes allowUnprotectedAssetMovement through to WithRoot", async () => {
    const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Allow, false);
    expect(signStacksTransaction(prf, tx, { allowUnprotectedAssetMovement: true }).kind).toBe("complete");
  });

  // Reference wipe-assertion pattern for this suite: spy on HDKey.prototype.wipePrivateData,
  // then assert it fired once and the instance it fired on has no private key left.
  describe("wipes the derived root in finally", () => {
    let wipe: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      wipe = vi.spyOn(HDKey.prototype, "wipePrivateData");
    });
    afterEach(() => {
      wipe.mockRestore();
    });

    /** The one root the signer derived: wiped exactly once, private key gone. */
    function expectWipedOnce(): void {
      expect(wipe).toHaveBeenCalledTimes(1);
      const root = wipe.mock.instances[0] as unknown as HDKey;
      expect(root.privateKey).toBeNull();
    }

    it("on success", async () => {
      const tx = await unsignedTransfer(publicKey, "mainnet");
      wipe.mockClear();
      expect(signStacksTransaction(prf, tx).kind).toBe("complete");
      expectWipedOnce();
    });

    it("on the origin-mismatch refusal", async () => {
      const tx = await unsignedTransfer(foreignPublicKey(), "mainnet");
      wipe.mockClear();
      expect(() => signStacksTransaction(prf, tx)).toThrowError(OriginAddressMismatchError);
      expectWipedOnce();
      expect(originSignatureHex(tx)).toBe(UNSIGNED);
    });

    it("on the Allow-mode refusal", async () => {
      const tx = await unsignedContractCall(publicKey, "mainnet", PostConditionMode.Allow, false);
      wipe.mockClear();
      expect(() => signStacksTransaction(prf, tx)).toThrowError(UnprotectedAssetMovementError);
      expectWipedOnce();
      expect(originSignatureHex(tx)).toBe(UNSIGNED);
    });
  });

  describe("salt", () => {
    it("defaults to DEFAULT_SALT — same key as the message path", async () => {
      const implicit = signStacksTransaction(prf, await unsignedTransfer(publicKey, "mainnet"));
      const explicit = signStacksTransaction(prf, await unsignedTransfer(publicKey, "mainnet"), {
        salt: DEFAULT_SALT,
      });
      expect(bytesToHex(implicit.transaction)).toBe(bytesToHex(explicit.transaction));
      expect(implicit.publicKey).toBe(signStacksMessage(prf, "parity").publicKey);
    });

    it("a different salt is a different wallet: the origin fence refuses", async () => {
      const tx = await unsignedTransfer(publicKey, "mainnet");
      expect(() => signStacksTransaction(prf, tx, { salt: "some-other-app/v1" })).toThrowError(
        OriginAddressMismatchError,
      );
      expect(originSignatureHex(tx)).toBe(UNSIGNED);
    });
  });
});
