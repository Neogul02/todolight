import { applyAppleTransaction, verifyAppleJws, type AppleTransaction } from '@/lib/pro';

/**
 * App Store 서버 알림 V2 — 갱신·만료·환불을 Apple이 직접 알려 준다.
 * App Store Connect → 앱 → App 정보 → App Store 서버 알림에 이 주소를 넣는다
 * (운영·샌드박스 둘 다 `https://todolight.vercel.app/api/billing/apple-notifications`).
 *
 * 로그인이 없는 경로라 **서명이 곧 인증이다** — 검증을 통과하지 못하면 아무것도 쓰지 않는다.
 * 앱을 열 때도 같은 거래를 다시 보내므로(`syncAppleTransaction`) 알림 하나를 놓쳐도 맞춰진다.
 * Apple은 2xx가 아니면 다시 보내므로, 처리하다 실패하면 500을 돌려 재시도를 받는다.
 */
export async function POST(request: Request): Promise<Response> {
  let signedTransaction: string | undefined;
  try {
    const { signedPayload } = (await request.json()) as { signedPayload?: string };
    if (!signedPayload) return new Response('bad request', { status: 400 });
    const notification = verifyAppleJws<{
      environment?: string;
      data?: { signedTransactionInfo?: string };
    }>(signedPayload);
    signedTransaction = notification.data?.signedTransactionInfo;
  } catch (e) {
    console.error('[apple-notifications] 검증 실패', e);
    return new Response('invalid signature', { status: 400 });
  }

  // TEST 알림 등 거래가 없는 알림은 받기만 한다
  if (!signedTransaction) return new Response('ok');

  try {
    const tx = verifyAppleJws<AppleTransaction>(signedTransaction);
    await applyAppleTransaction(tx);
    return new Response('ok');
  } catch (e) {
    console.error('[apple-notifications] 반영 실패', e);
    return new Response('error', { status: 500 });
  }
}
