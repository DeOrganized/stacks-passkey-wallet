import { utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_SALT, PRF_BYTES_LENGTH } from "../wallet-identity";
import { InvalidPrfOutputError, PrfUnsupportedError } from "../errors";

/**
 * WebAuthn ceremony option builders and PRF result readers.
 *
 * Two invariants the wallet depends on (spec A1/A1.4):
 *   1. create() and get() request the SAME `userVerification` — CTAP2 keeps
 *      separate UV / non-UV PRFs, so a mismatch yields different bytes.
 *   2. create() and get() evaluate the SAME salt bytes.
 * Both are enforced by routing through the constants/helpers here.
 */

/** Single source of truth for UV across create and get (see invariant 1). */
export const PRF_USER_VERIFICATION: UserVerificationRequirement = "required";

/** The salt string → the bytes handed to the PRF extension's `eval.first`. */
export function saltToBytes(salt: string = DEFAULT_SALT): Uint8Array {
  return utf8ToBytes(salt);
}

// Local PRF extension shapes — the DOM lib does not yet type the `prf` extension.
interface PrfExtensionInput {
  prf: { eval: { first: Uint8Array } };
}
interface PrfExtensionOutput {
  enabled?: boolean;
  results?: { first?: ArrayBuffer | Uint8Array; second?: ArrayBuffer | Uint8Array };
}

// Standalone builder-output shapes (typed with Uint8Array for testability); cast
// to the DOM's CredentialCreation/RequestOptions only at the navigator boundary.
export interface CredentialParam {
  type: "public-key";
  alg: number;
}

export interface BuiltCreateOptions {
  rp: { name: string; id?: string };
  user: { id: Uint8Array; name: string; displayName: string };
  challenge: Uint8Array;
  pubKeyCredParams: CredentialParam[];
  authenticatorSelection: {
    userVerification: UserVerificationRequirement;
    residentKey: "required";
    requireResidentKey: true;
  };
  timeout?: number;
  extensions: PrfExtensionInput;
}

export interface BuiltGetOptions {
  challenge: Uint8Array;
  userVerification: UserVerificationRequirement;
  rpId?: string;
  allowCredentials?: Array<{ type: "public-key"; id: Uint8Array }>;
  timeout?: number;
  extensions: PrfExtensionInput;
}

export interface CreateOptionsInput {
  rpName: string;
  rpId?: string;
  userId: Uint8Array;
  userName: string;
  userDisplayName?: string;
  challenge: Uint8Array;
  salt?: string;
  timeoutMs?: number;
}

export interface GetOptionsInput {
  challenge: Uint8Array;
  salt?: string;
  rpId?: string;
  allowCredentialIds?: Uint8Array[];
  timeoutMs?: number;
}

export function buildCreateOptions(input: CreateOptionsInput): BuiltCreateOptions {
  const options: BuiltCreateOptions = {
    rp: { name: input.rpName, id: input.rpId },
    user: {
      id: input.userId,
      name: input.userName,
      displayName: input.userDisplayName ?? input.userName,
    },
    challenge: input.challenge,
    // ES256 then RS256.
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      userVerification: PRF_USER_VERIFICATION,
      residentKey: "required",
      requireResidentKey: true,
    },
    extensions: { prf: { eval: { first: saltToBytes(input.salt) } } },
  };
  if (input.timeoutMs !== undefined) options.timeout = input.timeoutMs;
  return options;
}

export function buildGetOptions(input: GetOptionsInput): BuiltGetOptions {
  const options: BuiltGetOptions = {
    challenge: input.challenge,
    userVerification: PRF_USER_VERIFICATION,
    extensions: { prf: { eval: { first: saltToBytes(input.salt) } } },
  };
  if (input.rpId !== undefined) options.rpId = input.rpId;
  if (input.allowCredentialIds) {
    options.allowCredentials = input.allowCredentialIds.map(
      (id): { type: "public-key"; id: Uint8Array } => ({ type: "public-key", id }),
    );
  }
  if (input.timeoutMs !== undefined) options.timeout = input.timeoutMs;
  return options;
}

/** Read the `prf` extension output from a credential's client extension results. */
export function getPrfOutput(extensionResults: unknown): PrfExtensionOutput | undefined {
  return (extensionResults as { prf?: PrfExtensionOutput } | null | undefined)?.prf;
}

/** True only if the authenticator reported `prf.enabled === true` (create-time). */
export function readPrfEnabled(extensionResults: unknown): boolean {
  return getPrfOutput(extensionResults)?.enabled === true;
}

/**
 * Extract the 32 PRF bytes from an assertion's extension results, or throw a
 * typed error for each distinguishable failure shape (spec A1.4).
 */
export function readPrfBytes(extensionResults: unknown): Uint8Array {
  const prf = getPrfOutput(extensionResults);
  if (!prf) throw new PrfUnsupportedError("prf-not-processed");
  const first = prf.results?.first;
  if (!first) throw new PrfUnsupportedError("no-prf-results");
  const bytes = first instanceof Uint8Array ? first : new Uint8Array(first);
  if (bytes.length !== PRF_BYTES_LENGTH) {
    throw new InvalidPrfOutputError(
      `PRF output must be ${PRF_BYTES_LENGTH} bytes, got ${bytes.length}`,
    );
  }
  return bytes;
}
