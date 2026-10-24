-- Private objects: immutable upload paths, checked against the actual expense.
create function private.expense_receipt_path(path text,permission text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[];
begin
 parts:=string_to_array(path,'/');
 if array_length(parts,1)<>4 or parts[2]<>'expenses' or parts[4]!~'^[0-9a-f-]{36}\.(pdf|png|jpg|webp)$' then return false;end if;
 return private.expense_allowed(parts[1]::uuid,parts[3]::uuid,permission);
 exception when invalid_text_representation then return false;
end $$;
revoke all on function private.expense_receipt_path(text,text) from public,anon;
grant execute on function private.expense_receipt_path(text,text) to authenticated;
-- The portable SQL harness omits Supabase-owned Storage. Native/live tests cover it.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('finance-receipts','finance-receipts',false,5242880,array['application/pdf','image/png','image/jpeg','image/webp']);
  execute 'create policy finance_receipts_insert on storage.objects for insert to authenticated with check(bucket_id=''finance-receipts'' and owner_id=auth.uid()::text and private.expense_receipt_path(name,''expenses.create''))';
  execute 'create policy finance_receipts_read on storage.objects for select to authenticated using(bucket_id=''finance-receipts'' and private.expense_receipt_path(name,''expenses.view''))';
 end if;
end $$;
