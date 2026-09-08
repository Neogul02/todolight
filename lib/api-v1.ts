import 'server-only';
import { getAuthUser } from '@/app/actions/_base';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';

/**
 * 한 사람이 한 창(窓) 안에 보낼 수 있는 요청 수.
 *
 * 서버 액션은 원래도 공개 POST였지만, 문서화된 API가 되면 표적이 된다. 다만 이건 악의보다
 * **폭주하는 클라이언트**를 막는 값이다 — 앱 쪽 재시도 루프가 잘못 돌면 그 한 대가 DB를
 * 하루 종일 두들긴다. 사람이 손으로는 절대 못 넘는 값으로 넉넉히 잡되, 루프는 바로 걸린다.
 * (보드 한 화면을 열 때 앱이 보내는 건 몇 건이고, 위젯 갱신도 분당 한 자릿수다.)
 */
const RATE_LIMIT = 120;
const RATE_WINDOW_SECONDS = 60;

/**
 * 네이티브 앱이 서버 액션을 부를 수 있게 하는 얇은 어댑터.
 *
 * **로직을 여기서 다시 쓰지 않는다.** 가드(`requireAuth`·`requireMembership`), zod 검증,
 * Discord 알림, `position` 계산 — 전부 이미 액션 안에 있고 웹이 매일 그걸 쓰고 있다.
 * 여기서 하는 일은 JSON을 풀어 액션에 넘기고 결과를 그대로 돌려주는 것뿐이다.
 * 어댑터가 두꺼워지기 시작하면 웹과 앱의 규칙이 갈라지기 시작한 것이다 — 그때는 여기가
 * 아니라 액션을 고쳐야 한다.
 *
 * **응답은 `ApiResponse<T>` 그대로다.** 업무 오류(`success: false`)에도 HTTP 200이다 —
 * 웹이 이미 그렇게 동작하고, 상태 코드로 갈래를 하나 더 만들면 두 클라이언트가 다른 규칙을
 * 갖게 된다. Swift 쪽에서 상태 코드만 보고 넘어가면 에러를 통째로 놓치므로, 디코더가
 * 반드시 판별 유니온으로 읽어야 한다.
 *
 * **예외는 미인증(401)과 과다 요청(429) 둘이다.** 401은 업무 오류가 아니라 "토큰을 다시 받아 오라"는 신호이고,
 * 앱은 그걸 상태 코드로 알아채야 재시도 흐름을 짤 수 있다. 그렇다고 액션이 던지는 문구를
 * 문자열로 맞춰 보는 건 로케일마다 깨지므로, 액션에 넘기기 **전에** 여기서 직접 확인한다.
 * (액션 안의 `requireAuth()`는 그대로 남는다 — `getAuthUser`가 요청 범위로 캐시되니
 * 두 번째 확인은 공짜이고, 어댑터를 안 거치는 웹 경로에서는 그게 유일한 방어선이다.)
 */
export function apiRoute<TBody>(
  handler: (body: TBody) => Promise<ApiResponse<unknown>>
): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    const t = await getActionT();

    /*
      인증이 먼저다. 그리고 **이 경로는 DB를 건드리지 않는다** — 토큰 검증은 JWKS로
      로컬에서 끝나고(`lib/supabase-bearer.ts`), 문구 번역도 메모리에서 끝난다.
      토큰 없이 두들기는 요청이 DB까지 내려가지 않는다는 뜻이라, 아래 rate limit을
      인증 뒤에 두어도 그게 구멍이 되지 않는다.
    */
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ success: false, error: t('unauthorized') }, { status: 401 });
    }

    /*
      사람 단위 고정 창 제한. 키를 IP가 아니라 **user id**로 잡는다 — 같은 사무실에서
      여럿이 쓰면 IP가 겹치고, 모바일은 IP가 수시로 바뀐다. 폭주하는 건 사람이 아니라
      그 사람의 앱 한 대이므로 계정 단위가 맞다.

      **이 조회가 실패하면 통과시킨다**(fail-open). 실패하는 건 DB가 아플 때인데, 그 순간에
      API 전체를 닫으면 장애가 몇 배로 커진다. 제한은 폭주를 늦추려는 장치이지 인증 수단이
      아니다 — 인증은 위에서 이미 끝났으므로 여기서 열어 줘도 남의 데이터로는 못 간다.
    */
    const { data: allowed, error: rateError } = await getSupabaseAdmin().rpc('api_rate_check', {
      p_key: user.id,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (!rateError && allowed === false) {
      return Response.json(
        { success: false, error: t('tooManyRequests') },
        { status: 429, headers: { 'Retry-After': String(RATE_WINDOW_SECONDS) } }
      );
    }

    /*
      본문이 없거나 JSON이 아니면 400. 액션에 넘기면 zod가 "필수 항목이 없어요" 쪽으로
      답하는데, 그건 값이 틀렸다는 말이지 요청이 망가졌다는 말이 아니다 — 앱을 만들면서
      본문을 빠뜨린 건 고쳐야 할 버그이므로 다른 코드로 구분해 준다.
    */
    let body: TBody;
    try {
      body = (await request.json()) as TBody;
    } catch {
      return Response.json({ success: false, error: t('invalidRequestBody') }, { status: 400 });
    }

    return Response.json(await handler(body));
  };
}
