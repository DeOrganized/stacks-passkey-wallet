import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";

import { DEFAULT_SALT, ENTROPY_BYTES, HKDF_INFO, PRF_BYTES_LENGTH } from "../wallet-identity";
import { InvalidPrfOutputError } from "../errors";

/**
 * Deterministic pipeline (frozen — see src/wallet-identity.ts):
 *   PRF bytes --HKDF-SHA256--> BIP-39 entropy --> mnemonic --> BIP-32 root
 *
 * The HKDF step (RFC 5869) is domain separation + a uniform expansion of the
 * PRF output; the salt is bound in so overriding it yields a distinct universe.
 */

/** HKDF-SHA256 the PRF output into fixed-length BIP-39 entropy. */
export function prfBytesToEntropy(prfBytes: Uint8Array, salt: string = DEFAULT_SALT): Uint8Array {
  if (prfBytes.length !== PRF_BYTES_LENGTH) {
    throw new InvalidPrfOutputError(
      `PRF output must be ${PRF_BYTES_LENGTH} bytes, got ${prfBytes.length}`,
    );
  }
  return hkdf(sha256, prfBytes, utf8ToBytes(salt), utf8ToBytes(HKDF_INFO), ENTROPY_BYTES);
}

/** PRF output → BIP-39 mnemonic (24 words). */
export function prfBytesToMnemonic(prfBytes: Uint8Array, salt: string = DEFAULT_SALT): string {
  const entropy = prfBytesToEntropy(prfBytes, salt);
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

/** BIP-39 mnemonic → BIP-32 HD root node (no passphrase, per spec A1). */
export function mnemonicToRoot(mnemonic: string): HDKey {
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    return HDKey.fromMasterSeed(seed);
  } finally {
    seed.fill(0);
  }
}

/** PRF output → { mnemonic, BIP-32 root }. Caller owns discarding the secrets. */
export function prfBytesToRoot(
  prfBytes: Uint8Array,
  salt: string = DEFAULT_SALT,
): { mnemonic: string; root: HDKey } {
  const mnemonic = prfBytesToMnemonic(prfBytes, salt);
  const root = mnemonicToRoot(mnemonic);
  return { mnemonic, root };
}
