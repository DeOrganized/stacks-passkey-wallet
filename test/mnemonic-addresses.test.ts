import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { hexToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";

import { deriveAddresses, deriveAddressesFromMnemonic } from "../src/derivation";
import { KeyDerivationError } from "../src/errors";

const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locked: any = JSON.parse(
  readFileSync(resolve(here, "vectors/derivation.vectors.json"), "utf8"),
);

describe("deriveAddressesFromMnemonic — frozen vectors", () => {
  for (const v of locked.vectors) {
    it(`${v.name}: phrase → same addresses as deriveAddresses(prf), mainnet and testnet`, () => {
      const prf = hexToBytes(v.prfBytesHex);

      const main = deriveAddressesFromMnemonic(v.mnemonic);
      expect(main).toEqual(deriveAddresses(prf, { salt: v.salt }));
      expect(main.stacks.address).toBe(v.stacks.address);
      expect(main.bitcoin.address).toBe(v.bitcoin.address);

      const test = deriveAddressesFromMnemonic(v.mnemonic, { network: "testnet" });
      expect(test).toEqual(deriveAddresses(prf, { salt: v.salt, network: "testnet" }));
      expect(test.bitcoin).toEqual(v.bitcoin_testnet);
    });
  }

  it("rejects a phrase that is not a valid BIP-39 mnemonic, without echoing it", () => {
    const words = locked.vectors[0].mnemonic.split(" ");
    const badChecksum = [...words.slice(0, -1), words[0]].join(" ");
    for (const phrase of ["not a real mnemonic at all", badChecksum]) {
      expect(() => deriveAddressesFromMnemonic(phrase)).toThrowError(KeyDerivationError);
      try {
        deriveAddressesFromMnemonic(phrase);
      } catch (e) {
        expect((e as Error).message).not.toContain(phrase);
      }
    }
  });
});

describe("deriveAddressesFromMnemonic — key material is wiped before return", () => {
  afterEach(() => vi.restoreAllMocks());

  // Reachable: every HDKey the call creates passes through HDKey.fromMasterSeed
  // (the root) or HDKey.prototype.deriveChild (every child). Wrapping both
  // captures each node's live private-key buffer — the getter returns the
  // instance's own buffer, not a copy — so the test can inspect exactly the
  // bytes that wipePrivateData() must zero.
  //
  // Not reachable, and therefore not asserted: temporaries inside the
  // dependencies — @scure/bip32's HMAC-SHA512 output and its slices, the child
  // tweak, BigInt scalars; the 64-byte BIP-39 seed (zeroed by mnemonicToRoot's
  // own finally, src/derivation/seed.ts, but an ESM namespace export cannot be
  // spied on). Those are released to garbage collection, the same boundary
  // src/memory.ts documents.
  function captureKeyBuffers(
    failOnDeriveChildCall?: number,
  ): { node: HDKey; live: Uint8Array; copy: Uint8Array }[] {
    const seen: { node: HDKey; live: Uint8Array; copy: Uint8Array }[] = [];
    const record = (node: HDKey): HDKey => {
      const live = node.privateKey!;
      seen.push({ node, live, copy: Uint8Array.from(live) });
      return node;
    };
    const fromMasterSeed = HDKey.fromMasterSeed.bind(HDKey);
    vi.spyOn(HDKey, "fromMasterSeed").mockImplementation((seed, versions) =>
      record(fromMasterSeed(seed, versions)),
    );
    const deriveChild = HDKey.prototype.deriveChild;
    let calls = 0;
    vi.spyOn(HDKey.prototype, "deriveChild").mockImplementation(function (
      this: HDKey,
      index: number,
    ) {
      if (++calls === failOnDeriveChildCall) throw new Error("injected");
      return record(deriveChild.call(this, index));
    });
    return seen;
  }

  for (const network of ["mainnet", "testnet"] as const) {
    it(`${network}: root + all 10 path nodes zero-filled, private keys detached`, () => {
      const seen = captureKeyBuffers();
      deriveAddressesFromMnemonic(locked.vectors[1].mnemonic, { network });

      // 1 root + 5 nodes on m/44'/5757'/0'/0/0 + 5 on m/84'/{0,1}'/0'/0/0.
      expect(seen).toHaveLength(11);
      for (const { node, live, copy } of seen) {
        expect(copy.some((b) => b !== 0)).toBe(true); // it was a real key
        expect(live.every((b) => b === 0)).toBe(true); // and it is zero now
        expect(node.privateKey).toBeNull();
      }
    });
  }

  it("wipes on the throw path too", () => {
    const seen = captureKeyBuffers(3);

    expect(() => deriveAddressesFromMnemonic(locked.vectors[1].mnemonic)).toThrow("injected");
    expect(seen).toHaveLength(3); // root + the two children created before the failure
    for (const { node, live } of seen) {
      expect(live.every((b) => b === 0)).toBe(true);
      expect(node.privateKey).toBeNull();
    }
  });
});
