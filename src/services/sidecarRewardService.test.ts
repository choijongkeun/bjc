import { describe, expect, it } from "vitest";

import {
  buildSidecarFreezeReference,
  buildSidecarReleaseReference,
  calculateSidecarSplit
} from "../domain/sidecarReward.js";
import { AppError } from "../domain/errors.js";
import { type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import { assertCanRunSidecar, extractSidecarSummaryFromAuditLogs } from "./sidecarRewardService.js";

describe("sidecarRewardService helpers", () => {
  it("splits requested withdrawals with bigint-safe floor division", () => {
    expect(
      calculateSidecarSplit({
        requested_amount_base: "999",
        release_bps: "7000",
        freeze_bps: "3000"
      })
    ).toEqual({
      requested_amount_base: "999",
      release_amount_base: "699",
      freeze_amount_base: "300"
    });
  });

  it("rejects invalid sidecar bps sums", () => {
    expect(() =>
      calculateSidecarSplit({
        requested_amount_base: "1000",
        release_bps: "6000",
        freeze_bps: "2000"
      })
    ).toThrow(/10000/);
  });

  it("builds deterministic release and freeze references", () => {
    expect(
      buildSidecarReleaseReference({
        calculation_date: "2026-06-30",
        calc_run_id: "calc-1",
        source_reference: "withdrawal:req-1"
      })
    ).toBe("calc:SIDECAR:2026-06-30:calc-1:release:withdrawal:req-1");
    expect(
      buildSidecarFreezeReference({
        calculation_date: "2026-06-30",
        calc_run_id: "calc-1",
        source_reference: "withdrawal:req-1"
      })
    ).toBe("calc:SIDECAR:2026-06-30:calc-1:freeze:withdrawal:req-1");
  });

  it("extracts calc_run summary from admin audit logs", () => {
    const auditLogs: AdminAuditLogRow[] = [
      {
        id: "audit-1",
        actor_account_id: "admin-1",
        action: "ADMIN_SIDECAR_RUN",
        target_table: "calc_runs",
        target_id: "calc-1",
        meta: {
          target_count: 2,
          created_count: 1,
          zero_base_skip_count: 0,
          ineligible_skip_count: 0,
          duplicate_skip_count: 1,
          conflict_count: 0,
          failed_count: 0,
          total_requested_amount_base: "1000",
          total_release_amount_base: "700",
          total_freeze_amount_base: "300",
          sidecar_status: "SIDECAR_ACTIVE",
          status: "SUCCEEDED"
        },
        created_at: "2026-06-30T00:00:00.000Z"
      }
    ];

    expect(extractSidecarSummaryFromAuditLogs(auditLogs, "calc-1")).toEqual({
      calc_run_id: "calc-1",
      target_count: 2,
      created_count: 1,
      zero_base_skip_count: 0,
      ineligible_skip_count: 0,
      duplicate_skip_count: 1,
      conflict_count: 0,
      failed_count: 0,
      total_requested_amount_base: "1000",
      total_release_amount_base: "700",
      total_freeze_amount_base: "300",
      sidecar_status: "SIDECAR_ACTIVE",
      status: "SUCCEEDED"
    });
  });

  it("allows only ADMIN actors to run sidecar operations", () => {
    expect(() => assertCanRunSidecar("ADMIN")).not.toThrow();

    expect(() => assertCanRunSidecar("READER")).toThrowError(AppError);
    expect(() => assertCanRunSidecar("USER")).toThrowError(AppError);
  });
});
