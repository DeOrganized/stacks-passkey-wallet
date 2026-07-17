import type { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";

import { bitcoinNativeSegwitPath, type BitcoinNetwork } from "../derivation/paths";
import { prfBytesToRoot } from "../derivation/seed";
import { KeyDerivationError } from "../errors";
import { DEFAULT_SALT } from "../wallet-identity";

/**
 * Derive the native-SegWit signing key at the network-correct path. This MUST
 * match deriveBitcoinAccount's path for the same network (coin type 0' mainnet,
 * 1' testnet) — otherwise the address you receive at and the key you sign with
 * diverge and the funds are unspendable.
 */
function bitcoinPrivateKey(root: HDKey, network: BitcoinNetwork): Uint8Array {
  const node = root.derive(bitcoinNativeSegwitPath(0, network));
  if (!node.privateKey) throw new KeyDerivationError("Bitcoin signing key unavailable");
  return node.privateKey;
}

export interface SignPsbtResult {
  /** Updated PSBT bytes (signed but NOT finalized — finalization is the caller's step). */
  psbt: Uint8Array;
  /** Number of inputs signed by the derived key. */
  signedInputs: number;
}

/**
 * Sign a PSBT with an already-derived HD root. `network` selects the derivation
 * path's coin type so the signing key matches the account's address for that
 * network; the PSBT itself carries the transaction's network context.
 */
export function signBitcoinPsbtWithRoot(
  root: HDKey,
  psbt: Uint8Array,
  network: BitcoinNetwork = "mainnet",
): SignPsbtResult {
  const priv = bitcoinPrivateKey(root, network);
  const tx = btc.Transaction.fromPSBT(psbt, { allowUnknown: true });
  const signedInputs = tx.sign(priv);
  return { psbt: tx.toPSBT(), signedInputs };
}

/**
 * Derive → sign → discard: sign a PSBT with the Bitcoin native-SegWit account
 * key. Returns the signed (un-finalized) PSBT. The host app never handles raw
 * key material.
 */
export function signBitcoinPsbt(
  prfBytes: Uint8Array,
  psbt: Uint8Array,
  options: { salt?: string; network?: BitcoinNetwork } = {},
): SignPsbtResult {
  const { root } = prfBytesToRoot(prfBytes, options.salt ?? DEFAULT_SALT);
  try {
    return signBitcoinPsbtWithRoot(root, psbt, options.network ?? "mainnet");
  } finally {
    root.wipePrivateData();
  }
}
