import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  /api/v1 어댑터의 계약 — iOS 앱의 Swift 디코더가 이 모양에 기대고 있다(docs/api-v1.md).
  상태 코드는 401·429·400 셋만 쓰고, 업무 오류는 200 + { success: false }다.
  하나라도 바뀌면 앱이 에러를 놓치거나 멀쩡한 응답을 에러로 읽는다.
*/

vi.mock('server-only', () => ({}));

const getAuthUser = vi.fn();
vi.mock('@/app/actions/_base', () => ({ getAuthUser: () => getAuthUser() }));

const rpc = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ rpc }) }));

vi.mock('@/lib/server-i18n', () => ({ getActionT: async () => (key: string) => `t:${key}` }));

const { apiRoute } = await import('./api-v1');

function post(body: string | undefined) {
  return new Request('http://localhost/api/v1/todos/setStatus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('apiRoute', () => {
  beforeEach(() => {
    getAuthUser.mockReset();
    rpc.mockReset();
    getAuthUser.mockResolvedValue({ id: 'u1' });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it('토큰이 없으면 401 — 액션도, rate limit 조회(DB)도 부르지 않는다', async () => {
    getAuthUser.mockResolvedValue(null);
    const handler = vi.fn();

    const res = await apiRoute(handler)(post('{}'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 't:unauthorized' });
    expect(handler).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('JSON이 아닌 본문은 400 — 액션에 넘기지 않는다', async () => {
    const handler = vi.fn();

    const res = await apiRoute(handler)(post('not json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 't:invalidRequestBody' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('업무 오류(success: false)는 HTTP 200에 그대로 싣는다', async () => {
    const handler = vi.fn().mockResolvedValue({ success: false, error: '권한이 없어요' });

    const res = await apiRoute(handler)(post('{"todoId":"t1"}'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: false, error: '권한이 없어요' });
  });

  it('성공이면 풀어 낸 본문을 액션에 넘기고 결과를 그대로 돌려준다', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true, data: { id: 't1' } });

    const res = await apiRoute(handler)(post('{"todoId":"t1","status":"done"}'));

    expect(handler).toHaveBeenCalledWith({ todoId: 't1', status: 'done' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: 't1' } });
  });

  it('제한을 넘으면 429 + Retry-After, 키는 계정 id', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const handler = vi.fn();

    const res = await apiRoute(handler)(post('{}'));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(rpc).toHaveBeenCalledWith('api_rate_check', { p_key: 'u1', p_limit: 120, p_window_seconds: 60 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('제한 조회가 실패하면 통과시킨다(fail-open)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const handler = vi.fn().mockResolvedValue({ success: true, data: null });

    const res = await apiRoute(handler)(post('{}'));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});
