import { describe, expect, it } from "vitest";

import {
  BACKUP_ELIGIBLE_FLAG,
  assertPlatformSupportsPrf,
  authenticatorDataFlags,
  isIosBelowPrfFloor,
  isSyncedCredential,
  isWindows,
  parseApplePlatformVersion,
  providerGuidance,
} from "../src/prf/support";
import {
  PRF_USER_VERIFICATION,
  buildCreateOptions,
  buildGetOptions,
  readPrfBytes,
  readPrfEnabled,
  saltToBytes,
} from "../src/prf/options";
import { InvalidPrfOutputError, PrfUnsupportedError } from "../src/errors";

const UA = {
  ios183:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  ios184:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  ios191:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 Version/19.1 Mobile/15E148 Safari/604.1",
  ipad183: "Mozilla/5.0 (iPad; CPU OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
  macos: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
};

describe("iOS 18.4 PRF floor (hard check)", () => {
  it("parses iPhone and iPad versions", () => {
    expect(parseApplePlatformVersion(UA.ios183)).toEqual({ major: 18, minor: 3 });
    expect(parseApplePlatformVersion(UA.ipad183)).toEqual({ major: 18, minor: 3 });
    expect(parseApplePlatformVersion(UA.macos)).toBeNull();
    expect(parseApplePlatformVersion(UA.android)).toBeNull();
  });

  it("flags iOS/iPadOS below 18.4, passes 18.4+", () => {
    expect(isIosBelowPrfFloor(UA.ios183)).toBe(true);
    expect(isIosBelowPrfFloor(UA.ipad183)).toBe(true);
    expect(isIosBelowPrfFloor(UA.ios184)).toBe(false);
    expect(isIosBelowPrfFloor(UA.ios191)).toBe(false);
    expect(isIosBelowPrfFloor(UA.android)).toBe(false);
    expect(isIosBelowPrfFloor(UA.macos)).toBe(false);
  });

  it("assertPlatformSupportsPrf throws ios-below-floor for iOS 18.3", () => {
    expect(() =>
      assertPlatformSupportsPrf({ userAgent: UA.ios183, isWebAuthnAvailable: true }),
    ).toThrowError(PrfUnsupportedError);
    try {
      assertPlatformSupportsPrf({ userAgent: UA.ios183, isWebAuthnAvailable: true });
    } catch (e) {
      expect((e as PrfUnsupportedError).reason).toBe("ios-below-floor");
    }
    // 18.4 passes the platform gate.
    expect(() =>
      assertPlatformSupportsPrf({ userAgent: UA.ios184, isWebAuthnAvailable: true }),
    ).not.toThrow();
  });

  it("throws no-webauthn when WebAuthn is unavailable", () => {
    try {
      assertPlatformSupportsPrf({ userAgent: UA.ios184, isWebAuthnAvailable: false });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as PrfUnsupportedError).reason).toBe("no-webauthn");
    }
  });
});

describe("Windows → synced-provider steering", () => {
  it("steers Windows users to a synced provider", () => {
    const g = providerGuidance(UA.windows);
    expect(isWindows(UA.windows)).toBe(true);
    expect(g.steer).toBe(true);
    expect(g.message).toMatch(/Google Password Manager/);
  });

  it("does not steer non-Windows platforms", () => {
    expect(providerGuidance(UA.ios184).steer).toBe(false);
    expect(providerGuidance(UA.macos).steer).toBe(false);
  });
});

describe("UV- and salt-consistency between create and get", () => {
  const create = buildCreateOptions({
    rpName: "DeOrganized",
    rpId: "deorganized.com",
    userId: new Uint8Array([1, 2, 3]),
    userName: "alice",
    challenge: new Uint8Array(32).fill(9),
    salt: "stacks-passkey-wallet/v1",
  });
  const get = buildGetOptions({
    challenge: new Uint8Array(32).fill(8),
    rpId: "deorganized.com",
    salt: "stacks-passkey-wallet/v1",
  });

  it("create and get request identical userVerification (UV-consistency)", () => {
    expect(create.authenticatorSelection?.userVerification).toBe(PRF_USER_VERIFICATION);
    expect(get.userVerification).toBe(PRF_USER_VERIFICATION);
    expect(create.authenticatorSelection?.userVerification).toBe(get.userVerification);
  });

  it("create and get evaluate identical salt bytes", () => {
    expect(create.extensions.prf.eval.first).toEqual(get.extensions.prf.eval.first);
    expect(get.extensions.prf.eval.first).toEqual(saltToBytes("stacks-passkey-wallet/v1"));
  });
});

describe("PRF result parsing (failure shapes → typed errors)", () => {
  const bytes32 = new Uint8Array(32).fill(0xab);

  it("returns bytes from Uint8Array and ArrayBuffer results", () => {
    expect(readPrfBytes({ prf: { results: { first: bytes32 } } })).toHaveLength(32);
    expect(readPrfBytes({ prf: { results: { first: bytes32.buffer } } })).toHaveLength(32);
  });

  it("distinguishes each unsupported shape", () => {
    const reasonOf = (v: unknown): string => {
      try {
        readPrfBytes(v);
        return "no-throw";
      } catch (e) {
        return (e as PrfUnsupportedError).reason;
      }
    };
    expect(reasonOf({})).toBe("prf-not-processed"); // browser ignored the extension
    expect(reasonOf({ prf: {} })).toBe("no-prf-results"); // present but no bytes
    expect(reasonOf({ prf: { enabled: false } })).toBe("no-prf-results");
  });

  it("rejects wrong-length PRF output", () => {
    expect(() => readPrfBytes({ prf: { results: { first: new Uint8Array(16) } } })).toThrowError(
      InvalidPrfOutputError,
    );
  });

  it("readPrfEnabled reflects the create-time enabled flag", () => {
    expect(readPrfEnabled({ prf: { enabled: true } })).toBe(true);
    expect(readPrfEnabled({ prf: { enabled: false } })).toBe(false);
    expect(readPrfEnabled({})).toBe(false);
  });
});

describe("device-bound detection (backup-eligibility flag)", () => {
  // Minimal authenticator data: 32-byte rpIdHash + flags byte + 4-byte signCount.
  const authData = (flags: number): Uint8Array => {
    const bytes = new Uint8Array(37);
    bytes[32] = flags;
    return bytes;
  };
  const UP = 0x01;
  const UV = 0x04;

  it("reads the flags byte at the fixed offset (after the 32-byte rpIdHash)", () => {
    expect(authenticatorDataFlags(authData(UP | UV | BACKUP_ELIGIBLE_FLAG))).toBe(
      UP | UV | BACKUP_ELIGIBLE_FLAG,
    );
  });

  it("treats a backup-eligible credential as synced", () => {
    expect(isSyncedCredential(authData(UP | UV | BACKUP_ELIGIBLE_FLAG))).toBe(true);
  });

  it("treats a credential without the BE flag as device-bound", () => {
    expect(isSyncedCredential(authData(UP | UV))).toBe(false);
  });

  it("rejects authenticator data too short to hold the flags byte", () => {
    try {
      isSyncedCredential(new Uint8Array(10));
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PrfUnsupportedError);
      expect((e as PrfUnsupportedError).reason).toBe("device-bound-authenticator");
    }
  });
});
