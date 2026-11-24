import 'server-only';
import { X509Certificate, verify as verifySignature } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** 무료 조직이 가질 수 있는 사람 수(멤버 + 대기 중 초대). 방장이 Pro면 제한이 없다 */
export const FREE_ORG_SEATS = 5;

export const APP_BUNDLE_ID = 'com.neogul02.todolight';

/** App Store Connect의 구독 그룹 「todolight Pro」 — iOS `Pro.productIDs`와 같아야 한다 */
export const PRO_PRODUCT_IDS = [
  'com.neogul02.todolight.pro.monthly',
  'com.neogul02.todolight.pro.halfyear',
  'com.neogul02.todolight.pro.yearly',
] as const;

export async function isPro(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('pro_subscriptions')
    .select('expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data && new Date(data.expires_at).getTime() > Date.now();
}

/** 조직이 지금 쓰고 있는 자리 수 — 멤버와 대기 중 초대를 함께 센다(초대를 쌓아 두고 나중에 받게 하는 우회를 막는다) */
export async function orgSeatsUsed(orgId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const [members, invites] = await Promise.all([
    admin.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    admin
      .from('org_invites')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending'),
  ]);
  return (members.count ?? 0) + (invites.count ?? 0);
}

/*
  ── App Store 서명 검증 ──────────────────────────────────────────────

  StoreKit 2의 거래와 App Store 서버 알림은 전부 JWS(ES256)로 온다. 헤더의 x5c에
  [잎, 중간, 루트] 인증서가 실려 오므로, 사슬을 따라 서명을 확인하고 **루트를 Apple Root CA - G3
  지문으로 고정한다.** 실려 온 루트를 그대로 믿으면 아무나 자기 인증서로 서명해 Pro가 된다.
  (지문은 macOS 시스템 루트 키체인의 「Apple Root CA - G3」와 대조했다.)
  지문이 틀리면 전부 거절된다(fail-closed).
*/
const APPLE_ROOT_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
// Apple이 App Store 서명 인증서에만 넣는 확장 OID(잎 1.2.840.113635.100.6.11.1 · 중간 …6.2.1)의 DER
const LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

function b64urlJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

/**
 * Apple이 서명한 JWS를 검증하고 payload를 돌려준다. 어긋나면 throw.
 *
 * Xcode의 로컬 StoreKit 테스트(.storekit)는 Apple이 아니라 Xcode가 서명하므로 사슬이 없다 —
 * **개발 서버에서만** 그 거래를 받아 준다. 운영에서 같은 payload가 오면 그대로 거절된다.
 */
export function verifyAppleJws<T extends { environment?: string }>(jws: string): T {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('JWS 형식이 아니에요');
  const header = b64urlJson<{ alg?: string; x5c?: string[] }>(parts[0]);
  const payload = b64urlJson<T>(parts[1]);

  if (payload.environment === 'Xcode' && process.env.NODE_ENV === 'development') return payload;

  if (header.alg !== 'ES256' || header.x5c?.length !== 3) throw new Error('JWS 헤더가 달라요');
  const [leaf, intermediate, root] = header.x5c.map(
    der => new X509Certificate(Buffer.from(der, 'base64'))
  );

  const now = Date.now();
  const valid = (c: X509Certificate) =>
    new Date(c.validFrom).getTime() <= now && now <= new Date(c.validTo).getTime();

  const chainOk =
    root.fingerprint256 === APPLE_ROOT_G3_SHA256 &&
    root.verify(root.publicKey) &&
    intermediate.checkIssued(root) &&
    intermediate.verify(root.publicKey) &&
    leaf.checkIssued(intermediate) &&
    leaf.verify(intermediate.publicKey) &&
    leaf.raw.includes(LEAF_OID) &&
    intermediate.raw.includes(INTERMEDIATE_OID) &&
    [leaf, intermediate, root].every(valid);
  if (!chainOk) throw new Error('Apple 인증서 사슬이 아니에요');

  const signed = verifySignature(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(parts[2], 'base64url')
  );
  if (!signed) throw new Error('서명이 맞지 않아요');
  return payload;
}

/** StoreKit 2 거래(JWSTransactionDecodedPayload) 중 쓰는 칸 */
export interface AppleTransaction {
  bundleId: string;
  productId: string;
  originalTransactionId: string;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment: string;
}

/**
 * 검증된 거래를 Pro 기록에 반영한다. 누구의 것인지는 **구매할 때 앱이 심은
 * `appAccountToken`(= 사용자 id)** 이 정한다 — 같은 Apple ID로 다른 todolight 계정에
 * 로그인해도 구독은 산 계정에만 붙는다.
 *
 * `expectedUserId`를 주면(앱이 보낸 거래) 토큰이 그 사람과 다를 때 거절한다.
 */
export async function applyAppleTransaction(
  tx: AppleTransaction,
  expectedUserId?: string
): Promise<{ userId: string; expiresAt: string } | null> {
  if (tx.bundleId !== APP_BUNDLE_ID) throw new Error('다른 앱의 거래예요');
  if (!(PRO_PRODUCT_IDS as readonly string[]).includes(tx.productId)) {
    throw new Error('모르는 상품이에요');
  }
  const owner = tx.appAccountToken?.toLowerCase();
  if (expectedUserId && owner !== expectedUserId) throw new Error('이 계정의 구매가 아니에요');

  const admin = getSupabaseAdmin();
  let userId = owner;
  if (!userId) {
    // 알림에 토큰이 없으면(예전 거래) 이미 붙어 있는 사람을 따른다
    const { data } = await admin
      .from('pro_subscriptions')
      .select('user_id')
      .eq('original_transaction_id', tx.originalTransactionId)
      .maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) return null;

  // 환불·취소면 그 시점에 끝난 것이다
  const end = tx.revocationDate ?? tx.expiresDate;
  if (!end) throw new Error('만료일이 없는 거래예요');
  const expiresAt = new Date(end).toISOString();

  // 같은 구독이 다른 계정에 붙어 있었다면 떼어 낸다(original_transaction_id는 유일하다)
  await admin
    .from('pro_subscriptions')
    .delete()
    .eq('original_transaction_id', tx.originalTransactionId)
    .neq('user_id', userId);

  const { error } = await admin.from('pro_subscriptions').upsert(
    {
      user_id: userId,
      source: 'apple',
      product_id: tx.productId,
      original_transaction_id: tx.originalTransactionId,
      environment: tx.environment,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
  return { userId, expiresAt };
}
