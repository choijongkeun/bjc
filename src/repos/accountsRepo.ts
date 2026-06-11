import type { DbConn } from "../db/pool.js";

export type AccountRole = "USER" | "READER" | "ADMIN";
export type AccountStatus = "ACTIVE" | "BLOCKED" | "WITHDRAWN";
export type BinaryPosition = "LEFT" | "RIGHT";

export type AccountRow = {
  id: string;
  display_name: string | null;
  role: AccountRole;
  created_at: string;
};

export type AccountAuthRow = {
  id: string;
  login_id: string | null;
  password_hash: string | null;
  display_name: string | null;
  role: AccountRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AccountNetworkRow = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: AccountRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AdminAccountSort = "joined_at_desc" | "joined_at_asc" | "login_id_asc" | "total_stake_desc";

export type AdminAccountListRow = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: AccountRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  sponsor_login_id: string | null;
  binary_parent_account_id: string | null;
  binary_parent_login_id: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
};

export type AdminAccountDetailRow = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: AccountRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  sponsor_login_id: string | null;
  sponsor_display_name: string | null;
  binary_parent_account_id: string | null;
  binary_parent_login_id: string | null;
  binary_parent_display_name: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type AdminAccountListFilters = {
  q?: string;
  role?: AccountRole;
  status?: AccountStatus;
  sponsor_account_id?: string;
  binary_parent_account_id?: string;
  binary_position?: BinaryPosition;
};

function buildAdminAccountWhere(filters: AdminAccountListFilters): { whereClause: string; params: unknown[] } {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (filters.q) {
    const q = `%${filters.q}%`;
    clauses.push("(a.login_id like ? or a.display_name like ? or a.referral_code like ?)");
    params.push(q, q, q);
  }
  if (filters.role) {
    clauses.push("a.role = ?");
    params.push(filters.role);
  }
  if (filters.status) {
    clauses.push("a.status = ?");
    params.push(filters.status);
  }
  if (filters.sponsor_account_id) {
    clauses.push("a.sponsor_account_id = ?");
    params.push(filters.sponsor_account_id);
  }
  if (filters.binary_parent_account_id) {
    clauses.push("a.binary_parent_account_id = ?");
    params.push(filters.binary_parent_account_id);
  }
  if (filters.binary_position) {
    clauses.push("a.binary_position = ?");
    params.push(filters.binary_position);
  }

  return {
    whereClause: clauses.join(" and "),
    params
  };
}

function toAdminAccountOrderBy(sort: AdminAccountSort): string {
  switch (sort) {
    case "joined_at_asc":
      return "a.joined_at asc, a.id asc";
    case "login_id_asc":
      return "a.login_id asc, a.id asc";
    case "total_stake_desc":
      return "a.joined_at desc, a.id desc";
    case "joined_at_desc":
    default:
      return "a.joined_at desc, a.id desc";
  }
}

export async function getAccountById(conn: DbConn, id: string): Promise<AccountRow | null> {
  const [rows] = await conn.query(
    "select id, display_name, role, created_at from accounts where id = ? limit 1",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountRow;
}

export async function getAccountAuthById(conn: DbConn, id: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where id = ?
      limit 1`,
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function getAccountNetworkById(conn: DbConn, id: string): Promise<AccountNetworkRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where id = ?
      limit 1`,
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountNetworkRow;
}

export async function getAccountByIdForUpdate(conn: DbConn, id: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where id = ?
      limit 1
      for update`,
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function getAccountByLoginId(conn: DbConn, loginId: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where login_id = ?
      limit 1`,
    [loginId]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function getAccountByLoginIdForUpdate(conn: DbConn, loginId: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where login_id = ?
      limit 1
      for update`,
    [loginId]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function getAccountByReferralCode(conn: DbConn, referralCode: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where referral_code = ?
      limit 1`,
    [referralCode]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function getAccountByReferralCodeForUpdate(conn: DbConn, referralCode: string): Promise<AccountAuthRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        created_at,
        updated_at
       from accounts
      where referral_code = ?
      limit 1
      for update`,
    [referralCode]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountAuthRow;
}

export async function insertAccount(
  conn: DbConn,
  input: {
    id: string;
    login_id: string;
    password_hash: string;
    display_name: string;
    role: AccountRole;
    status: AccountStatus;
    referral_code: string;
    sponsor_account_id: string;
    binary_parent_account_id: string;
    binary_position: BinaryPosition;
    joined_at: Date;
    last_login_at: Date;
    updated_at: Date;
  }
): Promise<void> {
  await conn.query(
    `insert into accounts (
        id,
        login_id,
        password_hash,
        display_name,
        role,
        status,
        referral_code,
        sponsor_account_id,
        binary_parent_account_id,
        binary_position,
        joined_at,
        last_login_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.login_id,
      input.password_hash,
      input.display_name,
      input.role,
      input.status,
      input.referral_code,
      input.sponsor_account_id,
      input.binary_parent_account_id,
      input.binary_position,
      input.joined_at,
      input.last_login_at,
      input.updated_at
    ]
  );
}

export async function updateAccountBinaryPlacement(
  conn: DbConn,
  input: {
    id: string;
    binary_parent_account_id: string;
    binary_position: BinaryPosition;
    updated_at: Date;
  }
): Promise<void> {
  await conn.query(
    `update accounts
        set binary_parent_account_id = ?,
            binary_position = ?,
            updated_at = ?
      where id = ?`,
    [input.binary_parent_account_id, input.binary_position, input.updated_at, input.id]
  );
}

export async function updateAccountLoginSuccess(
  conn: DbConn,
  input: { id: string; last_login_at: Date; updated_at: Date }
): Promise<void> {
  await conn.query(
    `update accounts
        set last_login_at = ?,
            updated_at = ?
      where id = ?`,
    [input.last_login_at, input.updated_at, input.id]
  );
}

export async function listAccountsForAdmin(
  conn: DbConn,
  input: AdminAccountListFilters & {
    limit: number;
    offset: number;
    sort: AdminAccountSort;
  }
): Promise<AdminAccountListRow[]> {
  const { whereClause, params } = buildAdminAccountWhere(input);
  const [rows] = await conn.query(
    `select
        a.id,
        a.login_id,
        a.display_name,
        a.role,
        a.status,
        a.referral_code,
        a.sponsor_account_id,
        sponsor.login_id as sponsor_login_id,
        a.binary_parent_account_id,
        parent.login_id as binary_parent_login_id,
        a.binary_position,
        a.joined_at,
        a.last_login_at
       from accounts a
       left join accounts sponsor
         on sponsor.id = a.sponsor_account_id
       left join accounts parent
         on parent.id = a.binary_parent_account_id
      where ${whereClause}
      order by ${toAdminAccountOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, input.offset]
  );

  return rows as AdminAccountListRow[];
}

export async function countAccountsForAdmin(conn: DbConn, input: AdminAccountListFilters): Promise<number> {
  const { whereClause, params } = buildAdminAccountWhere(input);
  const [rows] = await conn.query(
    `select count(*) as total
       from accounts a
      where ${whereClause}`,
    params
  );
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
}

export async function getAccountAdminDetailById(conn: DbConn, id: string): Promise<AdminAccountDetailRow | null> {
  const [rows] = await conn.query(
    `select
        a.id,
        a.login_id,
        a.display_name,
        a.role,
        a.status,
        a.referral_code,
        a.sponsor_account_id,
        sponsor.login_id as sponsor_login_id,
        sponsor.display_name as sponsor_display_name,
        a.binary_parent_account_id,
        parent.login_id as binary_parent_login_id,
        parent.display_name as binary_parent_display_name,
        a.binary_position,
        a.joined_at,
        a.last_login_at,
        a.created_at,
        a.updated_at
       from accounts a
       left join accounts sponsor
         on sponsor.id = a.sponsor_account_id
       left join accounts parent
         on parent.id = a.binary_parent_account_id
      where a.id = ?
      limit 1`,
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AdminAccountDetailRow;
}
