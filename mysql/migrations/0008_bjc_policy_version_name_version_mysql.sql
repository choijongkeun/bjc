alter table policy_versions
  add column name varchar(255) null after id,
  add column version varchar(64) null after name;

update policy_versions
set
  name = case
    when note is not null and char_length(trim(note)) > 0 then trim(note)
    else concat('Legacy Policy ', substr(id, 1, 8))
  end,
  version = concat('LEGACY-', upper(substr(id, 1, 8)))
where name is null
   or version is null;

alter table policy_versions
  modify column name varchar(255) not null,
  modify column version varchar(64) not null,
  add unique key uniq_policy_versions_name_version (name, version);
