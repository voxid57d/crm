-- Separate migration: PostgreSQL must commit a new enum value before use.
alter type public.app_role add value if not exists 'employee';
