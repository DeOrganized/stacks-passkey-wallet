import { describe, expect, it } from "vitest";

// The package entry: tsup.config.ts builds dist/ from exactly this one file, so
// its namespace is the published export list. (dist/ itself is a gitignored
// build product; prepublishOnly rebuilds it and then runs this suite.)
import * as pkg from "../src/index";

const exported = pkg as Record<string, unknown>;

describe("public surface", () => {
  it("exposes no path from PRF bytes to seed material", () => {
    for (const name of [
      "prfBytesToEntropy",
      "prfBytesToMnemonic",
      "prfBytesToRoot",
      "seedExportFromPrfBytes",
    ]) {
      expect(name in exported, name).toBe(false);
    }
  });

  it("exposes the sanctioned entries (positive control)", () => {
    for (const name of [
      "deriveAddressesFromMnemonic",
      "deriveAddresses",
      "exportSeedPhrase",
      "signStacksTransaction",
      "mnemonicToRoot",
      "deriveStacksAccount",
    ]) {
      expect(typeof exported[name], name).toBe("function");
    }
  });
});
