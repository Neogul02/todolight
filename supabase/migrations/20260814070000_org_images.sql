-- 조직 아이콘. 없으면 조직 이름 첫 글자 + id에서 뽑은 색으로 그린다.
alter table public.organizations add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-images', 'org-images', true, 2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 경로 규칙: {org_id}/icon.webp — 첫 번째 폴더가 조직 id이고, 그 조직의 방장/관리자만 쓸 수 있다.
drop policy if exists org_images_read on storage.objects;
create policy org_images_read on storage.objects
  for select using (bucket_id = 'org-images');

drop policy if exists org_images_write on storage.objects;
create policy org_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-images'
    and public.is_org_manager(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists org_images_update on storage.objects;
create policy org_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'org-images'
    and public.is_org_manager(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'org-images'
    and public.is_org_manager(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists org_images_delete on storage.objects;
create policy org_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-images'
    and public.is_org_manager(((storage.foldername(name))[1])::uuid)
  );
