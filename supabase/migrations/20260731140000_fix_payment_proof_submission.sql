-- Apex Bookings: Resilient Payment Proof Submission
-- Adds storage policies and helper RPCs to enable seamless payment proof uploads
-- both via Edge Functions and via direct Storage + RPC fallback.

-- ─── 1. Storage Policy for Public Proof Uploads ──────────────────────────────
drop policy if exists "public can upload payment proofs" on storage.objects;
create policy "public can upload payment proofs" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs');

-- ─── 2. RPC: public_get_payment_upload_info ──────────────────────────────────
-- Securely returns the organization_id for a given payment so the client
-- can construct the correct storage upload path ({organizationId}/{paymentId}/{filename}).
create or replace function public.public_get_payment_upload_info(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'paymentId', p.id,
    'bookingId', p.booking_id,
    'organizationId', e.organization_id
  ) into result
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  join public.events e on e.id = b.event_id
  where p.id = p_payment_id and p.deleted_at is null;

  if result is null then
    raise exception 'Payment not found (payment_id=%)', p_payment_id;
  end if;

  return result;
end;
$$;

grant execute on function public.public_get_payment_upload_info(uuid) to anon, authenticated;

-- ─── 3. RPC: public_submit_payment_proof ─────────────────────────────────────
-- Atomically creates media records, links payment proofs, updates payment status,
-- updates booking payment state, updates bank transfer request status (if provided),
-- and creates an in-app notification.
create or replace function public.public_submit_payment_proof(
  p_payment_id uuid,
  p_files jsonb,
  p_bank_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payment record;
  target_org_id uuid;
  file_item jsonb;
  media_id_val uuid;
  proof_paths text[] := array[]::text[];
  existing_meta jsonb;
begin
  select p.id, p.booking_id, p.metadata, e.organization_id
  into target_payment
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  join public.events e on e.id = b.event_id
  where p.id = p_payment_id and p.deleted_at is null;

  if target_payment.id is null then
    raise exception 'Payment not found';
  end if;

  target_org_id := target_payment.organization_id;

  for file_item in select * from jsonb_array_elements(p_files) loop
    insert into public.media(
      organization_id,
      bucket,
      path,
      mime_type,
      size_bytes,
      is_chat_media
    )
    values (
      target_org_id,
      'payment-proofs',
      file_item ->> 'path',
      coalesce(file_item ->> 'mimeType', 'image/jpeg'),
      coalesce((file_item ->> 'size')::bigint, 0),
      false
    )
    on conflict (bucket, path) do update set
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      updated_at = now()
    returning id into media_id_val;

    insert into public.payment_proofs(payment_id, media_id)
    values (p_payment_id, media_id_val)
    on conflict (payment_id, media_id) do nothing;

    proof_paths := array_append(proof_paths, file_item ->> 'path');
  end loop;

  existing_meta := coalesce(target_payment.metadata, '{}'::jsonb);

  update public.payments
  set
    status = 'pending',
    metadata = existing_meta || jsonb_build_object('proofPaths', to_jsonb(proof_paths)),
    updated_at = now()
  where id = p_payment_id;

  update public.bookings
  set
    payment_state = 'payment_submitted',
    updated_at = now()
  where id = target_payment.booking_id;

  if p_bank_request_id is not null then
    update public.bank_transfer_requests
    set
      status = 'payment_proof_submitted',
      updated_at = now()
    where id = p_bank_request_id and booking_id = target_payment.booking_id;
  end if;

  insert into public.notifications(organization_id, type, payload)
  values (
    target_org_id,
    'payment_proof',
    jsonb_build_object('paymentId', p_payment_id, 'bookingId', target_payment.booking_id)
  );

  return jsonb_build_object('ok', true, 'count', array_length(proof_paths, 1));
end;
$$;

grant execute on function public.public_submit_payment_proof(uuid, jsonb, uuid) to anon, authenticated;
