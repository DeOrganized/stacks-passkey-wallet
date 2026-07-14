/**
 * HD derivation paths (BIP-32/44/84/86).
 *
 * Verified (M1 diagnosis, V1) against the current source/docs of both Leather
 * and Xverse: for account 0 both wallets use byte-identical defaults, so a
 * single path per chain matches both.
 *   - Stacks:  m/44'/5757'/0'/0/0   (SLIP-44 coin type 5757)
 *   - Bitcoin: m/84'/0'/0'/0/0      (BIP-84 native SegWit, both wallets' default)
 *   - Bitcoin taproot (ordinals):   m/86'/0'/0'/0/0  (not a payment address)
 *
 * Multi-account indexing DIVERGES between wallets (Leather-software increments
 * the final index; Xverse and Leather-on-Ledger increment the account' field).
 * M1 derives account 0 only, where all variants coincide. The helpers below
 * document the account'-incrementing convention for future multi-account work.
 */

export const STACKS_PATH = "m/44'/5757'/0'/0/0";
export const BITCOIN_NATIVE_SEGWIT_PATH = "m/84'/0'/0'/0/0";
export const BITCOIN_TAPROOT_PATH = "m/86'/0'/0'/0/0";

/** Stacks account path. Account 0 = the interoperable default. */
export function stacksPath(accountIndex = 0): string {
  return `m/44'/5757'/${accountIndex}'/0/0`;
}

/** Bitcoin native-SegWit (BIP-84) path. Account 0 = the interoperable default. */
export function bitcoinNativeSegwitPath(accountIndex = 0): string {
  return `m/84'/0'/${accountIndex}'/0/0`;
}

/** Bitcoin taproot (BIP-86) path — ordinals/assets only, never a payment address. */
export function bitcoinTaprootPath(accountIndex = 0): string {
  return `m/86'/0'/${accountIndex}'/0/0`;
}
