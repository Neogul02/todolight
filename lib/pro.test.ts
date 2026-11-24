import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }));

const { verifyAppleJws } = await import('./pro');

const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jws = (header: object, payload: object) => `${part(header)}.${part(payload)}.c2ln`;

afterEach(() => vi.unstubAllEnvs());

describe('verifyAppleJws', () => {
  it('JWS 모양이 아니면 거절한다', () => {
    expect(() => verifyAppleJws('abc')).toThrow();
  });

  it('인증서 사슬이 없으면 거절한다', () => {
    expect(() => verifyAppleJws(jws({ alg: 'ES256' }, { environment: 'Production' }))).toThrow();
    expect(() => verifyAppleJws(jws({ alg: 'none', x5c: ['a', 'b', 'c'] }, {}))).toThrow();
  });

  it('Xcode 로컬 거래는 개발 서버에서만 받는다', () => {
    const local = jws({ alg: 'ES256' }, { environment: 'Xcode', productId: 'x' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => verifyAppleJws(local)).toThrow();
    vi.stubEnv('NODE_ENV', 'development');
    expect(verifyAppleJws<{ environment?: string; productId: string }>(local).productId).toBe('x');
  });
});
