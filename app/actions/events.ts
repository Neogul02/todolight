'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isValidEventColor } from '@/lib/event-colors';
import { requireAuth, wrap } from './_base';
import { assertMember } from '@/lib/guards';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { OrgEvent } from '@/types/db';

const titleSchema = (t: ActionT) => z.string().trim().min(1, t('eventTitleRequired')).max(200);
const dateSchema = (t: ActionT) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDateFormat'));

const COLUMNS =
  'id, org_id, title, color, start_date, end_date, created_by, created_at, updated_at, deleted_at';

/** 시작·끝을 정리한다. 거꾸로 넣었으면 뒤집어 준다 — 막느니 고쳐 주는 쪽이 낫다 */
function normalizeRange(t: ActionT, start: string, end: string): { start: string; end: string } {
  const s = dateSchema(t).parse(start);
  const e = dateSchema(t).parse(end);
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

/** 조직 일정 전부. 달력이 월을 넘나들며 보므로 기간 필터 없이 한 번에 읽는다 */
export async function fetchOrgEvents(orgId: string): Promise<ApiResponse<OrgEvent[]>> {
  return wrap(async () => {
    const user = await requireAuth();

    // 멤버 검사와 조회를 같이 보내되 함께 await한다 — fetchOrgTodos와 같은 패턴.
    // 멤버가 아니면 Promise.all이 그대로 거절되고 읽어 온 건 한 줄도 돌려주지 않는다.
    const [, eventsRes] = await Promise.all([
      assertMember(orgId, user.id),
      getSupabaseAdmin()
        .from('org_events')
        .select(COLUMNS)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('start_date', { ascending: true }),
    ]);
    const { data, error } = eventsRes;
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
    const t = await getActionT();

    const title = titleSchema(t).parse(input.title);
    if (!isValidEventColor(input.color)) throw new Error(t('invalidEventColor'));
    const { start, end } = normalizeRange(t, input.startDate, input.endDate);

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
  const t = await getActionT();
  const { data, error } = await getSupabaseAdmin()
    .from('org_events')
    .select(COLUMNS)
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(t('eventNotFound'));
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
    const t = await getActionT();

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = titleSchema(t).parse(patch.title);
    if (patch.color !== undefined) {
      if (!isValidEventColor(patch.color)) throw new Error(t('invalidEventColor'));
      update.color = patch.color;
    }
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      const { start, end } = normalizeRange(
        t,
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

/** 지우거나 되살릴 수 있는 사람: 일정을 만든 사람 · 방장/관리자 */
async function assertCanRemoveEvent(event: OrgEvent, userId: string): Promise<void> {
  if (event.created_by === userId) return;

  const { data: me } = await getSupabaseAdmin()
    .from('org_members')
    .select('role')
    .eq('org_id', event.org_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
    const t = await getActionT();
    throw new Error(t('cannotDeleteEvent'));
  }
}

/** 할 일과 같이 소프트 삭제한다 — 잘못 지워도 되돌릴 수 있어야 한다 */
export async function deleteOrgEvent(eventId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const event = await loadEventForMember(eventId, user.id);
    await assertCanRemoveEvent(event, user.id);

    const { error } = await getSupabaseAdmin()
      .from('org_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', event.id);
    if (error) throw new Error(error.message);
    return null;
  });
}

/**
 * 삭제 취소. 지운 직후 토스트의 "실행취소"가 부른다.
 * 이미 지워진 행을 다뤄야 해서 loadEventForMember(살아 있는 행만 조회)를 쓸 수 없다.
 */
export async function restoreOrgEvent(eventId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const { data, error } = await getSupabaseAdmin()
      .from('org_events')
      .select(COLUMNS)
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(t('eventNotFound'));

    const event = data as OrgEvent;
    await assertMember(event.org_id, user.id);
    await assertCanRemoveEvent(event, user.id);

    const { error: restoreError } = await getSupabaseAdmin()
      .from('org_events')
      .update({ deleted_at: null })
      .eq('id', event.id);
    if (restoreError) throw new Error(restoreError.message);
    return null;
  });
}
