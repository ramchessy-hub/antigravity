alter table battery_reports
  add column if not exists temperature_c double precision,
  add column if not exists heat_status text default 'cool';
