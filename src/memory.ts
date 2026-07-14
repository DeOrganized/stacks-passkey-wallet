/**
 * Best-effort zeroization helpers.
 *
 * The library's security property (spec A1) is zero persistence: key material
 * exists only transiently in page memory and is overwritten after use. These
 * helpers make that explicit at the call sites that hold secrets.
 *
 * Caveat, stated honestly: JavaScript cannot guarantee erasure. The JS engine
 * may copy a TypedArray's backing buffer (GC, string interning) beyond our
 * reach. `fill(0)` overwrites the buffer we hold; it is a meaningful reduction
 * of exposure window, not a cryptographic guarantee.
 */

/** Overwrite one or more byte arrays with zeros in place. Ignores null/undefined. */
export function zero(...arrays: Array<Uint8Array | null | undefined>): void {
  for (const a of arrays) {
    if (a) a.fill(0);
  }
}

/** Run `fn` with `secret`, then zero the secret whether or not `fn` throws. */
export function withZeroed<T, S extends Uint8Array>(secret: S, fn: (secret: S) => T): T {
  try {
    return fn(secret);
  } finally {
    secret.fill(0);
  }
}
