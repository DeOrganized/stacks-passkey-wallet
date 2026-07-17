import { DEFAULT_SALT } from "../wallet-identity";
import { prfBytesToRoot } from "./seed";
import { deriveStacksAccount, type StacksAccount, type StacksNetwork } from "./stacks";
import { deriveBitcoinAccount, type BitcoinAccount } from "./bitcoin";

export * from "./paths";
export { prfBytesToEntropy, prfBytesToMnemonic, mnemonicToRoot, prfBytesToRoot } from "./seed";
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
