'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isValidEventColor } from '@/lib/event-colors';
import { requireAuth, wrap } from './_base';
import type { ApiResponse } from '@/types/api';
import type { OrgEvent } from '@/types/db';

const titleSchema = z.string().trim().min(1, '일정 이름을 입력해 주세요.').max(200);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 맞지 않아요.');

const COLUMNS =
  'id, org_id, title, color, start_date, end_date, created_by, created_at, updated_at, deleted_at';

async function assertMember(orgId: string, userId: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('이 조직의 멤버가 아니에요.');
}

/** 시작·끝을 정리한다. 거꾸로 넣었으면 뒤집어 준다 — 막느니 고쳐 주는 쪽이 낫다 */
function normalizeRange(start: string, end: string): { start: string; end: string } {
  const s = dateSchema.parse(start);
  const e = dateSchema.parse(end);
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

/** 조직 일정 전부. 달력이 월을 넘나들며 보므로 기간 필터 없이 한 번에 읽는다 */
export async function fetchOrgEvents(orgId: string): Promise<ApiResponse<OrgEvent[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    await assertMember(orgId, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('org_events')
      .select(COLUMNS)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as OrgEvent[];
  });
}

export async function createOrgEvent(input: {
  orgId: string;
  title: string;
  color: string;
  startDate: string;
  endDate: string;
}): Promise<ApiResponse<OrgEvent>> {
  return wrap(async () => {
    const user = await requireAuth();
    await assertMember(input.orgId, user.id);

    const title = titleSchema.parse(input.title);
    if (!isValidEventColor(input.color)) throw new Error('없는 색이에요.');
    const { start, end } = normalizeRange(input.startDate, input.endDate);

    const { data, error } = await getSupabaseAdmin()
      .from('org_events')
      .insert({
        org_id: input.orgId,
        title,
        color: input.color,
        start_date: start,
        end_date: end,
        created_by: user.id,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as OrgEvent;
  });
}

/** 일정 id로 조직을 되짚어 멤버 여부를 확인한다 */
async function loadEventForMember(eventId: string, userId: string): Promise<OrgEvent> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_events')
    .select(COLUMNS)
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('일정을 찾을 수 없어요.');
  const event = data as OrgEvent;
  await assertMember(event.org_id, userId);
  return event;
}

export async function updateOrgEvent(
  eventId: string,
  patch: { title?: string; color?: string; startDate?: string; endDate?: string }
): Promise<ApiResponse<OrgEvent>> {
  return wrap(async () => {
    const user = await requireAuth();
    const event = await loadEventForMember(eventId, user.id);

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = titleSchema.parse(patch.title);
    if (patch.color !== undefined) {
      if (!isValidEventColor(patch.color)) throw new Error('없는 색이에요.');
      update.color = patch.color;
    }
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      const { start, end } = normalizeRange(
        patch.startDate ?? event.start_date,
        patch.endDate ?? event.end_date
      );
      update.start_date = start;
      update.end_date = end;
    }
    if (Object.keys(update).length === 0) return event;

    const { data, error } = await getSupabaseAdmin()
      .from('org_events')
      .update(update)
      .eq('id', event.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as OrgEvent;
  });
}

/** 할 일과 같이 소프트 삭제한다 — 잘못 지워도 되돌릴 수 있어야 한다 */
export async function deleteOrgEvent(eventId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const event = await loadEventForMember(eventId, user.id);

    if (event.created_by !== user.id) {
      const { data: me } = await getSupabaseAdmin()
        .from('org_members')
        .select('role')
        .eq('org_id', event.org_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!me || (me.role !== 'owner' && me.role !== 'admin'))
        throw new Error('일정을 만든 사람이나 방장만 지울 수 있어요.');
    }

    const { error } = await getSupabaseAdmin()
      .from('org_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', event.id);
    if (error) throw new Error(error.message);
    return null;
  });
}
