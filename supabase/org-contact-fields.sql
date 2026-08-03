-- Org contact fields for public portal.
-- Self-contained: includes the website/instagram columns written by saveOrgProfile
-- (phase7-org-portal-upi.sql) so Edit profile works even on a fresh/reset DB.
alter table organizations add column if not exists contact_email text default '';
alter table organizations add column if not exists contact_phone text default '';
alter table organizations add column if not exists website text default '';
alter table organizations add column if not exists instagram text default '';
