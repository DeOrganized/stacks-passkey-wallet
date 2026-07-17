/**
 * Generates the FROZEN derivation test vectors.
 *
 * For each fixed (public, non-secret) PRF input it computes the wallet via THIS
 * library, then independently cross-validates:
 *   - Stacks address  vs  @stacks/wallet-sdk (independent HD derivation)
 *   - Bitcoin address vs  bitcoinjs-lib      (independent P2WPKH encoder)
 * and aborts if anything disagrees. Only then does it write the locked JSON.
 *
 * The inputs are fixed byte patterns (all-zero, all-ff, a counter, a tagged
 * hash) — they are test vectors, NOT real wallets. Run: `npm run gen:vectors`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { generateWallet } from "@stacks/wallet-sdk";
import * as bitcoin from "bitcoinjs-lib";

import { DEFAULT_SALT, HKDF_INFO } from "../src/wallet-identity";
import { prfBytesToMnemonic, prfBytesToRoot } from "../src/derivation/seed";
import { deriveStacksAccount } from "../src/derivation/stacks";
import { deriveBitcoinAccount } from "../src/derivation/bitcoin";
import { BITCOIN_NATIVE_SEGWIT_PATH, STACKS_PATH, bitcoinNativeSegwitPath } from "../src/derivation/paths";

const here = dirname(fileURLToPath(import.meta.url));

const fixed = (byteAt: (i: number) => number): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => byteAt(i));

const INPUTS: Array<{ name: string; prf: Uint8Array }> = [
  { name: "all-zero", prf: fixed(() => 0x00) },
  { name: "all-ff", prf: fixed(() => 0xff) },
  { name: "counter-0..31", prf: fixed((i) => i) },
  { name: "sha256-tagged", prf: sha256(utf8ToBytes("stacks-passkey-wallet/test-vector/1")) },
];

function assertEq(mine: string, ref: string, what: string): void {
  if (mine !== ref) {
    throw new Error(`CROSS-VALIDATION FAILED: ${what}\n  mine: ${mine}\n  ref:  ${ref}`);
  }
}

const vectors = [];
for (const { name, prf } of INPUTS) {
  const mnemonic = prfBytesToMnemonic(prf, DEFAULT_SALT);
  const { root } = prfBytesToRoot(prf, DEFAULT_SALT);
  const stacks = deriveStacksAccount(root, "mainnet");
  const btcAccount = deriveBitcoinAccount(root);
  const btcTestnet = deriveBitcoinAccount(root, "testnet");

  // Cross-validate Stacks against @stacks/wallet-sdk (independent derivation).
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const account = wallet.accounts[0];
  if (!account) throw new Error(`${name}: wallet-sdk produced no account`);
  const refStx = getAddressFromPrivateKey(account.stxPrivateKey, "mainnet");
  assertEq(stacks.address, refStx, `${name} Stacks vs @stacks/wallet-sdk`);

  // Cross-validate Bitcoin P2WPKH encoding against bitcoinjs-lib (mainnet).
  const btcNode = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
  const pubkey = btcNode.publicKey;
  if (!pubkey) throw new Error(`${name}: no BTC public key`);
  const refBtc = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(pubkey),
    network: bitcoin.networks.bitcoin,
  }).address;
  if (!refBtc) throw new Error(`${name}: bitcoinjs-lib produced no address`);
  assertEq(btcAccount.address, refBtc, `${name} Bitcoin vs bitcoinjs-lib`);

  // Cross-validate the testnet address: BIP-84 coin type 1' (m/84'/1'/0'/0/0),
  // encoded for bitcoinjs-lib's testnet — the pair a standard testnet wallet uses.
  const testnetPath = bitcoinNativeSegwitPath(0, "testnet");
  const btcTestNode = root.derive(testnetPath);
  const testPubkey = btcTestNode.publicKey;
  if (!testPubkey) throw new Error(`${name}: no BTC testnet public key`);
  const refBtcTestnet = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(testPubkey),
    network: bitcoin.networks.testnet,
  }).address;
  if (!refBtcTestnet) throw new Error(`${name}: bitcoinjs-lib produced no testnet address`);
  assertEq(btcTestnet.address, refBtcTestnet, `${name} Bitcoin testnet vs bitcoinjs-lib`);

  root.wipePrivateData();

  vectors.push({
    name,
    prfBytesHex: bytesToHex(prf),
    salt: DEFAULT_SALT,
    mnemonic,
    stacks: { path: STACKS_PATH, address: stacks.address },
    bitcoin: { path: BITCOIN_NATIVE_SEGWIT_PATH, address: btcAccount.address },
    bitcoin_testnet: { path: testnetPath, address: btcTestnet.address },
  });
  console.log(
    `OK ${name}: STX ${stacks.address} | BTC ${btcAccount.address} | tBTC ${btcTestnet.address}`,
  );
}

const output = {
  _comment:
    "FROZEN wallet-identity vectors — see docs/wallet-identity.md. Inputs are fixed public byte patterns (test vectors, not real wallets). Regenerating with different constants is a breaking change.",
  salt: DEFAULT_SALT,
  hkdf: {
    hash: "SHA-256",
    info: HKDF_INFO,
    saltSource: "utf8(PRF salt)",
    outputBytes: 32,
  },
  crossValidatedWith: ["@stacks/wallet-sdk", "bitcoinjs-lib"],
  vectors,
};

const outPath = resolve(here, "../test/vectors/derivation.vectors.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\nWrote ${vectors.length} cross-validated vectors -> ${outPath}`);
