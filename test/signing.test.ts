import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import * as btc from "@scure/btc-signer";
import { hashMessage as refHashMessage } from "@stacks/encryption";

import { prfBytesToRoot } from "../src/derivation/seed";
import { BITCOIN_NATIVE_SEGWIT_PATH } from "../src/derivation/paths";
import {
  hashStacksMessage,
  signBitcoinPsbt,
  signStacksMessage,
  verifyStacksMessage,
} from "../src/signing";

const prf = new Uint8Array(32).fill(0x07);

describe("Stacks message signing", () => {
  it("message hash matches @stacks/encryption reference (clean-room)", () => {
    for (const msg of ["", "hello", "DeOrganized passkey wallet ✨", "a".repeat(500)]) {
      expect(bytesToHex(hashStacksMessage(msg))).toBe(bytesToHex(refHashMessage(msg)));
    }
  });

  it("signs and verifies via public-key recovery", () => {
    const message = "sign-in to deorganized.com";
    const { signature, publicKey } = signStacksMessage(prf, message);
    expect(verifyStacksMessage(message, signature, publicKey)).toBe(true);
  });

  it("rejects a tampered message", () => {
    const { signature, publicKey } = signStacksMessage(prf, "amount: 10 STX");
    expect(verifyStacksMessage("amount: 1000 STX", signature, publicKey)).toBe(false);
  });
});

describe("Bitcoin PSBT signing", () => {
  function buildUnsignedPsbt(): Uint8Array {
    const { root } = prfBytesToRoot(prf);
    try {
      const node = root.derive(BITCOIN_NATIVE_SEGWIT_PATH);
      const wpkh = btc.p2wpkh(node.publicKey!, btc.NETWORK);
      const tx = new btc.Transaction();
      tx.addInput({
        txid: hexToBytes("11".repeat(32)),
        index: 0,
        witnessUtxo: { script: wpkh.script, amount: 100_000n },
      });
      tx.addOutputAddress(wpkh.address!, 90_000n, btc.NETWORK);
      return tx.toPSBT();
    } finally {
      root.wipePrivateData();
    }
  }

  it("signs a P2WPKH input with the derived key and finalizes", () => {
    const { psbt: signed, signedInputs } = signBitcoinPsbt(prf, buildUnsignedPsbt());
    expect(signedInputs).toBe(1);

    const tx = btc.Transaction.fromPSBT(signed);
    tx.finalize();
    expect(tx.getInput(0).finalScriptWitness).toBeDefined();
    expect(tx.id).toMatch(/^[0-9a-f]{64}$/);
  });
});
