import type { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";

import { bitcoinNativeSegwitPath, type BitcoinNetwork } from "./paths";
import { KeyDerivationError } from "../errors";

export type { BitcoinNetwork };

export interface BitcoinAccount {
  address: string;
  path: string;
}

/**
 * Derive the Bitcoin native-SegWit (P2WPKH, BIP-84) account from a BIP-32 root —
 * m/84'/0'/0'/0/0 on mainnet, m/84'/1'/0'/0/0 on testnet — the default payment
 * address of both Leather and Xverse. Only the compressed public key is needed.
 *
 * The path coin type and the address encoder are BOTH derived from `network`, so
 * they can never disagree (the previous split — testnet encoder over a mainnet
 * path — produced addresses no standard testnet wallet could reproduce).
 */
export function deriveBitcoinAccount(
  root: HDKey,
  network: BitcoinNetwork = "mainnet",
): BitcoinAccount {
  const path = bitcoinNativeSegwitPath(0, network);
  const node = root.derive(path);
  if (!node.publicKey) {
    throw new KeyDerivationError("Bitcoin derivation produced no public key");
  }
  const encoder = network === "testnet" ? btc.TEST_NETWORK : btc.NETWORK;
  const payment = btc.p2wpkh(node.publicKey, encoder);
  if (!payment.address) {
    throw new KeyDerivationError("Bitcoin P2WPKH produced no address");
  }
  return { address: payment.address, path };
}
