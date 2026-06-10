set @suffix := replace(uuid(), '-', '');
set @admin_id := uuid();
set @reader_id := uuid();
set @user_id := uuid();

select concat('T1 accounts insert (suffix=', @suffix, ')') as test;
insert into accounts (id, display_name, role)
values
  (@admin_id, 'Admin', 'ADMIN'),
  (@reader_id, 'Reader', 'READER'),
  (@user_id, 'User', 'USER');

select 'T2 policy_versions ACTIVE unique (1st should succeed)' as test;
insert into policy_versions (status, note, created_by)
values ('ACTIVE', concat('smoketest active 1 ', @suffix), @admin_id);

select 'T3 policy_versions ACTIVE unique (2nd should fail with duplicate key)' as test;
insert into policy_versions (status, note, created_by)
values ('ACTIVE', concat('smoketest active 2 ', @suffix), @admin_id);

select 'T4 staking_products decimals check (should fail)' as test;
set @pv_draft := uuid();
insert into policy_versions (id, status, note, created_by)
values (@pv_draft, 'DRAFT', concat('smoketest draft ', @suffix), @admin_id);
insert into staking_products (
  policy_version_id,
  name,
  symbol,
  decimals,
  min_stake_amount_base,
  max_stake_amount_base,
  staking_days,
  daily_interest_bps,
  is_active
) values (
  @pv_draft,
  '30D',
  'USDC',
  40,
  1,
  1000,
  30,
  50,
  1
);

select 'T5 ledger_events reference_id unique (2nd should fail)' as test;
set @product_id := uuid();
insert into staking_products (
  id,
  policy_version_id,
  name,
  symbol,
  decimals,
  min_stake_amount_base,
  max_stake_amount_base,
  staking_days,
  daily_interest_bps,
  is_active
) values (
  @product_id,
  @pv_draft,
  '30D',
  'USDC',
  6,
  1,
  1000,
  30,
  50,
  1
);
set @ref_id := concat('SMOKE:LEDGER:', @suffix);
insert into ledger_events (
  account_id,
  product_id,
  policy_version_id,
  calc_run_id,
  event_time,
  event_type,
  amount_base,
  decimals,
  symbol,
  reference_id,
  related_account_id,
  meta,
  created_by
) values (
  @user_id,
  @product_id,
  @pv_draft,
  null,
  now(),
  'STAKE',
  100,
  6,
  'USDC',
  @ref_id,
  null,
  json_object('k', 'v'),
  @admin_id
);
insert into ledger_events (
  account_id,
  product_id,
  policy_version_id,
  calc_run_id,
  event_time,
  event_type,
  amount_base,
  decimals,
  symbol,
  reference_id,
  related_account_id,
  meta,
  created_by
) values (
  @user_id,
  @product_id,
  @pv_draft,
  null,
  now(),
  'STAKE',
  100,
  6,
  'USDC',
  @ref_id,
  null,
  json_object('k', 'v2'),
  @admin_id
);

