-- Org contact fields for public portal
alter table organizations add column if not exists contact_email text default '';
alter table organizations add column if not exists contact_phone text default '';
