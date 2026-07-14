import { DEFAULT_SALT } from "../wallet-identity";
import { BackupNotAcknowledgedError, SeedAlreadyRevealedError } from "../errors";
import { prfBytesToMnemonic } from "../derivation/seed";
import { evaluatePrf } from "../prf/client";
import type { GetOptionsInput } from "../prf/options";

/**
 * Seed export / backup path (spec A3).
 *
 * Rules encoded here:
 *  - Gated behind a fresh passkey re-authentication (a new `get()`), performed
 *    immediately before the phrase is produced — see exportSeedPhrase().
 *  - The caller must have shown the multi-step warning and pass
 *    `acknowledgedBackupWarning: true`, or a typed error is thrown.
 *  - The mnemonic is displayed ONCE: SeedExport.reveal() yields it a single time
 *    and then forgets it. It is never logged or serialized (toString/toJSON are
 *    redacted) and never transmitted by the library.
 */

/**
 * A one-time holder for an exported mnemonic. Call `reveal()` exactly once to
 * display it; the value is cleared afterwards and never serialized.
 */
export class SeedExport {
  #mnemonic: string | null;

  constructor(mnemonic: string) {
    this.#mnemonic = mnemonic;
  }

  /** Return the mnemonic exactly once. Throws on any subsequent call. */
  reveal(): string {
    if (this.#mnemonic === null) throw new SeedAlreadyRevealedError();
    const mnemonic = this.#mnemonic;
    this.#mnemonic = null;
    return mnemonic;
  }

  get revealed(): boolean {
    return this.#mnemonic === null;
  }

  /** Redacted — never leak the phrase through logging or serialization. */
  toString(): string {
    return "[SeedExport — call reveal() once to display]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }
}

export interface SeedExportOptions {
  /** Must be true — set only after the user passes the multi-step backup warning. */
  acknowledgedBackupWarning: boolean;
  /** Overrides the frozen default salt (must match the wallet's derivation salt). */
  salt?: string;
}

/**
 * Build a SeedExport from PRF bytes the caller already obtained via a fresh
 * re-authentication. Prefer exportSeedPhrase(), which performs the re-auth.
 */
export function seedExportFromPrfBytes(
  prfBytes: Uint8Array,
  options: SeedExportOptions,
): SeedExport {
  if (!options.acknowledgedBackupWarning) throw new BackupNotAcknowledgedError();
  return new SeedExport(prfBytesToMnemonic(prfBytes, options.salt ?? DEFAULT_SALT));
}

export interface ExportSeedRequest extends GetOptionsInput {
  /** Must be true — set only after the user passes the multi-step backup warning. */
  acknowledgedBackupWarning: boolean;
}

/**
 * Fresh re-authentication → PRF → one-time SeedExport. The `get()` performed
 * inside is the "fresh passkey re-authentication immediately before display"
 * that A3 requires; the PRF bytes are zeroized before returning.
 */
export async function exportSeedPhrase(request: ExportSeedRequest): Promise<SeedExport> {
  if (!request.acknowledgedBackupWarning) throw new BackupNotAcknowledgedError();
  const salt = request.salt ?? DEFAULT_SALT;
  const bytes = await evaluatePrf({ ...request, salt });
  try {
    return new SeedExport(prfBytesToMnemonic(bytes, salt));
  } finally {
    bytes.fill(0);
  }
}

/**
 * The two backup-related actions the docs and UI MUST keep distinct (spec A3).
 * A single source of truth so host apps never conflate login-convenience with
 * funds-recovery.
 */
export const WALLET_ACTIONS = {
  addPasskey: {
    id: "add-passkey",
    title: "Add a passkey",
    purpose: "login-convenience",
    description:
      "Adds another way to sign in to the SAME wallet on a synced device. Does not " +
      "change your funds and is NOT a backup.",
  },
  restoreWallet: {
    id: "restore-wallet",
    title: "Restore my wallet",
    purpose: "funds-recovery",
    description:
      "Recovers your wallet from your exported seed phrase. This is the only way to " +
      "recover funds if you lose access to your passkey.",
  },
} as const;
