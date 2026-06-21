import { z } from "zod";

import { validationError } from "./errors.js";

export const POLICY_VERSION_NAME_MAX_LENGTH = 255;
export const POLICY_VERSION_VERSION_MAX_LENGTH = 64;

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date format")
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const policyVersionCreateRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(POLICY_VERSION_NAME_MAX_LENGTH, `name must be at most ${POLICY_VERSION_NAME_MAX_LENGTH} characters`),
    version: z
      .string()
      .trim()
      .min(1, "version is required")
      .max(POLICY_VERSION_VERSION_MAX_LENGTH, `version must be at most ${POLICY_VERSION_VERSION_MAX_LENGTH} characters`),
    note: z.string().trim().nullable().optional().transform((value) => {
      if (value == null) return null;
      return value.length ? value : null;
    }),
    effective_from: optionalDateSchema,
    effective_to: optionalDateSchema
  })
  .superRefine((value, ctx) => {
    if (value.effective_from && value.effective_to && value.effective_from > value.effective_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effective_to must be greater than or equal to effective_from",
        path: ["effective_to"]
      });
    }
  });

export type PolicyVersionCreateInput = z.infer<typeof policyVersionCreateRequestSchema>;

export function normalizePolicyVersionCreateInput(input: PolicyVersionCreateInput): PolicyVersionCreateInput {
  const parsed = policyVersionCreateRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw validationError(issue?.message ?? "invalid policy_version input", {
      issues: parsed.error.flatten()
    });
  }

  return parsed.data;
}
