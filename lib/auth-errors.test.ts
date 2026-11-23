import { describe, expect, it } from 'vitest';
import { authErrorKey } from './auth-errors';

// QA에서 실제로 받은 Supabase Auth 원문들
describe('authErrorKey', () => {
  it('없는 도메인·형식 오류', () => {
    expect(authErrorKey('Email address "qa@example.com" is invalid')).toBe('authInvalidEmail');
  });
  it('가입·메일 횟수 제한', () => {
    expect(authErrorKey('email rate limit exceeded')).toBe('authRateLimited');
    expect(authErrorKey('Request rate limit reached')).toBe('authRateLimited');
  });
  it('로그인 실패 · 중복 가입', () => {
    expect(authErrorKey('Invalid login credentials')).toBe('invalidCredentials');
    expect(authErrorKey('User already registered')).toBe('alreadyRegistered');
  });
  it('모르는 오류는 원문 그대로', () => {
    expect(authErrorKey('Something else')).toBeNull();
  });
});
