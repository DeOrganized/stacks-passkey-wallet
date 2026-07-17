import {
  deriveAddresses,
  type DeriveAddressesOptions,
  type DerivedAddresses,
} from "../derivation";
import { DEFAULT_SALT } from "../wallet-identity";
import { PrfUnsupportedError } from "../errors";
import {
  buildCreateOptions,
  buildGetOptions,
  getPrfOutput,
  readPrfBytes,
  type CreateOptionsInput,
  type GetOptionsInput,
} from "./options";
import { assertPlatformSupportsPrf, isSyncedCredential } from "./support";

/**
 * Thin async wrappers over navigator.credentials. Ground-truth PRF support is a
 * real get() that returns bytes; the pure builders/readers/detectors carry the
 * unit-testable logic. End-to-end PRF behavior is covered by M2 browser tests.
 */

function requireWebAuthn(): void {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new PrfUnsupportedError("no-webauthn");
  }
}

/**
 * Create a passkey with the PRF extension requested. Throws `PrfUnsupportedError`
 * if PRF isn't enabled, or if the authenticator is device-bound (not backup-
 * eligible) — a device-bound wallet is single-device and non-restorable, so it is
 * rejected here, before any derivation, rather than only steered against in UX.
 */
export async function createPasskey(input: CreateOptionsInput): Promise<PublicKeyCredential> {
  assertPlatformSupportsPrf();
  requireWebAuthn();
  const publicKey = buildCreateOptions(input) as unknown as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new PrfUnsupportedError("no-webauthn", "Passkey creation returned no credential.");
  }
  const prf = getPrfOutput(credential.getClientExtensionResults());
  if (!prf) throw new PrfUnsupportedError("prf-not-processed");
  if (prf.enabled !== true) throw new PrfUnsupportedError("prf-not-enabled");

  // Reject device-bound authenticators via the Backup Eligibility flag in the
  // attestation authenticator data. `getAuthenticatorData()` is baseline in every
  // PRF-capable browser; if it's somehow unavailable we cannot certify the
  // credential is syncable, so we reject conservatively.
  const response = credential.response as unknown as { getAuthenticatorData?: () => ArrayBuffer };
  if (typeof response.getAuthenticatorData !== "function") {
    throw new PrfUnsupportedError(
      "device-bound-authenticator",
      "Cannot read authenticator data to confirm a synced (backup-eligible) credential.",
    );
  }
  if (!isSyncedCredential(new Uint8Array(response.getAuthenticatorData()))) {
    throw new PrfUnsupportedError("device-bound-authenticator");
  }
  return credential;
}

/** Evaluate PRF via a dedicated get() and return the 32 wallet bytes. */
export async function evaluatePrf(input: GetOptionsInput): Promise<Uint8Array> {
  assertPlatformSupportsPrf();
  requireWebAuthn();
  const publicKey = buildGetOptions(input) as unknown as PublicKeyCredentialRequestOptions;
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) {
    throw new PrfUnsupportedError("no-prf-results", "Assertion returned no credential.");
  }
  return readPrfBytes(assertion.getClientExtensionResults());
}

/** Convenience: dedicated get() → PRF bytes → account-0 Stacks + Bitcoin addresses. */
export async function deriveAddressesFromPasskey(
  input: GetOptionsInput,
  options: DeriveAddressesOptions = {},
): Promise<DerivedAddresses> {
  const salt = input.salt ?? options.salt ?? DEFAULT_SALT;
  const bytes = await evaluatePrf({ ...input, salt });
  try {
    return deriveAddresses(bytes, { ...options, salt });
  } finally {
    bytes.fill(0);
  }
}
