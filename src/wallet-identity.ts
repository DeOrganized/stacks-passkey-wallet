/**
 * FROZEN WALLET-IDENTITY DEFINITION
 * =================================
 * These constants, together with the locked test vectors in
 * `test/vectors/derivation.vectors.json`, define the deterministic mapping
 * from a WebAuthn PRF output to a wallet. Changing ANY value here changes
 * every wallet the library derives — it is a hard breaking change that
 * produces a different, incompatible "wallet universe".
 *
 * See `docs/wallet-identity.md` for the full rationale and change policy.
 * Clean-room implementation from the BIP-39, BIP-32, and RFC 5869 (HKDF) specs.
 */

/**
 * Default PRF salt. Passed to the WebAuthn PRF extension as the `first`
 * evaluation input and bound into the HKDF step below. Host apps MAY override
 * it, but each distinct salt defines a distinct, incompatible wallet universe:
 * the SAME passkey under a different salt yields a completely different wallet.
 *
 * Note (WebAuthn detail): the browser does not use this value directly — it
 * evaluates `SHA-256("WebAuthn PRF" || 0x00 || salt)` as the CTAP2 hmac-secret
 * salt. That transform is applied by the client, so the library only needs to
 * supply the UTF-8 bytes of this string.
 */
export const DEFAULT_SALT = "stacks-passkey-wallet/v1";

/** Required length, in bytes, of the PRF output consumed by the library. */
export const PRF_BYTES_LENGTH = 32;

/**
 * HKDF-SHA256 (RFC 5869) parameters used to turn the PRF output into BIP-39
 * entropy. `ikm` = the 32 PRF bytes; `salt` = UTF-8 of the (possibly
 * overridden) PRF salt, so the salt binds the universe at this step too;
 * `info` = the fixed context string below; `length` = ENTROPY_BYTES.
 */
export const HKDF_INFO = "stacks-passkey-wallet/bip39-entropy/v1";

/** BIP-39 entropy length in bytes. 32 bytes → 256 bits → 24-word mnemonic. */
export const ENTROPY_BYTES = 32;

/** Number of words in the generated BIP-39 mnemonic (derived from ENTROPY_BYTES). */
export const BIP39_MNEMONIC_WORDS = 24;
