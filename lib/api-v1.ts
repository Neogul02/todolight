import 'server-only';
import { getAuthUser } from '@/app/actions/_base';
import { getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';

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
 * **예외는 미인증 하나다.** 401은 업무 오류가 아니라 "토큰을 다시 받아 오라"는 신호이고,
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

    if (!(await getAuthUser())) {
      return Response.json({ success: false, error: t('unauthorized') }, { status: 401 });
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
