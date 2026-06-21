import { describe, expect, it } from "vitest";

import { AppError } from "../domain/errors.js";
import { validateStakingProductBatchProducts } from "./policyEngine.js";

const baseProduct = {
  name: "BJC 500 패키지 30일",
  symbol: "USDC",
  decimals: 6,
  min_stake_amount_base: "500",
  max_stake_amount_base: "500",
  staking_days: 30,
  daily_interest_bps: "50",
  is_active: true
};

describe("validateStakingProductBatchProducts", () => {
  it("accepts the 4-product batch payload for a DRAFT policy", () => {
    const products = validateStakingProductBatchProducts([
      baseProduct,
      { ...baseProduct, name: "BJC 500 패키지 90일", staking_days: 90, daily_interest_bps: "70" },
      { ...baseProduct, name: "BJC 500 패키지 160일", staking_days: 160, daily_interest_bps: "100" },
      { ...baseProduct, name: "BJC 500 패키지 360일", staking_days: 360, daily_interest_bps: "120" }
    ]);

    expect(products).toHaveLength(4);
    expect(products[0]!.min_stake_amount_base).toBe("500");
    expect(products[3]!.daily_interest_bps).toBe("120");
  });

  it("rejects missing min and max stake amounts", () => {
    expect(() =>
      validateStakingProductBatchProducts([
        { ...baseProduct, min_stake_amount_base: "", max_stake_amount_base: "" }
      ])
    ).toThrow(AppError);
  });

  it("rejects min greater than max", () => {
    expect(() =>
      validateStakingProductBatchProducts([
        { ...baseProduct, min_stake_amount_base: "501", max_stake_amount_base: "500" }
      ])
    ).toThrow("min_stake_amount_base must be less than or equal to max_stake_amount_base");
  });

  it("rejects duplicate names inside the same batch", () => {
    expect(() =>
      validateStakingProductBatchProducts([
        baseProduct,
        { ...baseProduct, staking_days: 90, daily_interest_bps: "70" }
      ])
    ).toThrow("duplicate product name found in request");
  });
});
