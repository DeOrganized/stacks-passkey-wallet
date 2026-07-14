/**
 * stacks-passkey-wallet — passkey-derived wallet reference library.
 *
 * WebAuthn PRF → HKDF → BIP-39 mnemonic → BIP-32 HD wallet for Stacks + Bitcoin.
 * Clean-room from the WebAuthn PRF, BIP-39, BIP-32/44/84 and RFC 5869 specs.
 *
 * Public API (Part A / Milestone 1 — derivation core first):
 */

// Frozen wallet-identity constants (salt, HKDF params, entropy length).
export * from "./wallet-identity";

// Typed errors for host-app fallback handling.
export * from "./errors";

// Derivation: paths, seed pipeline, per-chain accounts, and the convenience API.
export * from "./derivation";

// Signing: Stacks message signing + Bitcoin PSBT signing (derive → sign → discard).
export * from "./signing";

// PRF layer: passkey create/evaluate, support detection, provider steering.
export * from "./prf";
