-- Public posters / org assets / execom photos bucket + RLS
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-posters',
  'event-posters',
  true,
  5242880,
  array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read event posters" on storage.objects;
drop policy if exists "Auth upload event posters" on storage.objects;
drop policy if exists "Auth update event posters" on storage.objects;
drop policy if exists "Auth delete event posters" on storage.objects;

create policy "Public read event posters"
  on storage.objects for select
  to public
  using (bucket_id = 'event-posters');

create policy "Auth upload event posters"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-posters');

create policy "Auth update event posters"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-posters')
  with check (bucket_id = 'event-posters');

create policy "Auth delete event posters"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-posters');
