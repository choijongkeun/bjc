import "dotenv/config";
import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { PolicyEngine } from "../src/services/policyEngine.js";
import { insertAdminAuditLog } from "../src/repos/auditLogRepo.js";

type TestResult = { name: string; ok: boolean; message?: string };

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

async function ensureAccounts(conn: any, ids: { admin: string; reader: string; user: string }) {
  await conn.query(
    "insert into accounts (id, display_name, role) values (?, 'Admin', 'ADMIN') on duplicate key update role='ADMIN'",
    [ids.admin]
  );
  await conn.query(
    "insert into accounts (id, display_name, role) values (?, 'Reader', 'READER') on duplicate key update role='READER'",
    [ids.reader]
  );
  await conn.query(
    "insert into accounts (id, display_name, role) values (?, 'User', 'USER') on duplicate key update role='USER'",
    [ids.user]
  );

  await insertAdminAuditLog(conn, {
    actor_account_id: ids.admin,
    action: "SMOKE_SETUP",
    target_table: "accounts",
    target_id: ids.user,
    meta: { note: "smoke accounts ensured" }
  });
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = {
    admin: randomUUID(),
    reader: randomUUID(),
    user: randomUUID()
  };

  const results: TestResult[] = [];
  const engine = new PolicyEngine(pool);

  const [verRows] = await pool.query("select version() as v, database() as db, user() as u");
  const v = (verRows as any[])[0];
  process.stdout.write(`mysql_version=${v.v} db=${v.db} user=${mask(String(v.u))}\n`);

  await withTx(pool, async (conn) => {
    await ensureAccounts(conn, ids);
  });

  let policyVersionId = "";
  let productId = "";
  try {
    await engine.createPolicyVersion({
      actor_account_id: ids.user,
      name: `Smoke Policy ${suffix}`,
      version: "V1",
      note: `user should fail ${suffix}`
    });
    results.push({ name: "USER create policy_version", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "USER create policy_version", ok: true, message: e?.message });
  }

  try {
    const { policy_version_id } = await engine.createPolicyVersion({
      actor_account_id: ids.admin,
      name: `Smoke Policy ${suffix}`,
      version: "V1",
      note: `smoke ${suffix}`
    });
    policyVersionId = policy_version_id;
    results.push({ name: "ADMIN create policy_version", ok: true, message: policy_version_id });
  } catch (e: any) {
    results.push({ name: "ADMIN create policy_version", ok: false, message: e?.message });
  }

  try {
    await engine.getPolicyVersion({ actor_account_id: ids.reader, policy_version_id: policyVersionId });
    results.push({ name: "READER select policy_version", ok: true });
  } catch (e: any) {
    results.push({ name: "READER select policy_version", ok: false, message: e?.message });
  }

  try {
    const listed = await engine.listPolicyVersions({
      actor_account_id: ids.reader,
      status: "DRAFT",
      page: 1,
      limit: 10
    });
    results.push({
      name: "READER list policies",
      ok: listed.items.some((item) => item.id === policyVersionId),
      message: `total=${listed.total}`
    });
  } catch (e: any) {
    results.push({ name: "READER list policies", ok: false, message: e?.message });
  }

  try {
    await engine.listPolicyVersions({ actor_account_id: ids.user, page: 1, limit: 10 });
    results.push({ name: "USER list policies denied", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "USER list policies denied", ok: true, message: e?.message });
  }

  try {
    await engine.activatePolicyVersion({ actor_account_id: ids.reader, policy_version_id: policyVersionId });
    results.push({ name: "READER activate policy_version", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "READER activate policy_version", ok: true, message: e?.message });
  }

  try {
    await engine.activatePolicyVersion({ actor_account_id: ids.admin, policy_version_id: policyVersionId });
    results.push({ name: "ADMIN activate policy_version", ok: true });
  } catch (e: any) {
    if (String(e?.message ?? "").includes("ACTIVE policy_version already exists")) {
      results.push({ name: "ADMIN activate policy_version", ok: true, message: "conflict: ACTIVE already exists" });
    } else {
      results.push({ name: "ADMIN activate policy_version", ok: false, message: e?.message });
    }
  }

  try {
    await withTx(pool, async (conn) => {
      await conn.query(
        "insert into policy_versions (id, status, note, created_by) values (?, 'ACTIVE', ?, ?)",
        [randomUUID(), `active2 ${suffix}`, ids.admin]
      );
    });
    results.push({ name: "ACTIVE unique constraint", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "ACTIVE unique constraint", ok: true, message: e?.message });
  }

  try {
    const created = await engine.upsertStakingProducts({
      actor_account_id: ids.admin,
      policy_version_id: policyVersionId,
      products: [
        {
          name: `30D ${suffix}`,
          symbol: "USDC",
          decimals: 6,
          min_stake_amount_base: "100",
          max_stake_amount_base: "1000",
          staking_days: 30,
          daily_interest_bps: "50",
          is_active: true
        }
      ]
    });
    productId = created.ids[0] ?? "";
    results.push({ name: "ADMIN create staking_product", ok: !!productId, message: productId });
  } catch (e: any) {
    results.push({ name: "ADMIN create staking_product", ok: false, message: e?.message });
  }

  try {
    const listed = await engine.listStakingProducts({
      actor_account_id: ids.reader,
      policy_version_id: policyVersionId,
      page: 1,
      limit: 1
    });
    results.push({
      name: "READER list staking_products filter/pagination",
      ok: listed.items.some((item) => item.id === productId) && listed.total >= 1 && listed.items.length === 1,
      message: `total=${listed.total}; page_items=${listed.items.length}`
    });
  } catch (e: any) {
    results.push({ name: "READER list staking_products", ok: false, message: e?.message });
  }

  let runId = "";
  try {
    const r = await engine.createCalcRun({
      actor_account_id: ids.admin,
      policy_version_id: policyVersionId,
      run_type: "DAILY_REWARD",
      run_date: new Date().toISOString().slice(0, 10)
    });
    runId = r.calc_run_id;
    results.push({ name: "ADMIN create calc_run", ok: true, message: runId });
  } catch (e: any) {
    results.push({ name: "ADMIN create calc_run", ok: false, message: e?.message });
  }

  const trans = async (from: string, to: any, expectOk: boolean) => {
    try {
      await engine.transitionCalcRunStatus({
        actor_account_id: ids.admin,
        calc_run_id: runId,
        to_status: to,
        allow_failed_retry: true,
        set_finalized_at: true
      });
      results.push({ name: `calc_runs ${from} -> ${to}`, ok: expectOk, message: expectOk ? "OK" : "unexpected success" });
    } catch (e: any) {
      results.push({ name: `calc_runs ${from} -> ${to}`, ok: !expectOk, message: e?.message });
    }
  };

  await trans("PENDING", "RUNNING", true);
  await trans("RUNNING", "SUCCEEDED", true);

  try {
    const imported = await engine.importLedgerEventsCsv({
      actor_account_id: ids.admin,
      csv_text: [
        "reference_id,account_id,product_id,policy_version_id,calc_run_id,event_time,event_type,amount_base,decimals,symbol,related_account_id,meta_json",
        `${`SMOKE:LEDGER:CSV:${suffix}:1`},${ids.user},${productId},${policyVersionId},,2026-06-10 00:00:00,STAKE,100,6,USDC,,"{""source"":""smoke""}"`,
        `${`SMOKE:LEDGER:CSV:${suffix}:2`},${ids.user},${productId},${policyVersionId},${runId},2026-06-10 01:00:00,WITHDRAWAL_FEE,5,6,USDC,,"{}"`
      ].join("\n")
    });
    results.push({
      name: "ADMIN import ledger_events csv",
      ok: imported.inserted_count === 2 && imported.rejected_count === 0,
      message: `inserted=${imported.inserted_count}`
    });
  } catch (e: any) {
    results.push({ name: "ADMIN import ledger_events csv", ok: false, message: e?.message });
  }

  try {
    await engine.importLedgerEventsCsv({
      actor_account_id: ids.admin,
      csv_text: [
        "reference_id,account_id,product_id,policy_version_id,calc_run_id,event_time,event_type,amount_base,decimals,symbol,related_account_id,meta_json",
        `${`SMOKE:LEDGER:DUP:${suffix}`},${ids.user},${productId},${policyVersionId},,2026-06-10 02:00:00,STAKE,100,6,USDC,,"{}"`,
        `${`SMOKE:LEDGER:DUP:${suffix}`},${ids.user},${productId},${policyVersionId},,2026-06-10 03:00:00,STAKE,200,6,USDC,,"{}"`
      ].join("\n")
    });
    results.push({ name: "ledger_events csv duplicate rollback", ok: false, message: "unexpected success" });
  } catch (e: any) {
    const [rows] = await pool.query("select count(*) as total from ledger_events where reference_id like ?", [
      `SMOKE:LEDGER:DUP:${suffix}%`
    ]);
    const total = Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
    results.push({
      name: "ledger_events csv duplicate rollback",
      ok: total === 0,
      message: `${e?.message}; remaining=${total}`
    });
  }

  try {
    const listed = await engine.listLedgerEvents({
      actor_account_id: ids.reader,
      policy_version_id: policyVersionId,
      event_type: "STAKE",
      page: 1,
      limit: 10
    });
    results.push({
      name: "READER list ledger_events filter",
      ok: listed.items.every((item) => item.event_type === "STAKE") && listed.total >= 1,
      message: `total=${listed.total}`
    });
  } catch (e: any) {
    results.push({ name: "READER list ledger_events", ok: false, message: e?.message });
  }

  let settlementItemId = "";
  try {
    const s = await engine.insertSettlementItem({
      actor_account_id: ids.admin,
      calc_run_id: runId,
      settlement_type: "DAILY_REWARD",
      account_id: ids.user,
      amount_base: "1",
      decimals: 6,
      symbol: "USDC",
      reference_id: `SMOKE:SETTLEMENT:PRE_FINALIZE:${suffix}`
    });
    settlementItemId = s.settlement_item_id;
    results.push({ name: "settlement_items insert before finalize", ok: true, message: settlementItemId });
  } catch (e: any) {
    results.push({ name: "settlement_items insert before finalize", ok: false, message: e?.message });
  }

  await trans("SUCCEEDED", "FINALIZED", true);

  try {
    const listed = await engine.listCalcRuns({
      actor_account_id: ids.reader,
      policy_version_id: policyVersionId,
      status: "FINALIZED",
      page: 1,
      limit: 10
    });
    results.push({
      name: "READER list calc_runs filter",
      ok: listed.items.some((item) => item.id === runId) && listed.items.every((item) => item.status === "FINALIZED"),
      message: `total=${listed.total}`
    });
  } catch (e: any) {
    results.push({ name: "READER list calc_runs", ok: false, message: e?.message });
  }

  try {
    const listed = await engine.listSettlementItems({
      actor_account_id: ids.reader,
      calc_run_id: runId,
      settlement_type: "DAILY_REWARD",
      page: 1,
      limit: 10
    });
    results.push({
      name: "READER list settlement_items filter",
      ok: listed.items.some((item) => item.id === settlementItemId) && listed.items.every((item) => item.settlement_type === "DAILY_REWARD"),
      message: `total=${listed.total}`
    });
  } catch (e: any) {
    results.push({ name: "READER list settlement_items", ok: false, message: e?.message });
  }

  try {
    await engine.updateSettlementItemAmount({
      actor_account_id: ids.admin,
      calc_run_id: runId,
      settlement_item_id: settlementItemId,
      amount_base: "2"
    });
    results.push({ name: "settlement_items update after finalize", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "settlement_items update after finalize", ok: true, message: e?.message });
  }

  try {
    await engine.deleteSettlementItem({ actor_account_id: ids.admin, calc_run_id: runId, settlement_item_id: settlementItemId });
    results.push({ name: "settlement_items delete after finalize", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "settlement_items delete after finalize", ok: true, message: e?.message });
  }

  try {
    await engine.insertSettlementItem({
      actor_account_id: ids.admin,
      calc_run_id: runId,
      settlement_type: "DAILY_REWARD",
      account_id: ids.user,
      amount_base: "3",
      decimals: 6,
      symbol: "USDC",
      reference_id: `SMOKE:SETTLEMENT:POST_FINALIZE:${suffix}`
    });
    results.push({ name: "settlement_items insert after finalize", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "settlement_items insert after finalize", ok: true, message: e?.message });
  }

  try {
    const summary = await engine.getSummaryReport({
      actor_account_id: ids.reader,
      policy_version_id: policyVersionId,
      from: "2026-06-10 00:00:00",
      to: "2026-06-10 23:59:59"
    });
    results.push({
      name: "READER get summary report",
      ok: summary.total_ledger_events === "2" && summary.finalized_calc_runs === "1",
      message: JSON.stringify(summary)
    });
  } catch (e: any) {
    results.push({ name: "READER get summary report", ok: false, message: e?.message });
  }

  try {
    const auditLogs = await engine.listAuditLogs({
      actor_account_id: ids.admin,
      action: "LEDGER_EVENTS_IMPORT_CSV",
      page: 1,
      limit: 20
    });
    results.push({
      name: "ADMIN list audit_logs filter",
      ok: auditLogs.items.some((item) => item.action === "LEDGER_EVENTS_IMPORT_CSV"),
      message: `total=${auditLogs.total}`
    });
  } catch (e: any) {
    results.push({ name: "ADMIN list audit_logs", ok: false, message: e?.message });
  }

  try {
    await engine.listAuditLogs({ actor_account_id: ids.reader, page: 1, limit: 5 });
    results.push({ name: "READER list audit_logs denied", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "READER list audit_logs denied", ok: true, message: e?.message });
  }

  try {
    await engine.listAuditLogs({ actor_account_id: ids.user, page: 1, limit: 5 });
    results.push({ name: "USER list audit_logs denied", ok: false, message: "unexpected success" });
  } catch (e: any) {
    results.push({ name: "USER list audit_logs denied", ok: true, message: e?.message });
  }

  process.stdout.write("\nRESULTS\n");
  for (const r of results) {
    process.stdout.write(`${r.ok ? "PASS" : "FAIL"}\t${r.name}${r.message ? `\t${r.message}` : ""}\n`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exitCode = 1;
});
