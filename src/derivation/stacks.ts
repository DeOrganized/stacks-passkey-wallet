import type { HDKey } from "@scure/bip32";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getAddressFromPrivateKey } from "@stacks/transactions";

import { STACKS_PATH } from "./paths";
import { KeyDerivationError } from "../errors";

export type StacksNetwork = "mainnet" | "testnet";

export interface StacksAccount {
  address: string;
  path: string;
}

/**
 * Derive the Stacks account (address) from a BIP-32 root at m/44'/5757'/0'/0/0.
 * Uses @stacks/transactions v7 flat API. The private key is read, used, and
 * left to be discarded by the caller (root.wipePrivateData()).
 */
export function deriveStacksAccount(root: HDKey, network: StacksNetwork = "mainnet"): StacksAccount {
  const node = root.derive(STACKS_PATH);
  if (!node.privateKey) {
    throw new KeyDerivationError("Stacks derivation produced no private key");
  }
  // Stacks (and Leather/Xverse) use COMPRESSED public keys. In stacks.js a
  // private key is flagged compressed by a trailing "01" byte (66 hex chars);
  // a bare 32-byte key would be treated as uncompressed and yield a different,
  // non-interoperable address.
  const privateKeyHex = `${bytesToHex(node.privateKey)}01`;
  const address = getAddressFromPrivateKey(privateKeyHex, network);
  return { address, path: STACKS_PATH };
}
