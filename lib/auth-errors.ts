/**
 * Supabase Auth가 돌려주는 영어 원문을 화면 문구 키로 옮긴다. 모르는 것은 null — 원문을 그대로 보인다.
 * 로그인·가입·비밀번호 재설정이 같은 오류를 같은 말로 하도록 한곳에 둔다.
 */
export type AuthErrorKey = 'invalidCredentials' | 'alreadyRegistered' | 'authInvalidEmail' | 'authRateLimited';

export function authErrorKey(message: string): AuthErrorKey | null {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'invalidCredentials';
  if (m.includes('already registered')) return 'alreadyRegistered';
  // 형식이 틀렸거나, 메일 서버(MX)가 없는 도메인이면 Supabase가 같은 말로 거절한다
  if (m.includes('email address') && m.includes('invalid')) return 'authInvalidEmail';
  if (m.includes('rate limit')) return 'authRateLimited';
  return null;
}
