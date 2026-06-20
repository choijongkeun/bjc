import { describe, expect, it } from "vitest";

import { AppError } from "../domain/errors.js";
import { findDuplicateReferenceIds, parseLedgerEventsCsv } from "./ledgerEventsCsv.js";

describe("parseLedgerEventsCsv", () => {
  it("parses valid csv rows and accepts policy_id alias", () => {
    const csv = [
      "reference_id,account_id,product_id,policy_id,calc_run_id,event_time,event_type,amount_base,decimals,symbol,related_account_id,meta_json",
      'REF-1,acc-1,prod-1,policy-1,,2026-06-10 00:00:00,STAKE,100,6,USDC,,"{""source"":""smoke""}"'
    ].join("\n");

    const rows = parseLedgerEventsCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference_id: "REF-1",
      account_id: "acc-1",
      product_id: "prod-1",
      policy_version_id: "policy-1",
      calc_run_id: null,
      event_type: "STAKE",
      amount_base: "100",
      decimals: 6,
      symbol: "USDC",
      meta: { source: "smoke" }
    });
  });

  it("allows nullable product_id values", () => {
    const csv = [
      "reference_id,account_id,product_id,policy_version_id,event_time,event_type,amount_base,decimals,symbol",
      "REF-2,acc-1,,policy-1,2026-06-10 00:00:00,RANK_BONUS,100,6,USDC"
    ].join("\n");

    const rows = parseLedgerEventsCsv(csv);
    expect(rows[0]?.product_id).toBeNull();
  });

  it("throws on missing required headers", () => {
    const csv = [
      "reference_id,account_id,product_id,policy_version_id,event_time,event_type,amount_base,decimals",
      "REF-1,acc-1,prod-1,policy-1,2026-06-10 00:00:00,STAKE,100,6"
    ].join("\n");

    expect(() => parseLedgerEventsCsv(csv)).toThrowError(AppError);
  });
});

describe("findDuplicateReferenceIds", () => {
  it("returns unique duplicate reference ids", () => {
    expect(findDuplicateReferenceIds(["A", "B", "A", "C", "B"])).toEqual(["A", "B"]);
  });
});
