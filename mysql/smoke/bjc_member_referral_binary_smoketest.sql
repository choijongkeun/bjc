-- BJC member / referral / binary / auth smoke test for 0002 draft
-- This script is intended for manual execution and log review.
-- Statements marked "should fail" are PASS when MySQL returns the expected error.
-- Expected error codes:
-- - duplicate key: ERROR 1062
-- - foreign key:   ERROR 1452
-- - CHECK:         ERROR 3819

set sql_safe_updates = 0;

set @suffix := replace(uuid(), '-', '');
set @root_admin_id := uuid();
set @sponsor_id := uuid();
set @user_id := uuid();
set @ghost_id := uuid();

-- ---------------------------------------------------------------------------
-- T1 root/admin account insert
-- ---------------------------------------------------------------------------
select concat('T1 root/admin account insert (suffix=', @suffix, ')') as test;
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values (
  @root_admin_id,
  concat('admin_', @suffix),
  concat('hash_', @suffix, '_admin'),
  concat('Admin ', @suffix),
  'ADMIN',
  'ACTIVE',
  concat('REFADMIN', left(@suffix, 8)),
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T2 sponsor account insert
-- ---------------------------------------------------------------------------
select 'T2 sponsor account insert' as test;
insert into accounts (
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
  updated_at
) values (
  @sponsor_id,
  concat('sponsor_', @suffix),
  concat('hash_', @suffix, '_sponsor'),
  concat('Sponsor ', @suffix),
  'USER',
  'ACTIVE',
  concat('REFSP', left(@suffix, 8)),
  @root_admin_id,
  @root_admin_id,
  'LEFT',
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T3 new USER account insert with referral_code
-- ---------------------------------------------------------------------------
select 'T3 new USER account insert with referral_code and sponsor/binary parent' as test;
insert into accounts (
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
  updated_at
) values (
  @user_id,
  concat('user_', @suffix),
  concat('hash_', @suffix, '_user'),
  concat('User ', @suffix),
  'USER',
  'ACTIVE',
  concat('REFUSR', left(@suffix, 8)),
  @sponsor_id,
  @sponsor_id,
  'LEFT',
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T4 duplicate login_id should fail
-- PASS if MySQL returns ERROR 1062
-- ---------------------------------------------------------------------------
select 'T4 duplicate login_id should fail with duplicate key (PASS if ERROR 1062)' as test;
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values (
  uuid(),
  concat('user_', @suffix),
  concat('hash_dup_', @suffix),
  'Duplicate Login',
  'USER',
  'ACTIVE',
  concat('REFDUPL', left(@suffix, 8)),
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T5 duplicate referral_code should fail
-- PASS if MySQL returns ERROR 1062
-- ---------------------------------------------------------------------------
select 'T5 duplicate referral_code should fail with duplicate key (PASS if ERROR 1062)' as test;
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values (
  uuid(),
  concat('user_dup_ref_', @suffix),
  concat('hash_dup_ref_', @suffix),
  'Duplicate Referral',
  'USER',
  'ACTIVE',
  concat('REFUSR', left(@suffix, 8)),
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T6 missing sponsor_account_id should fail
-- PASS if MySQL returns ERROR 1452
-- ---------------------------------------------------------------------------
select 'T6 missing sponsor_account_id should fail with FK error (PASS if ERROR 1452)' as test;
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  sponsor_account_id,
  joined_at,
  updated_at
) values (
  uuid(),
  concat('user_bad_sponsor_', @suffix),
  concat('hash_bad_sponsor_', @suffix),
  'Bad Sponsor',
  'USER',
  'ACTIVE',
  concat('REFBAD', left(@suffix, 8)),
  @ghost_id,
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T7 binary_nodes root insert
-- ---------------------------------------------------------------------------
select 'T7 binary_nodes root insert' as test;
insert into binary_nodes (
  account_id,
  parent_account_id,
  position,
  root_account_id,
  updated_at
) values (
  @root_admin_id,
  null,
  null,
  @root_admin_id,
  now(6)
);

-- ---------------------------------------------------------------------------
-- T8 binary_nodes LEFT insert success
-- ---------------------------------------------------------------------------
select 'T8 binary_nodes LEFT insert success' as test;
insert into binary_nodes (
  account_id,
  parent_account_id,
  position,
  root_account_id,
  updated_at
) values (
  @sponsor_id,
  @root_admin_id,
  'LEFT',
  @root_admin_id,
  now(6)
);

-- ---------------------------------------------------------------------------
-- T9 duplicate LEFT under same parent should fail
-- PASS if MySQL returns ERROR 1062
-- ---------------------------------------------------------------------------
select 'T9 duplicate LEFT under same parent should fail (PASS if ERROR 1062)' as test;
set @left_dup_id := uuid();
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values (
  @left_dup_id,
  concat('left_dup_', @suffix),
  concat('hash_left_dup_', @suffix),
  'Duplicate Left Candidate',
  'USER',
  'ACTIVE',
  concat('REFLDP', left(@suffix, 8)),
  now(6),
  now(6)
);
insert into binary_nodes (
  account_id,
  parent_account_id,
  position,
  root_account_id,
  updated_at
) values (
  @left_dup_id,
  @root_admin_id,
  'LEFT',
  @root_admin_id,
  now(6)
);

-- ---------------------------------------------------------------------------
-- T10 binary_nodes RIGHT insert success
-- ---------------------------------------------------------------------------
select 'T10 binary_nodes RIGHT insert success' as test;
set @right_id := uuid();
insert into accounts (
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
  updated_at
) values (
  @right_id,
  concat('right_', @suffix),
  concat('hash_right_', @suffix),
  concat('Right ', @suffix),
  'USER',
  'ACTIVE',
  concat('REFRGT', left(@suffix, 8)),
  @root_admin_id,
  @root_admin_id,
  'RIGHT',
  now(6),
  now(6)
);
insert into binary_nodes (
  account_id,
  parent_account_id,
  position,
  root_account_id,
  updated_at
) values (
  @right_id,
  @root_admin_id,
  'RIGHT',
  @root_admin_id,
  now(6)
);

-- ---------------------------------------------------------------------------
-- T11 binary_edges closure insert
-- ---------------------------------------------------------------------------
select 'T11 binary_edges closure insert' as test;
insert into binary_edges (
  ancestor_account_id,
  descendant_account_id,
  depth,
  root_leg,
  path
) values
  (@root_admin_id, @root_admin_id, 0, null, concat('/', @root_admin_id, '/')),
  (@root_admin_id, @sponsor_id, 1, 'LEFT', concat('/', @root_admin_id, '/', @sponsor_id, '/')),
  (@sponsor_id, @sponsor_id, 0, null, concat('/', @sponsor_id, '/')),
  (@root_admin_id, @right_id, 1, 'RIGHT', concat('/', @root_admin_id, '/', @right_id, '/')),
  (@right_id, @right_id, 0, null, concat('/', @right_id, '/'));

-- ---------------------------------------------------------------------------
-- T12 duplicate ancestor/descendant should fail
-- PASS if MySQL returns ERROR 1062
-- ---------------------------------------------------------------------------
select 'T12 duplicate ancestor/descendant should fail (PASS if ERROR 1062)' as test;
insert into binary_edges (
  ancestor_account_id,
  descendant_account_id,
  depth,
  root_leg,
  path
) values (
  @root_admin_id,
  @sponsor_id,
  1,
  'LEFT',
  concat('/dup/', @root_admin_id, '/', @sponsor_id, '/')
);

-- ---------------------------------------------------------------------------
-- T13 auth_sessions insert success
-- ---------------------------------------------------------------------------
select 'T13 auth_sessions insert success' as test;
set @session_hash := concat('sess_', @suffix);
insert into auth_sessions (
  account_id,
  session_token_hash,
  expires_at,
  revoked_at,
  last_seen_at,
  user_agent,
  ip_address
) values (
  @user_id,
  @session_hash,
  date_add(now(6), interval 30 day),
  null,
  now(6),
  'mysql-smoke',
  '127.0.0.1'
);

-- ---------------------------------------------------------------------------
-- T14 duplicate session_token_hash should fail
-- PASS if MySQL returns ERROR 1062
-- ---------------------------------------------------------------------------
select 'T14 duplicate session_token_hash should fail (PASS if ERROR 1062)' as test;
insert into auth_sessions (
  account_id,
  session_token_hash,
  expires_at,
  revoked_at,
  last_seen_at,
  user_agent,
  ip_address
) values (
  @sponsor_id,
  @session_hash,
  date_add(now(6), interval 30 day),
  null,
  now(6),
  'mysql-smoke-dup',
  '127.0.0.1'
);

-- ---------------------------------------------------------------------------
-- T15 invalid status should fail due to CHECK
-- PASS if MySQL returns ERROR 3819
-- ---------------------------------------------------------------------------
select 'T15 invalid status should fail due to CHECK (PASS if ERROR 3819)' as test;
insert into accounts (
  id,
  login_id,
  password_hash,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values (
  uuid(),
  concat('bad_status_', @suffix),
  concat('hash_bad_status_', @suffix),
  'Bad Status',
  'USER',
  'PENDING',
  concat('REFBST', left(@suffix, 8)),
  now(6),
  now(6)
);

-- ---------------------------------------------------------------------------
-- T16 invalid binary_position should fail due to CHECK
-- PASS if MySQL returns ERROR 3819
-- ---------------------------------------------------------------------------
select 'T16 invalid binary_position should fail due to CHECK (PASS if ERROR 3819)' as test;
insert into accounts (
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
  updated_at
) values (
  uuid(),
  concat('bad_pos_', @suffix),
  concat('hash_bad_pos_', @suffix),
  'Bad Position',
  'USER',
  'ACTIVE',
  concat('REFBPS', left(@suffix, 8)),
  @root_admin_id,
  @root_admin_id,
  'CENTER',
  now(6),
  now(6)
);
