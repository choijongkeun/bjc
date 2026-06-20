import { assertNonNegativeIntString } from "./amount.js";
import { validationError } from "./errors.js";

export const SIDECAR_FORMULA_VERSION = "sidecar_v1";
const BPS_DENOMINATOR = 10000n;

export type SidecarSplitComputation = {
  requested_amount_base: string;
  release_amount_base: string;
  freeze_amount_base: string;
};

export function assertSidecarCalculationDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("calculation_date must be YYYY-MM-DD", { calculation_date: value });
  }
}

export function calculateSidecarSplit(input: {
  requested_amount_base: string;
  release_bps: string;
  freeze_bps: string;
}): SidecarSplitComputation {
  assertNonNegativeIntString("requested_amount_base", input.requested_amount_base);
  assertNonNegativeIntString("release_bps", input.release_bps);
  assertNonNegativeIntString("freeze_bps", input.freeze_bps);

  const requested = BigInt(input.requested_amount_base);
  const releaseBps = BigInt(input.release_bps);
  const freezeBps = BigInt(input.freeze_bps);

  if (releaseBps + freezeBps !== BPS_DENOMINATOR) {
    throw validationError("sidecar bps must sum to 10000", {
      release_bps: input.release_bps,
      freeze_bps: input.freeze_bps
    });
  }

  const release = (requested * releaseBps) / BPS_DENOMINATOR;
  const freeze = requested - release;
  return {
    requested_amount_base: input.requested_amount_base,
    release_amount_base: release.toString(),
    freeze_amount_base: freeze.toString()
  };
}

export function buildSidecarReleaseReference(input: {
  calculation_date: string;
  calc_run_id: string;
  source_reference: string;
}): string {
  return `calc:SIDECAR:${input.calculation_date}:${input.calc_run_id}:release:${input.source_reference}`;
}

export function buildSidecarFreezeReference(input: {
  calculation_date: string;
  calc_run_id: string;
  source_reference: string;
}): string {
  return `calc:SIDECAR:${input.calculation_date}:${input.calc_run_id}:freeze:${input.source_reference}`;
}
