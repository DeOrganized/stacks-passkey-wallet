import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { hexToBytes } from "@noble/hashes/utils.js";

import { SeedExport, WALLET_ACTIONS, seedExportFromPrfBytes } from "../src/export";
import { BackupNotAcknowledgedError, SeedAlreadyRevealedError } from "../src/errors";

const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locked: any = JSON.parse(
  readFileSync(resolve(here, "vectors/derivation.vectors.json"), "utf8"),
);
const vector = locked.vectors[0];
const prf = hexToBytes(vector.prfBytesHex);

describe("seed export gating (A3)", () => {
  it("refuses to export without acknowledging the backup warning", () => {
    expect(() => seedExportFromPrfBytes(prf, { acknowledgedBackupWarning: false })).toThrowError(
      BackupNotAcknowledgedError,
    );
  });

  it("exports the correct mnemonic once acknowledged", () => {
    const exp = seedExportFromPrfBytes(prf, { acknowledgedBackupWarning: true });
    expect(exp.reveal()).toBe(vector.mnemonic);
  });
});

describe("SeedExport reveal-once + redaction", () => {
  it("reveals exactly once, then throws", () => {
    const exp = new SeedExport("test mnemonic words");
    expect(exp.revealed).toBe(false);
    expect(exp.reveal()).toBe("test mnemonic words");
    expect(exp.revealed).toBe(true);
    expect(() => exp.reveal()).toThrowError(SeedAlreadyRevealedError);
  });

  it("never leaks the phrase via toString / JSON", () => {
    const exp = new SeedExport("super secret seed phrase");
    expect(String(exp)).not.toContain("secret");
    expect(JSON.stringify({ exp })).not.toContain("secret");
    expect(JSON.stringify(exp)).toBe('"[REDACTED]"');
  });
});

describe("distinct wallet actions (A3 language)", () => {
  it("keeps add-passkey and restore-wallet distinct", () => {
    expect(WALLET_ACTIONS.addPasskey.purpose).toBe("login-convenience");
    expect(WALLET_ACTIONS.restoreWallet.purpose).toBe("funds-recovery");
    expect(WALLET_ACTIONS.addPasskey.purpose).not.toBe(WALLET_ACTIONS.restoreWallet.purpose);
  });
});
