/** Base class for all errors thrown by this library, so host apps can catch broadly. */
export class PasskeyWalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown when the WebAuthn PRF extension is unavailable or cannot produce
 * usable bytes on the current browser/authenticator. Host apps should catch
 * this and fall back to an alternative flow (e.g. Leather/Xverse connect).
 * `reason` is a stable machine-readable code; `message` is human-readable.
 */
export class PrfUnsupportedError extends PasskeyWalletError {
  readonly reason: PrfUnsupportedReason;
  constructor(reason: PrfUnsupportedReason, message?: string) {
    super(message ?? `WebAuthn PRF unavailable: ${reason}`);
    this.reason = reason;
  }
}

export type PrfUnsupportedReason =
  | "no-webauthn" // navigator.credentials / PublicKeyCredential missing
  | "prf-not-processed" // browser ignored the extension entirely
  | "prf-not-enabled" // authenticator reported prf.enabled === false
  | "no-prf-results" // assertion returned no prf.results bytes
  | "ios-below-floor" // iOS/iPadOS below the 18.4 cross-device-consistency floor
  | "device-bound-authenticator"; // e.g. Windows Hello / hardware key — no synced bytes

/** Thrown when PRF output is present but not the expected shape/length. */
export class InvalidPrfOutputError extends PasskeyWalletError {}

/** Thrown when HD key derivation cannot produce the required key material. */
export class KeyDerivationError extends PasskeyWalletError {}

/** Thrown when seed export is attempted without acknowledging the backup warning (spec A3). */
export class BackupNotAcknowledgedError extends PasskeyWalletError {
  constructor() {
    super("Backup warning must be acknowledged before the seed phrase can be revealed.");
  }
}

/** Thrown when a one-time SeedExport is revealed more than once. */
export class SeedAlreadyRevealedError extends PasskeyWalletError {
  constructor() {
    super("Seed phrase was already revealed once; perform a fresh export to view it again.");
  }
}
