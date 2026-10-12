import { HARDENED_OFFSET, type HDKey } from "@scure/bip32";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as btc from "@scure/btc-signer";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getAddressFromPublicKey } from "@stacks/transactions";

import { DEFAULT_SALT } from "../wallet-identity";
import { KeyDerivationError } from "../errors";
import { STACKS_PATH, bitcoinNativeSegwitPath } from "./paths";
import { mnemonicToRoot, prfBytesToRoot } from "./seed";
import { deriveStacksAccount, type StacksAccount, type StacksNetwork } from "./stacks";
import { deriveBitcoinAccount, type BitcoinAccount } from "./bitcoin";

export * from "./paths";
// PRF bytes → seed material (prfBytesToEntropy / prfBytesToMnemonic /
// prfBytesToRoot) is deliberately NOT exported: the only public path from PRF
// bytes to the phrase is the gated exportSeedPhrase() ceremony. Internal
// callers import those helpers from ./seed directly.
export { mnemonicToRoot } from "./seed";
export { deriveStacksAccount, type StacksAccount, type StacksNetwork } from "./stacks";
export { deriveBitcoinAccount, type BitcoinAccount } from "./bitcoin";

export interface DeriveAddressesOptions {
  /** Overrides the frozen default salt — defines a distinct wallet universe. */
  salt?: string;
  network?: "mainnet" | "testnet";
}

export interface DerivedAddresses {
  stacks: StacksAccount;
  bitcoin: BitcoinAccount;
}

/**
 * Convenience: PRF output → the account-0 Stacks + Bitcoin addresses, with the
 * key material discarded before returning. No secrets are returned; use the
 * gated export flow for the mnemonic.
 */
export function deriveAddresses(
  prfBytes: Uint8Array,
  options: DeriveAddressesOptions = {},
): DerivedAddresses {
  const salt = options.salt ?? DEFAULT_SALT;
  const network: StacksNetwork = options.network ?? "mainnet";

  const { root } = prfBytesToRoot(prfBytes, salt);
  try {
    return {
      stacks: deriveStacksAccount(root, network),
      bitcoin: deriveBitcoinAccount(root, network),
    };
  } finally {
    root.wipePrivateData();
  }
}

export interface DeriveAddressesFromMnemonicOptions {
  network?: "mainnet" | "testnet";
}

/** BIP-32 path string → child indices ("m/44'/0" → [44 + 2^31, 0]). */
function pathIndices(path: string): number[] {
  return path
    .replace(/^m\//, "")
    .split("/")
    .map((part) =>
      part.endsWith("'") ? Number(part.slice(0, -1)) + HARDENED_OFFSET : Number(part),
    );
}

/**
 * Walk `path` from `root` one child at a time and return the final node's
 * compressed public key. Every node created along the way — intermediates and
 * the final child — has its private key zero-filled before this returns, on
 * success and on throw. The root itself is the caller's to wipe.
 */
function publicKeyAt(root: HDKey, path: string): Uint8Array {
  let node = root;
  try {
    for (const index of pathIndices(path)) {
      const parent = node;
      node = parent.deriveChild(index);
      if (parent !== root) parent.wipePrivateData();
    }
    if (!node.publicKey) throw new KeyDerivationError("Derivation produced no public key");
    return node.publicKey;
  } finally {
    if (node !== root) node.wipePrivateData();
  }
}

/**
 * The sanctioned "what addresses does this phrase control" call: an already
 * revealed BIP-39 mnemonic → the account-0 Stacks + Bitcoin addresses, in the
 * same shape deriveAddresses() returns for the PRF bytes that produced that
 * phrase. For checking a phrase after exportSeedPhrase() has revealed it (e.g.
 * confirming it belongs to the signed-in account) without a second ceremony.
 *
 * Addresses are computed from public keys only. The HD root and every derived
 * node's private key are zero-filled before return; the BIP-39 seed is zeroed
 * inside mnemonicToRoot(). Nothing is logged. Throws KeyDerivationError for a
 * phrase that is not a valid English BIP-39 mnemonic (the message never
 * includes the phrase).
 */
export function deriveAddressesFromMnemonic(
  mnemonic: string,
  options: DeriveAddressesFromMnemonicOptions = {},
): DerivedAddresses {
  const network = options.network ?? "mainnet";
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new KeyDerivationError("Not a valid BIP-39 mnemonic");
  }

  const root = mnemonicToRoot(mnemonic);
  try {
    const stacksPublicKey = publicKeyAt(root, STACKS_PATH);
    const stacksAddress = getAddressFromPublicKey(bytesToHex(stacksPublicKey), network);

    const bitcoinPath = bitcoinNativeSegwitPath(0, network);
    const encoder = network === "testnet" ? btc.TEST_NETWORK : btc.NETWORK;
    const payment = btc.p2wpkh(publicKeyAt(root, bitcoinPath), encoder);
    if (!payment.address) {
      throw new KeyDerivationError("Bitcoin P2WPKH produced no address");
    }

    return {
      stacks: { address: stacksAddress, path: STACKS_PATH },
      bitcoin: { address: payment.address, path: bitcoinPath },
    };
  } finally {
    root.wipePrivateData();
  }
}
