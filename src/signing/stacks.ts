import type { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  privateKeyToPublic,
  publicKeyFromSignatureRsv,
  signMessageHashRsv,
} from "@stacks/transactions";

import { STACKS_PATH } from "../derivation/paths";
import { prfBytesToRoot } from "../derivation/seed";
import { KeyDerivationError } from "../errors";
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
