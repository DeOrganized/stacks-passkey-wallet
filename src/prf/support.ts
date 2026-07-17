import { PrfUnsupportedError } from "../errors";

/**
 * Platform support detection for WebAuthn PRF (spec A1.4).
 *
 * The launch-supported providers with byte-identical PRF across a user's synced
 * devices are iCloud Keychain (iOS/iPadOS 18.4+, macOS 15.4+) and Google
 * Password Manager. The iOS 18.4 floor is a HARD check here — not a docs note —
 * because iOS 18.0–18.3 can return different PRF bytes for the same passkey via
 * QR-hybrid vs. local (a funds-loss-class inconsistency).
 */

/** Minimum iOS/iPadOS version with reliable cross-device PRF consistency. */
export const IOS_PRF_FLOOR = { major: 18, minor: 4 } as const;

export interface PlatformInfo {
  userAgent: string;
  isWebAuthnAvailable: boolean;
}

/** Parse an iOS/iPadOS version from a UA string. Null if not an Apple mobile UA. */
export function parseApplePlatformVersion(
  userAgent: string,
): { major: number; minor: number } | null {
  if (!/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return null;
  const match = userAgent.match(/(?:iPhone )?OS (\d+)_(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** True for iOS/iPadOS strictly below the 18.4 PRF-consistency floor. */
export function isIosBelowPrfFloor(userAgent: string): boolean {
  const v = parseApplePlatformVersion(userAgent);
  if (!v) return false;
  return v.major < IOS_PRF_FLOOR.major || (v.major === IOS_PRF_FLOOR.major && v.minor < IOS_PRF_FLOOR.minor);
}

/** True for a Windows desktop UA (whose passkey dialog defaults to Windows Hello). */
export function isWindows(userAgent: string): boolean {
  return /\bWindows NT\b/.test(userAgent);
}

export interface ProviderGuidance {
  /** Whether the host should actively steer the user to a synced provider. */
  steer: boolean;
  message: string;
  recommended: string[];
}

/**
 * Create-flow guidance. On Windows we steer to a synced provider (Google
 * Password Manager or QR-to-phone), because Windows Hello supports PRF but is
 * device-bound — a Hello-derived wallet would silently be single-device and
 * collide with the new-passkey trap. Windows *users* are supported (via GPM);
 * Windows Hello *as key-holder* is not.
 */
export function providerGuidance(userAgent: string): ProviderGuidance {
  if (isWindows(userAgent)) {
    return {
      steer: true,
      message:
        "On Windows, create your wallet passkey with Google Password Manager or by " +
        "scanning the QR code with your phone. Windows Hello can't sync your wallet " +
        "to other devices.",
      recommended: ["Google Password Manager", "QR to phone (iCloud Keychain / GPM)"],
    };
  }
  return { steer: false, message: "", recommended: [] };
}

/** Best-effort snapshot of the current runtime's WebAuthn availability. */
export function currentPlatformInfo(): PlatformInfo {
  const ua = typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
  const isWebAuthnAvailable =
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials;
  return { userAgent: ua, isWebAuthnAvailable };
}

/**
 * Throw a typed `PrfUnsupportedError` for platforms known to be unusable BEFORE
 * attempting a ceremony. This is the hard gate; the ground-truth check is still
 * a real `get()` that returns PRF bytes (see evaluatePrf).
 */
export function assertPlatformSupportsPrf(info: PlatformInfo = currentPlatformInfo()): void {
  if (!info.isWebAuthnAvailable) {
    throw new PrfUnsupportedError("no-webauthn", "WebAuthn is not available in this browser.");
  }
  if (isIosBelowPrfFloor(info.userAgent)) {
    throw new PrfUnsupportedError(
      "ios-below-floor",
      "iOS/iPadOS 18.4 or later is required for a passkey wallet (earlier versions can derive inconsistent keys across devices).",
    );
  }
}

/**
 * WebAuthn authenticator-data flag: Backup Eligibility (BE), bit 3 of the flags
 * byte (W3C WebAuthn §6.1). When set, the credential is eligible to be backed up
 * and synced across the user's devices (iCloud Keychain, Google Password
 * Manager). When clear, the credential is DEVICE-BOUND (Windows Hello, most
 * security keys) — a wallet derived from it exists on one device only and cannot
 * be restored via synced-passkey behavior.
 */
export const BACKUP_ELIGIBLE_FLAG = 0x08;

/**
 * Read the flags byte from authenticator data. It sits at a fixed offset — right
 * after the 32-byte RP ID hash — in both the attestation authData
 * (AuthenticatorAttestationResponse.getAuthenticatorData(), create) and the
 * assertion authData (AuthenticatorAssertionResponse.authenticatorData, get).
 *
 * Throws `device-bound-authenticator` if the data is too short to contain the
 * flags byte: an unreadable credential cannot be certified as syncable, so it is
 * rejected conservatively (a wallet must never be built on an unverifiable one).
 */
export function authenticatorDataFlags(authData: Uint8Array): number {
  // 32-byte rpIdHash + 1 flags byte → at least 33 bytes (real authData is ≥ 37).
  if (authData.length < 33) {
    throw new PrfUnsupportedError(
      "device-bound-authenticator",
      "Authenticator data too short to read the backup-eligibility flag.",
    );
  }
  return authData[32]!;
}

/**
 * Whether a credential is backup-eligible (a SYNCED passkey) rather than
 * device-bound. Callers must reject a non-synced credential before deriving a
 * wallet (spec A1.4) — it would silently produce a single-device, non-restorable
 * wallet. Pure and unit-testable; pass either the create- or get-time authData.
 */
export function isSyncedCredential(authData: Uint8Array): boolean {
  return (authenticatorDataFlags(authData) & BACKUP_ELIGIBLE_FLAG) !== 0;
}
