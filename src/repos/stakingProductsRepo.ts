import type { DbConn } from "../db/pool.js";

export type StakingProductRow = {
  id: string;
  policy_version_id: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stake_amount_base: string;
  max_stake_amount_base: string;
  staking_days: number;
  daily_interest_bps: string;
  is_active: number | boolean;
  created_at: string;
};

export async function insertStakingProduct(
  conn: DbConn,
  input: {
    id: string;
    policy_version_id: string;
    name: string;
    symbol: string;
    decimals: number;
    min_stake_amount_base: string;
    max_stake_amount_base: string;
    staking_days: number;
    daily_interest_bps: string;
    is_active: boolean;
  }
): Promise<void> {
  await conn.query(
    "insert into staking_products (id, policy_version_id, name, symbol, decimals, min_stake_amount_base, max_stake_amount_base, staking_days, daily_interest_bps, is_active) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.id,
      input.policy_version_id,
      input.name,
      input.symbol,
      input.decimals,
      input.min_stake_amount_base,
      input.max_stake_amount_base,
      input.staking_days,
      input.daily_interest_bps,
      input.is_active ? 1 : 0
    ]
  );
}

export async function listStakingProducts(
  conn: DbConn,
  input: {
    policy_version_id?: string;
    is_active?: boolean;
    symbol?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: StakingProductRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (typeof input.is_active === "boolean") {
    where.push("is_active = ?");
    params.push(input.is_active ? 1 : 0);
  }
  if (input.symbol) {
    where.push("symbol = ?");
    params.push(input.symbol);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from staking_products ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, policy_version_id, name, symbol, decimals, min_stake_amount_base, max_stake_amount_base, staking_days, daily_interest_bps, is_active, created_at
       from staking_products
       ${whereSql}
      order by created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as StakingProductRow[], total };
}
