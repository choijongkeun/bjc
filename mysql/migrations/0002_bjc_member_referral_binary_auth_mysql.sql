set sql_safe_updates = 0;

-- BJC member / referral / binary / auth draft migration
-- Assumes 0001_bjc_offchain_core_mysql.sql has already been applied once.
-- Do not run on production yet. This is a review-stage SQL draft only.

-- ---------------------------------------------------------------------------
-- accounts: column expansion
-- ---------------------------------------------------------------------------
alter table accounts
  add column login_id varchar(64) null after id,
  add column password_hash varchar(255) null after login_id,
  add column status varchar(20) not null default 'ACTIVE' after role,
  add column referral_code varchar(32) null after status,
  add column sponsor_account_id char(36) null after referral_code,
  add column binary_parent_account_id char(36) null after sponsor_account_id,
  add column binary_position varchar(10) null after binary_parent_account_id,
  add column joined_at datetime(6) null after binary_position,
  add column last_login_at datetime(6) null after joined_at,
  add column updated_at datetime(6) null after last_login_at;

-- ---------------------------------------------------------------------------
-- accounts: indexes, foreign keys, checks
-- Notes:
-- - login_id / password_hash / referral_code remain nullable for backfill safety
-- - binary_parent_account_id + binary_position is added as a denormalized
--   protection layer in addition to binary_nodes
-- ---------------------------------------------------------------------------
alter table accounts
  add unique key uniq_accounts_login_id (login_id),
  add unique key uniq_accounts_referral_code (referral_code),
  add key idx_accounts_sponsor_account_id (sponsor_account_id),
  add key idx_accounts_binary_parent_account_id (binary_parent_account_id),
  add unique key uniq_accounts_binary_parent_position (binary_parent_account_id, binary_position),
  add constraint fk_accounts_sponsor_account
    foreign key (sponsor_account_id) references accounts(id),
  add constraint fk_accounts_binary_parent_account
    foreign key (binary_parent_account_id) references accounts(id),
  add constraint chk_accounts_status
    check (status in ('ACTIVE', 'BLOCKED', 'WITHDRAWN')),
  add constraint chk_accounts_binary_position
    check (binary_position is null or binary_position in ('LEFT', 'RIGHT')),
  add constraint chk_accounts_sponsor_not_self
    check (sponsor_account_id is null or sponsor_account_id <> id),
  add constraint chk_accounts_binary_parent_not_self
    check (binary_parent_account_id is null or binary_parent_account_id <> id);

-- ---------------------------------------------------------------------------
-- auth_sessions
-- - session-first auth storage
-- - stores hash only, never raw session token
-- ---------------------------------------------------------------------------
create table if not exists auth_sessions (
  id bigint not null auto_increment,
  account_id char(36) not null,
  session_token_hash varchar(255) not null,
  expires_at datetime(6) not null,
  revoked_at datetime(6) null,
  created_at datetime(6) not null default current_timestamp(6),
  last_seen_at datetime(6) null,
  user_agent varchar(255) null,
  ip_address varchar(64) null,
  primary key (id),
  unique key uniq_auth_sessions_token_hash (session_token_hash),
  key idx_auth_sessions_account_id (account_id),
  key idx_auth_sessions_expires_at (expires_at),
  key idx_auth_sessions_revoked_at (revoked_at),
  constraint fk_auth_sessions_account
    foreign key (account_id) references accounts(id)
) engine=InnoDB default charset=utf8mb4;

-- ---------------------------------------------------------------------------
-- binary_nodes
-- - source of truth for direct binary parent / child placement
-- - root members may have parent_account_id = null and position = null
-- - one direct LEFT and one direct RIGHT child per parent
-- ---------------------------------------------------------------------------
create table if not exists binary_nodes (
  account_id char(36) not null,
  parent_account_id char(36) null,
  position varchar(10) null,
  root_account_id char(36) null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) null,
  primary key (account_id),
  unique key uniq_binary_nodes_parent_position (parent_account_id, position),
  key idx_binary_nodes_parent_account_id (parent_account_id),
  key idx_binary_nodes_root_account_id (root_account_id),
  constraint fk_binary_nodes_account
    foreign key (account_id) references accounts(id),
  constraint fk_binary_nodes_parent_account
    foreign key (parent_account_id) references accounts(id),
  constraint fk_binary_nodes_root_account
    foreign key (root_account_id) references accounts(id),
  constraint chk_binary_nodes_position
    check (position is null or position in ('LEFT', 'RIGHT')),
  constraint chk_binary_nodes_parent_not_self
    check (parent_account_id is null or parent_account_id <> account_id)
) engine=InnoDB default charset=utf8mb4;

-- ---------------------------------------------------------------------------
-- binary_edges
-- - closure table for binary traversal and leg aggregations
-- - self row policy:
--   * self row allowed with depth = 0 and root_leg = null
--   * non-self rows require depth > 0 and root_leg in ('LEFT', 'RIGHT')
-- ---------------------------------------------------------------------------
create table if not exists binary_edges (
  id bigint not null auto_increment,
  ancestor_account_id char(36) not null,
  descendant_account_id char(36) not null,
  depth int not null,
  root_leg varchar(10) null,
  path varchar(1000) null,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key uniq_binary_edges_ancestor_descendant (ancestor_account_id, descendant_account_id),
  key idx_binary_edges_ancestor_depth (ancestor_account_id, depth),
  key idx_binary_edges_descendant (descendant_account_id),
  key idx_binary_edges_root_leg (root_leg),
  key idx_binary_edges_ancestor_root_leg_depth (ancestor_account_id, root_leg, depth),
  constraint fk_binary_edges_ancestor_account
    foreign key (ancestor_account_id) references accounts(id),
  constraint fk_binary_edges_descendant_account
    foreign key (descendant_account_id) references accounts(id),
  constraint chk_binary_edges_depth
    check (depth >= 0),
  constraint chk_binary_edges_root_leg
    check (root_leg is null or root_leg in ('LEFT', 'RIGHT')),
  constraint chk_binary_edges_self_row
    check (
      (ancestor_account_id = descendant_account_id and depth = 0 and root_leg is null)
      or
      (ancestor_account_id <> descendant_account_id and depth > 0 and root_leg in ('LEFT', 'RIGHT'))
    )
) engine=InnoDB default charset=utf8mb4;

-- ---------------------------------------------------------------------------
-- referral_edges reuse policy
-- ---------------------------------------------------------------------------
-- referral_edges is intentionally reused as the sponsor closure table.
-- 0002 does not drop, recreate, or rename referral_edges.
-- If future API naming differs from the existing schema, map it in the service layer.
