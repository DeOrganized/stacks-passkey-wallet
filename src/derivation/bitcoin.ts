import type { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";

import { BITCOIN_NATIVE_SEGWIT_PATH } from "./paths";
import { KeyDerivationError } from "../errors";

export interface BitcoinAccount {
  address: string;
  path: string;
}

/**
 * Derive the Bitcoin native-SegWit (P2WPKH, BIP-84) account from a BIP-32 root
 * at m/84'/0'/0'/0/0 — the default payment address of both Leather and Xverse.
 * Only the compressed public key is needed to compute the address.
 */
export function deriveBitcoinAccount(
  root: HDKey,
  network: typeof btc.NETWORK = btc.NETWORK,
): BitcoinAccount {
  const node = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
  if (!node.publicKey) {
    throw new KeyDerivationError("Bitcoin derivation produced no public key");
  }
  const payment = btc.p2wpkh(node.publicKey, network);
  if (!payment.address) {
    throw new KeyDerivationError("Bitcoin P2WPKH produced no address");
  }
  return { address: payment.address, path: BITCOIN_NATIVE_SEGWIT_PATH };
}
