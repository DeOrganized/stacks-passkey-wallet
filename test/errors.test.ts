import { describe, expect, it } from "vitest";

import {
  OriginAddressMismatchError,
  PasskeyWalletError,
  UnprotectedAssetMovementError,
} from "../src/index";

describe("OriginAddressMismatchError", () => {
  const derived = "SP37B02PN2BK8T1DCEQBF8E0MD5B6CQ06Y25J1AYH";
  const origin = "SP2VRDRY5G0KFBKTSWFBHDY4W6AXH2BDJR4MH0SW3";
  const err = new OriginAddressMismatchError(derived, origin);

  it("is a PasskeyWalletError and an Error", () => {
    expect(err).toBeInstanceOf(OriginAddressMismatchError);
    expect(err).toBeInstanceOf(PasskeyWalletError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("OriginAddressMismatchError");
  });

  it("carries both addresses as readonly fields", () => {
    expect(err.derivedAddress).toBe(derived);
    expect(err.originAddress).toBe(origin);
  });

  it("names both addresses in the message", () => {
    expect(err.message).toContain(derived);
    expect(err.message).toContain(origin);
  });
});

describe("UnprotectedAssetMovementError", () => {
  const err = new UnprotectedAssetMovementError();

  it("is a PasskeyWalletError and an Error", () => {
    expect(err).toBeInstanceOf(UnprotectedAssetMovementError);
    expect(err).toBeInstanceOf(PasskeyWalletError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnprotectedAssetMovementError");
  });

  it("names the opt-in flag and the refused mode in the message", () => {
    expect(err.message).toContain("allowUnprotectedAssetMovement: true");
    expect(err.message).toContain("Allow");
  });
});
