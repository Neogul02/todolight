'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import { assertMember, requireMembership } from '@/lib/guards';
import { monthRange } from '@/lib/utils';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { LedgerEntry } from '@/types/db';

const LEDGER_COLUMNS =
  'id, org_id, payer_id, amount, title, spent_on, created_by, created_at, updated_at, deleted_at';

const titleSchema = (t: ActionT) => z.string().trim().min(1, t('ledgerTitleRequired')).max(100);

/**
 * 금액은 원 단위 정수만 받는다. 0원·음수는 지출이 아니고, 소수점은 원화에 없다.
 * 상한은 DB의 check 제약과 같은 값이다 — 한쪽만 고치면 DB 에러가 그대로 토스트에 뜬다.
 */
const amountSchema = (t: ActionT) =>
  z
    .number({ message: t('ledgerAmountRequired') })
    .int(t('ledgerAmountRequired'))
    .positive(t('ledgerAmountRequired'))
    .max(1_000_000_000_000, t('ledgerAmountTooLarge'));

const dateSchema = (t: ActionT) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDateFormat'));
const monthSchema = (t: ActionT) => z.string().regex(/^\d{4}-\d{2}$/, t('invalidDateFormat'));

/**
 * 한 달치 지출.
 * 합계는 클라이언트에서 낸다 — 어차피 그 달 행을 전부 그리고 있어서 따로 집계 쿼리를 보내면
 * 왕복만 하나 늘고, 실시간으로 한 줄이 들어왔을 때 목록과 합계가 어긋날 여지가 생긴다.
 */
export async function fetchLedgerEntries(
  orgId: string,
  month: string
): Promise<ApiResponse<LedgerEntry[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    await assertMember(orgId, user.id);

    const { start, end } = monthRange(monthSchema(t).parse(month));
    const { data, error } = await getSupabaseAdmin()
      .from('ledger_entries')
      .select(LEDGER_COLUMNS)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('spent_on', start)
      .lte('spent_on', end)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []) as LedgerEntry[];
  });
}

/** 지출 한 줄 추가. payerId를 넘기면 남이 낸 돈을 대신 적어 줄 수 있다 */
export async function createLedgerEntry(input: {
  orgId: string;
  amount: number;
  title: string;
  spentOn: string;
  payerId?: string;
}): Promise<ApiResponse<LedgerEntry>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    await assertMember(input.orgId, user.id);

    const payerId = input.payerId ?? user.id;
    // 남을 낸 사람으로 지목할 수 있으니 그 사람도 같은 조직인지 확인한다
    if (payerId !== user.id) await assertMember(input.orgId, payerId);

    const { data, error } = await getSupabaseAdmin()
      .from('ledger_entries')
      .insert({
        org_id: input.orgId,
        payer_id: payerId,
        amount: amountSchema(t).parse(input.amount),
        title: titleSchema(t).parse(input.title),
        spent_on: dateSchema(t).parse(input.spentOn),
        created_by: user.id,
      })
      .select(LEDGER_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return data as LedgerEntry;
  });
}

/** 지우거나 되살릴 수 있는 사람: 적은 사람·낸 사람 본인이나 방장 */
async function assertCanRemoveEntry(
  entry: { org_id: string; payer_id: string; created_by: string },
  userId: string
): Promise<void> {
  const role = await requireMembership(entry.org_id, userId);
  const mine = entry.created_by === userId || entry.payer_id === userId;
  const manager = role === 'owner' || role === 'admin';
  if (!mine && !manager) {
    const t = await getActionT();
    throw new Error(t('cannotDeleteLedgerEntry'));
  }
}

/** 소프트 삭제. 적은 사람·낸 사람 본인이나 방장만 */
export async function deleteLedgerEntry(id: string): Promise<ApiResponse<{ id: string }>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const { data: entry, error: loadError } = await getSupabaseAdmin()
      .from('ledger_entries')
      .select('id, org_id, payer_id, created_by')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!entry) throw new Error(t('ledgerEntryNotFound'));

    await assertCanRemoveEntry(entry, user.id);

    const { error } = await getSupabaseAdmin()
      .from('ledger_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);

    return { id };
  });
}

/**
 * 삭제 취소. 지운 직후 토스트의 "실행취소"가 부른다.
 * 이미 지워진 행을 다뤄야 해서 위의 조회(살아 있는 행만)를 쓸 수 없다.
 */
export async function restoreLedgerEntry(id: string): Promise<ApiResponse<LedgerEntry>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const { data: entry, error: loadError } = await getSupabaseAdmin()
      .from('ledger_entries')
      .select(LEDGER_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!entry) throw new Error(t('ledgerEntryNotFound'));

    await assertCanRemoveEntry(entry, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('ledger_entries')
      .update({ deleted_at: null })
      .eq('id', id)
      .select(LEDGER_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return data as LedgerEntry;
  });
}
