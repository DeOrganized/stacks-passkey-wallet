import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  AuthType,
  deserializeTransaction,
  emptyMessageSignature,
  isSingleSig,
  publicKeyFromSignatureVrs,
  sigHashPreSign,
} from "@stacks/transactions";

import { OriginAddressMismatchError, UnprotectedAssetMovementError } from "../src/errors";
import { signStacksTransaction } from "../src/signing";
import { DEFAULT_SALT } from "../src/wallet-identity";

const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locked: any = JSON.parse(
  readFileSync(resolve(here, "vectors/signing.vectors.json"), "utf8"),
);

const ERRORS = {
  UnprotectedAssetMovementError,
  OriginAddressMismatchError,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const positive = locked.vectors.filter((v: any) => !v.expected.error);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const negative = locked.vectors.filter((v: any) => v.expected.error);

describe("frozen signing vectors — header", () => {
  it("names the frozen salt and the synthetic PRF corpus", () => {
    expect(locked.salt).toBe(DEFAULT_SALT);
    expect(locked.prfCorpus.signer).toBe("07".repeat(32));
    expect(locked.prfCorpus.foreign).toBe("08".repeat(32));
  });

  it("covers all seven spec classes exactly once", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(locked.vectors.map((v: any) => v.class).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Classes 1, 2, 3, 4, 7 sign; classes 5 and 6 refuse. Class 3's asserted
    // absence of a txid is the third negative assertion, on a positive entry.
    expect(positive.length).toBe(5);
    expect(negative.length).toBe(2);
  });
});

describe("frozen signing vectors — positive classes reproduce byte-for-byte", () => {
  for (const v of positive) {
    it(`class ${v.class}: ${v.name}`, () => {
      const prf = hexToBytes(v.signerPrfBytesHex);
      const tx = deserializeTransaction(v.unsignedHex);
      const result = signStacksTransaction(prf, tx, { ...v.options, salt: v.salt });

      expect(result.kind).toBe(v.expected.kind);
      expect(bytesToHex(result.transaction)).toBe(v.expected.signedHex);
      expect(result.publicKey).toBe(v.expected.publicKey);
      expect(result.publicKey).toBe(locked.signerPublicKey);

      if (v.expected.kind === "complete") {
        expect(result.kind === "complete" && result.txid).toBe(v.expected.txid);
      } else {
        expect(v.expected.txid).toBeNull();
        expect("txid" in result).toBe(false);
      }
    });
  }
});

describe("frozen signing vectors — negative controls", () => {
  for (const v of negative) {
    it(`class ${v.class}: ${v.name} → ${v.expected.error}`, () => {
      const prf = hexToBytes(v.signerPrfBytesHex);
      const tx = deserializeTransaction(v.unsignedHex);
      let caught: unknown;
      try {
        signStacksTransaction(prf, tx, { ...v.options, salt: v.salt });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ERRORS[v.expected.error as keyof typeof ERRORS]);
      expect((caught as Error).name).toBe(v.expected.error);
      if (v.expected.error === "OriginAddressMismatchError") {
        const err = caught as OriginAddressMismatchError;
        expect(err.derivedAddress).toBe(v.expected.derivedAddress);
        expect(err.originAddress).toBe(v.expected.originAddress);
        expect(err.originAddress).toBe(v.originAddress);
      }
      // Nothing was signed.
      const cond = tx.auth.spendingCondition;
      expect(isSingleSig(cond) && cond.signature.data).toBe(emptyMessageSignature().data);
    });
  }
});

describe("frozen signing vectors — independent verification of the frozen bytes", () => {
  // These checks never call the library's signer: they deserialize the frozen
  // signed bytes with @stacks/transactions, verify the origin signature, recover
  // the public key, recompute the txid, and prove that only the signature differs
  // from the frozen unsigned bytes.
  for (const v of positive) {
    it(`class ${v.class}: ${v.name}`, () => {
      const parsed = deserializeTransaction(v.expected.signedHex);
      expect(() => parsed.verifyOrigin()).not.toThrow();

      const cond = parsed.auth.spendingCondition;
      if (!isSingleSig(cond)) throw new Error("single-sig origin expected");
      const preSign = sigHashPreSign(parsed.verifyBegin(), AuthType.Standard, cond.fee, cond.nonce);
      expect(publicKeyFromSignatureVrs(preSign, cond.signature.data, cond.keyEncoding)).toBe(
        locked.signerPublicKey,
      );

      expect(parsed.auth.authType).toBe(
        v.input.sponsored ? AuthType.Sponsored : AuthType.Standard,
      );
      if (v.expected.kind === "complete") {
        expect(parsed.txid()).toBe(v.expected.txid);
      }

      cond.signature = emptyMessageSignature();
      expect(parsed.serialize()).toBe(v.unsignedHex);
    });
  }
});
