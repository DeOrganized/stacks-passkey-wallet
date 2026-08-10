/**
 * Independent verifier for the FROZEN derivation vectors.
 *
 * This harness deliberately imports NOTHING from `src/` and nothing from the
 * published `stacks-passkey-wallet` package. Its whole purpose is to let a
 * third party re-derive `derivation.vectors.json` without trusting this
 * library's own code or its test suite: a bug in the library's composition of
 * HKDF/BIP-39/BIP-32 would be reproduced by a verifier that called into it, and
 * so could never be caught.
 *
 * Everything below is rebuilt from the specs (RFC 5869, BIP-39, BIP-32/44/84)
 * using third-party primitives, and each result is checked against independent
 * reference implementations:
 *   - Stacks  — @stacks/wallet-sdk performs its own HD traversal from the
 *               mnemonic, and @stacks/transactions encodes the address.
 *   - Bitcoin — bitcoinjs-lib's own P2WPKH encoder.
 *
 * The expected values and the derivation parameters both come from the vectors
 * file itself, so the file is self-describing: nothing is hard-coded here that
 * the artifact under test does not also state.
 *
 * Run:  node test/vectors/verify.mjs
 * Exit: 0 = every assertion passed, 1 = at least one failed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { generateWallet } from "@stacks/wallet-sdk";
import * as bitcoin from "bitcoinjs-lib";

const VECTORS_PATH = fileURLToPath(new URL("./derivation.vectors.json", import.meta.url));

/** The frozen paths, restated here so a silent path change in the file fails. */
export const EXPECTED_PATHS = {
  stacks: "m/44'/5757'/0'/0/0",
  bitcoin: "m/84'/0'/0'/0/0",
  bitcoin_testnet: "m/84'/1'/0'/0/0",
};

export function loadVectors(path = VECTORS_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * PRF bytes → BIP-39 entropy, per RFC 5869. The PRF salt is bound in as the
 * HKDF salt, which is what makes a different salt a different wallet universe.
 */
export function prfToEntropy(prfBytes, salt, info, outputBytes) {
  return hkdf(sha256, prfBytes, utf8ToBytes(salt), utf8ToBytes(info), outputBytes);
}

/** PRF bytes → 24-word BIP-39 mnemonic. */
export function prfToMnemonic(prfBytes, salt, info, outputBytes) {
  return entropyToMnemonic(prfToEntropy(prfBytes, salt, info, outputBytes), wordlist);
}

/** BIP-39 mnemonic → BIP-32 master node. No passphrase, per the frozen spec. */
export function mnemonicToRoot(mnemonic) {
  return HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));
}

/**
 * Stacks address at an explicit path, via third-party primitives only.
 * The trailing "01" marks the key compressed — stacks.js treats a bare 32-byte
 * key as uncompressed and yields a different, non-interoperable address.
 */
export function stacksAddressAtPath(root, path, network = "mainnet") {
  const node = root.derive(path);
  if (!node.privateKey) throw new Error(`no private key at ${path}`);
  return getAddressFromPrivateKey(`${bytesToHex(node.privateKey)}01`, network);
}

/** Native-SegWit (P2WPKH) address at an explicit path, via bitcoinjs-lib. */
export function bitcoinAddressAtPath(root, path, network = "mainnet") {
  const node = root.derive(path);
  if (!node.publicKey) throw new Error(`no public key at ${path}`);
  const address = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(node.publicKey),
    network: network === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet,
  }).address;
  if (!address) throw new Error(`bitcoinjs-lib produced no address at ${path}`);
  return address;
}

/** Stacks address derived by @stacks/wallet-sdk's own HD traversal. */
export async function stacksAddressFromMnemonic(mnemonic, network = "mainnet") {
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const account = wallet.accounts[0];
  if (!account) throw new Error("wallet-sdk produced no account");
  return getAddressFromPrivateKey(account.stxPrivateKey, network);
}

/** Minimal assertion recorder: logs every check, counts the failures. */
export function createRecorder(log = console.log) {
  let failures = 0;
  return {
    check(scope, name, actual, expected) {
      const ok = actual === expected;
      if (!ok) failures++;
      log(`  [${ok ? "PASS" : "FAIL"}] ${scope} ${name}`);
      if (!ok) {
        log(`         expected: ${expected}`);
        log(`         actual:   ${actual}`);
      }
      return ok;
    },
    get failures() {
      return failures;
    },
  };
}

/** Verify every vector in the file. Returns the failure count. */
export async function verifyAll(doc, log = console.log) {
  const r = createRecorder(log);
  const { hkdf: params } = doc;

  log(`\nHKDF: ${params.hash}, info "${params.info}", salt = ${params.saltSource}, ` +
    `${params.outputBytes} bytes`);
  r.check("params", "hash is SHA-256", params.hash, "SHA-256");
  r.check("params", "entropy is 32 bytes", params.outputBytes, 32);
  r.check("params", "salt source is utf8(PRF salt)", params.saltSource, "utf8(PRF salt)");

  for (const v of doc.vectors) {
    log(`\n=== vector: ${v.name} ===`);
    const prf = hexToBytes(v.prfBytesHex);
    const salt = v.salt ?? doc.salt;

    r.check(v.name, "PRF input is 32 bytes", prf.length, 32);

    // The stated paths are part of the frozen definition, not incidental data.
    r.check(v.name, "Stacks path", v.stacks.path, EXPECTED_PATHS.stacks);
    r.check(v.name, "Bitcoin path", v.bitcoin.path, EXPECTED_PATHS.bitcoin);
    r.check(v.name, "Bitcoin testnet path", v.bitcoin_testnet.path, EXPECTED_PATHS.bitcoin_testnet);

    // (1) PRF → HKDF → BIP-39, rebuilt from the specs.
    const mnemonic = prfToMnemonic(prf, salt, params.info, params.outputBytes);
    r.check(v.name, "mnemonic (HKDF → BIP-39)", mnemonic, v.mnemonic);
    r.check(v.name, "mnemonic is 24 words", mnemonic.split(" ").length, 24);

    const root = mnemonicToRoot(mnemonic);

    // (2) Stacks — an independent wallet's own traversal from the mnemonic.
    r.check(
      v.name,
      "Stacks address (@stacks/wallet-sdk)",
      await stacksAddressFromMnemonic(v.mnemonic),
      v.stacks.address,
    );
    // (3) Stacks — the stated path, traversed here.
    r.check(
      v.name,
      "Stacks address (stated path)",
      stacksAddressAtPath(root, v.stacks.path),
      v.stacks.address,
    );

    // (4)(5) Bitcoin — bitcoinjs-lib's own encoder, both networks.
    r.check(
      v.name,
      "Bitcoin address (bitcoinjs-lib)",
      bitcoinAddressAtPath(root, v.bitcoin.path, "mainnet"),
      v.bitcoin.address,
    );
    r.check(
      v.name,
      "Bitcoin testnet address (bitcoinjs-lib)",
      bitcoinAddressAtPath(root, v.bitcoin_testnet.path, "testnet"),
      v.bitcoin_testnet.address,
    );

    root.wipePrivateData();
  }

  return r.failures;
}

// Run only when executed directly, so negctl.mjs can reuse the helpers above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const doc = loadVectors();
  console.log(`Independent verification of ${doc.vectors.length} frozen vectors`);
  console.log(`File: ${VECTORS_PATH}`);
  console.log("Imports from src/ or the published package: none.");

  const failures = await verifyAll(doc);

  console.log("\n=================================");
  console.log(failures === 0 ? "RESULT: ALL ASSERTIONS PASS" : `RESULT: ${failures} FAILURE(S)`);
  console.log("=================================");
  process.exit(failures === 0 ? 0 : 1);
}
