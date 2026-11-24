'use server';

import { requireAuth, wrap } from './_base';
import { requireMembership } from '@/lib/guards';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  FREE_ORG_SEATS,
  applyAppleTransaction,
  isPro,
  orgSeatsUsed,
  verifyAppleJws,
  type AppleTransaction,
} from '@/lib/pro';
import { getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';

export interface MyPro {
  active: boolean;
  /** 결제한 곳 — 해지는 거기서만 된다 */
  source: 'apple' | 'web' | 'grant' | null;
  productId: string | null;
  expiresAt: string | null;
}

/** 내 Pro 상태 */
export async function fetchMyPro(): Promise<ApiResponse<MyPro>> {
  return wrap(async () => {
    const user = await requireAuth();
    const { data, error } = await getSupabaseAdmin()
      .from('pro_subscriptions')
      .select('source, product_id, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      active: !!data && new Date(data.expires_at).getTime() > Date.now(),
      source: (data?.source as MyPro['source']) ?? null,
      productId: data?.product_id ?? null,
      expiresAt: data?.expires_at ?? null,
    };
  });
}

export interface OrgPlan {
  /** null이면 제한 없음(방장이 Pro) */
  seatLimit: number | null;
  /** 멤버 + 대기 중 초대 */
  seatsUsed: number;
}

/** 조직의 인원 제한 — 팀 화면이 초대 칸 대신 Pro 안내를 띄울지 정한다 */
export async function fetchOrgPlan(orgId: string): Promise<ApiResponse<OrgPlan>> {
  return wrap(async () => {
    const user = await requireAuth();
    await requireMembership(orgId, user.id);
    const { data: org, error } = await getSupabaseAdmin()
      .from('organizations')
      .select('owner_id')
      .eq('id', orgId)
      .single();
    if (error) throw new Error(error.message);
    const [ownerPro, seatsUsed] = await Promise.all([isPro(org.owner_id), orgSeatsUsed(orgId)]);
    return { seatLimit: ownerPro ? null : FREE_ORG_SEATS, seatsUsed };
  });
}

/**
 * 앱이 StoreKit 2 거래(JWS)를 보낸다 — 구매 직후, 앱을 열 때(갱신분), 「구매 복원」.
 * 서명을 검증하고 이 계정이 산 것일 때만 반영한다.
 */
export async function syncAppleTransaction(signedTransaction: string): Promise<ApiResponse<MyPro>> {
  return wrap(async () => {
    const user = await requireAuth();
    try {
      const tx = verifyAppleJws<AppleTransaction>(signedTransaction);
      await applyAppleTransaction(tx, user.id);
    } catch (e) {
      // 검증 실패의 자세한 이유는 로그에만 남긴다 — 사용자에게는 한 문장이면 된다
      console.error('[appleSync]', e);
      const t = await getActionT();
      throw new Error(t('purchaseNotVerified'));
    }
    const res = await fetchMyPro();
    if (!res.success) throw new Error(res.error);
    return res.data;
  });
}
