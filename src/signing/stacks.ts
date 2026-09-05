import type { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  AuthType,
  PostConditionMode,
  TransactionSigner,
  addressFromVersionHash,
  addressHashModeToVersion,
  addressToString,
  deriveNetworkFromTx,
  getAddressFromPrivateKey,
  privateKeyToPublic,
  publicKeyFromSignatureRsv,
  signMessageHashRsv,
  type StacksTransactionWire,
} from "@stacks/transactions";

import { STACKS_PATH } from "../derivation/paths";
import { prfBytesToRoot } from "../derivation/seed";
import {
  KeyDerivationError,
  OriginAddressMismatchError,
  UnprotectedAssetMovementError,
} from "../errors";
import { DEFAULT_SALT } from "../wallet-identity";

/**
 * Stacks signed-message hashing (clean-room from the Stacks convention:
 * sha256 of a length-prefixed chain string || VarInt(len) || message). The
 * 0x17 byte is the length of "Stacks Signed Message:\n". Cross-validated in
 * tests against @stacks/encryption's reference hashMessage.
 */
const STACKS_MESSAGE_PREFIX = "\x17Stacks Signed Message:\n";

/** Bitcoin-style CompactSize / VarInt length prefix used by Stacks messages. */
function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, (n >> 8) & 0xff);
  if (n <= 0xffffffff) {
    return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
  }
  throw new RangeError("message too long to VarInt-encode");
}

export function encodeStacksMessage(message: string): Uint8Array {
  const msg = utf8ToBytes(message);
  return concatBytes(utf8ToBytes(STACKS_MESSAGE_PREFIX), varint(msg.length), msg);
}

export function hashStacksMessage(message: string): Uint8Array {
  return sha256(encodeStacksMessage(message));
}

export interface StacksSignature {
  /** RSV-encoded signature hex. */
  signature: string;
  /** Compressed public key hex that produced the signature. */
  publicKey: string;
}

function stacksPrivateKeyHex(root: HDKey): string {
  const node = root.derive(STACKS_PATH);
  if (!node.privateKey) throw new KeyDerivationError("Stacks signing key unavailable");
  // Trailing "01" marks the key as compressed (see derivation/stacks.ts).
  return `${bytesToHex(node.privateKey)}01`;
}

/** Sign a message with an already-derived HD root. */
export function signStacksMessageWithRoot(root: HDKey, message: string): StacksSignature {
  const privateKey = stacksPrivateKeyHex(root);
  const messageHash = bytesToHex(hashStacksMessage(message));
  const signature = signMessageHashRsv({ messageHash, privateKey });
  const pub = privateKeyToPublic(privateKey);
  const publicKey = typeof pub === "string" ? pub : bytesToHex(pub);
  return { signature, publicKey };
}

/**
 * Derive → sign → discard: sign a UTF-8 message with the Stacks account key.
 * The host app never handles raw key material.
 */
export function signStacksMessage(
  prfBytes: Uint8Array,
  message: string,
  options: { salt?: string } = {},
): StacksSignature {
  const { root } = prfBytesToRoot(prfBytes, options.salt ?? DEFAULT_SALT);
  try {
    return signStacksMessageWithRoot(root, message);
  } finally {
    root.wipePrivateData();
  }
}

/** Verify by recovering the signer's public key from the RSV signature. */
export function verifyStacksMessage(
  message: string,
  signature: string,
  publicKey: string,
): boolean {
  const messageHash = bytesToHex(hashStacksMessage(message));
  const recovered = publicKeyFromSignatureRsv(messageHash, signature);
  const recoveredHex = typeof recovered === "string" ? recovered : bytesToHex(recovered);
  return recoveredHex === publicKey;
}

// ---------------------------------------------------------------------------
// Transaction signing (issue #12 surface)
// ---------------------------------------------------------------------------

export type SignStacksTransactionResult =
  | {
      kind: "complete";
      /** Serialized signed transaction — ready to broadcast. */
      transaction: Uint8Array;
      /** The real txid of the signed transaction. */
      txid: string;
      /** Compressed public key hex that produced the signature. */
      publicKey: string;
    }
  | {
      kind: "origin-signed";
      /** Serialized origin-signed transaction — hand this to your sponsor service. */
      transaction: Uint8Array;
      /** Compressed public key hex that produced the signature. */
      publicKey: string;
      // No id field: the only txid that will ever exist is the one the sponsor
      // reports after the fee-payer signature is applied.
    };

export interface SignStacksTransactionOptions {
  /** Overrides the frozen default salt — defines a distinct wallet universe. */
  salt?: string;
  /**
   * Post-condition mode Allow permits any asset movement the contract attempts
   * and is refused by default. Pass `true` to sign an Allow-mode transaction
   * anyway. Deny mode (with or without post-conditions) needs no flag.
   */
  allowUnprotectedAssetMovement?: boolean;
}

/** The c32 origin address the transaction's spending condition commits to. */
function originAddressOf(transaction: StacksTransactionWire): string {
  const condition = transaction.auth.spendingCondition;
  const network = deriveNetworkFromTx(transaction);
  const version = addressHashModeToVersion(condition.hashMode, network);
  return addressToString(addressFromVersionHash(version, condition.signer));
}

/**
 * Sign a Stacks transaction with an already-derived HD root. Nothing on the
 * wire object is modified except the origin signature; the caller's root is
 * not wiped (the caller owns its lifecycle).
 *
 * Order of operations is the contract:
 *   1. origin-address fence — the account-0 address, derived for the network
 *      the transaction's own version byte names, must equal the transaction's
 *      origin spending-condition address; otherwise OriginAddressMismatchError
 *      and no signature is applied.
 *   2. post-condition check — Allow mode without an explicit opt-in throws
 *      UnprotectedAssetMovementError; no signature is applied.
 *   3. sign the origin; the result kind follows the transaction's own
 *      authorization type.
 */
export function signStacksTransactionWithRoot(
  root: HDKey,
  transaction: StacksTransactionWire,
  options: Omit<SignStacksTransactionOptions, "salt"> = {},
): SignStacksTransactionResult {
  const privateKey = stacksPrivateKeyHex(root);

  // 1. Origin-address fence, for the transaction's own network.
  const network = deriveNetworkFromTx(transaction);
  const derivedAddress = getAddressFromPrivateKey(privateKey, network);
  const originAddress = originAddressOf(transaction);
  if (derivedAddress !== originAddress) {
    throw new OriginAddressMismatchError(derivedAddress, originAddress);
  }

  // 2. Post-condition mode: Allow requires a deliberate opt-in.
  if (
    transaction.postConditionMode === PostConditionMode.Allow &&
    options.allowUnprotectedAssetMovement !== true
  ) {
    throw new UnprotectedAssetMovementError();
  }

  // 3. Sign the origin. TransactionSigner writes only the origin signature.
  const signer = new TransactionSigner(transaction);
  signer.signOrigin(privateKey);

  const pub = privateKeyToPublic(privateKey);
  const publicKey = typeof pub === "string" ? pub : bytesToHex(pub);
  const bytes = transaction.serializeBytes();

  if (transaction.auth.authType === AuthType.Sponsored) {
    return { kind: "origin-signed", transaction: bytes, publicKey };
  }
  return { kind: "complete", transaction: bytes, txid: transaction.txid(), publicKey };
}

/**
 * Derive → sign → discard: sign a Stacks transaction with the account-0 key.
 * The host app never handles raw key material. Same discipline as
 * signStacksMessage: the root is wiped in `finally`, on success and on every
 * refusal path alike.
 */
export function signStacksTransaction(
  prfBytes: Uint8Array,
  transaction: StacksTransactionWire,
  options: SignStacksTransactionOptions = {},
): SignStacksTransactionResult {
  const { salt, ...rest } = options;
  const { root } = prfBytesToRoot(prfBytes, salt ?? DEFAULT_SALT);
  try {
    return signStacksTransactionWithRoot(root, transaction, rest);
  } finally {
    root.wipePrivateData();
  }
}
