set sql_safe_updates = 0;

-- Usage:
-- mysql --force < mysql/smoke/bjc_account_stakings_smoketest.sql
-- The script intentionally triggers several failing statements and rolls back at the end.

set @smoke_account_id := (
  select id
  from accounts
  where role = 'USER'
    and status = 'ACTIVE'
  order by created_at asc, id asc
  limit 1
);

set @smoke_product_id := (
  select id
  from staking_products
  where is_active = 1
  order by created_at asc, id asc
  limit 1
);

set @smoke_policy_id := (
  select policy_version_id
  from staking_products
  where id = @smoke_product_id
  limit 1
);

set @before_count := (select count(*) from account_stakings);
set @before_pending_count := (select count(*) from account_stakings where status = 'PENDING');

select @smoke_account_id as smoke_account_id, @smoke_product_id as smoke_product_id, @smoke_policy_id as smoke_policy_id;

start transaction;

set @staking_id_ok := uuid();
set @idem_ok := concat('smoke-account-staking-', replace(uuid(), '-', ''));

insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key,
  started_at,
  matures_at,
  created_at,
  updated_at
) values (
  @staking_id_ok,
  @smoke_account_id,
  @smoke_product_id,
  @smoke_policy_id,
  1000000,
  50,
  30,
  'PENDING',
  @idem_ok,
  null,
  null,
  current_timestamp(6),
  current_timestamp(6)
);

select
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  started_at,
  matures_at,
  activated_at,
  cancelled_at,
  matured_at,
  closed_at
from account_stakings
where id = @staking_id_ok;

-- invalid account FK
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  '00000000-0000-0000-0000-000000000001',
  @smoke_product_id,
  @smoke_policy_id,
  1000000,
  50,
  30,
  'PENDING',
  concat('smoke-account-staking-', replace(uuid(), '-', ''))
);

-- invalid product FK
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  @smoke_account_id,
  '00000000-0000-0000-0000-000000000002',
  @smoke_policy_id,
  1000000,
  50,
  30,
  'PENDING',
  concat('smoke-account-staking-', replace(uuid(), '-', ''))
);

-- principal zero failure
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  @smoke_account_id,
  @smoke_product_id,
  @smoke_policy_id,
  0,
  50,
  30,
  'PENDING',
  concat('smoke-account-staking-', replace(uuid(), '-', ''))
);

-- principal negative failure
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  @smoke_account_id,
  @smoke_product_id,
  @smoke_policy_id,
  -1,
  50,
  30,
  'PENDING',
  concat('smoke-account-staking-', replace(uuid(), '-', ''))
);

-- invalid status failure
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  @smoke_account_id,
  @smoke_product_id,
  @smoke_policy_id,
  1000000,
  50,
  30,
  'INVALID_STATUS',
  concat('smoke-account-staking-', replace(uuid(), '-', ''))
);

-- duplicate idempotency key failure
insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key
) values (
  uuid(),
  @smoke_account_id,
  @smoke_product_id,
  @smoke_policy_id,
  1000000,
  50,
  30,
  'PENDING',
  @idem_ok
);

select
  (select count(*) from account_stakings) as count_inside_transaction,
  (select count(*) from account_stakings where status = 'PENDING') as pending_inside_transaction;

rollback;

select
  @before_count as before_count,
  (select count(*) from account_stakings) as after_rollback_count,
  @before_pending_count as before_pending_count,
  (select count(*) from account_stakings where status = 'PENDING') as after_rollback_pending_count;
