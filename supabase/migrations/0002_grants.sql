-- Pocket Maestro: let signed-in users reach the tables through the app.
-- Row-level security (from 0001) still decides WHICH rows each person can see or change.
-- Anonymous (signed-out) visitors get no table access at all.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on all tables in schema public from anon;
