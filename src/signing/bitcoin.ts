import type { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";

import { BITCOIN_NATIVE_SEGWIT_PATH } from "../derivation/paths";
import { prfBytesToRoot } from "../derivation/seed";
import { KeyDerivationError } from "../errors";
import { DEFAULT_SALT } from "../wallet-identity";

function bitcoinPrivateKey(root: HDKey): Uint8Array {
  const node = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
  if (!node.privateKey) throw new KeyDerivationError("Bitcoin signing key unavailable");
  return node.privateKey;
}

export interface SignPsbtResult {
  /** Updated PSBT bytes (signed but NOT finalized — finalization is the caller's step). */
  psbt: Uint8Array;
  /** Number of inputs signed by the derived key. */
  signedInputs: number;
}

/** Sign a PSBT with an already-derived HD root. */
export function signBitcoinPsbtWithRoot(
  root: HDKey,
  psbt: Uint8Array,
  network: typeof btc.NETWORK = btc.NETWORK,
): SignPsbtResult {
  const priv = bitcoinPrivateKey(root);
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
  options: { salt?: string; network?: typeof btc.NETWORK } = {},
): SignPsbtResult {
  const { root } = prfBytesToRoot(prfBytes, options.salt ?? DEFAULT_SALT);
  try {
    return signBitcoinPsbtWithRoot(root, psbt, options.network ?? btc.NETWORK);
  } finally {
    root.wipePrivateData();
  }
}
