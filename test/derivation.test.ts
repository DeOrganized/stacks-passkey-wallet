import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { hexToBytes } from "@noble/hashes/utils.js";
import { getAddressFromPrivateKey } from "@stacks/transactions";
import { generateWallet } from "@stacks/wallet-sdk";
import * as bitcoin from "bitcoinjs-lib";

import { mnemonicToRoot, prfBytesToMnemonic, prfBytesToRoot } from "../src/derivation/seed";
import { deriveStacksAccount } from "../src/derivation/stacks";
import { deriveBitcoinAccount } from "../src/derivation/bitcoin";
import { deriveAddresses } from "../src/derivation";
import { BITCOIN_NATIVE_SEGWIT_PATH } from "../src/derivation/paths";
import { InvalidPrfOutputError } from "../src/errors";
import { DEFAULT_SALT } from "../src/wallet-identity";

const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locked: any = JSON.parse(
  readFileSync(resolve(here, "vectors/derivation.vectors.json"), "utf8"),
);

describe("locked derivation vectors", () => {
  for (const v of locked.vectors) {
    it(`reproduces ${v.name}`, () => {
      const prf = hexToBytes(v.prfBytesHex);
      expect(prfBytesToMnemonic(prf, v.salt)).toBe(v.mnemonic);
      const { root } = prfBytesToRoot(prf, v.salt);
      expect(deriveStacksAccount(root, "mainnet").address).toBe(v.stacks.address);
      expect(deriveBitcoinAccount(root).address).toBe(v.bitcoin.address);

      const testnet = deriveBitcoinAccount(root, "testnet");
      expect(testnet.path).toBe(v.bitcoin_testnet.path);
      expect(testnet.address).toBe(v.bitcoin_testnet.address);
    });
  }
});

describe("independent cross-validation (live)", () => {
  for (const v of locked.vectors) {
    it(`${v.name}: STX == @stacks/wallet-sdk, BTC (main+test) == bitcoinjs-lib`, async () => {
      const prf = hexToBytes(v.prfBytesHex);
      const { root } = prfBytesToRoot(prf, v.salt);

      const wallet = await generateWallet({ secretKey: v.mnemonic, password: "" });
      const refStx = getAddressFromPrivateKey(wallet.accounts[0]!.stxPrivateKey, "mainnet");
      expect(deriveStacksAccount(root, "mainnet").address).toBe(refStx);

      const node = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
      const refBtc = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(node.publicKey!),
        network: bitcoin.networks.bitcoin,
      }).address;
      expect(deriveBitcoinAccount(root).address).toBe(refBtc);

      // Testnet: BIP-84 coin type 1' key, encoded for bitcoinjs-lib testnet.
      const testNode = root.derive(v.bitcoin_testnet.path);
      const refBtcTestnet = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(testNode.publicKey!),
        network: bitcoin.networks.testnet,
      }).address;
      expect(deriveBitcoinAccount(root, "testnet").address).toBe(refBtcTestnet);
    });
  }
});

describe("testnet Bitcoin uses BIP-84 coin type 1' (regression: was 0')", () => {
  const prf = hexToBytes(locked.vectors[0].prfBytesHex);

  it("deriveBitcoinAccount(testnet) derives at m/84'/1'/0'/0/0 and encodes tb1", () => {
    const { root } = prfBytesToRoot(prf, DEFAULT_SALT);
    const acct = deriveBitcoinAccount(root, "testnet");
    expect(acct.path).toBe("m/84'/1'/0'/0/0");
    expect(acct.address.startsWith("tb1")).toBe(true);
  });

  it("deriveAddresses({network:'testnet'}) reports the 1' path", () => {
    expect(deriveAddresses(prf, { network: "testnet" }).bitcoin.path).toBe("m/84'/1'/0'/0/0");
  });

  it("testnet address comes from the 1' key, NOT the old mainnet-path key", () => {
    const { root } = prfBytesToRoot(prf, DEFAULT_SALT);
    // The bug: testnet encoder over the mainnet (0') path key.
    const buggy = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(root.derive("m/84'/0'/0'/0/0").publicKey!),
      network: bitcoin.networks.testnet,
    }).address;
    const fixed = deriveBitcoinAccount(root, "testnet").address;
    expect(fixed).not.toBe(buggy);
    // ...and it matches the correct 1'-path key.
    const correct = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(root.derive("m/84'/1'/0'/0/0").publicKey!),
      network: bitcoin.networks.testnet,
    }).address;
    expect(fixed).toBe(correct);
  });
});

describe("golden external anchor (BIP-84 published test vector)", () => {
  // From BIP-0084's own test vectors.
  const MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  it("m/84'/0'/0'/0/0 == the BIP-84 published address", () => {
    const root = mnemonicToRoot(MNEMONIC);
    expect(deriveBitcoinAccount(root).address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  });

  it("Stacks address for the canonical mnemonic == @stacks/wallet-sdk", async () => {
    const root = mnemonicToRoot(MNEMONIC);
    const wallet = await generateWallet({ secretKey: MNEMONIC, password: "" });
    const refStx = getAddressFromPrivateKey(wallet.accounts[0]!.stxPrivateKey, "mainnet");
    expect(deriveStacksAccount(root, "mainnet").address).toBe(refStx);
  });
});

describe("determinism + salt universe", () => {
  const prf = hexToBytes(locked.vectors[0].prfBytesHex);

  it("same input → same wallet", () => {
    expect(deriveAddresses(prf)).toEqual(deriveAddresses(prf));
  });

  it("different salt → different, incompatible wallet universe", () => {
    const a = deriveAddresses(prf, { salt: DEFAULT_SALT });
    const b = deriveAddresses(prf, { salt: "some-other-app/v1" });
    expect(b.stacks.address).not.toBe(a.stacks.address);
    expect(b.bitcoin.address).not.toBe(a.bitcoin.address);
  });
});

describe("input validation", () => {
  it("rejects a PRF output that is not 32 bytes", () => {
    expect(() => prfBytesToMnemonic(new Uint8Array(16))).toThrow(InvalidPrfOutputError);
  });
});
