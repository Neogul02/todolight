'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { focusNextOnEnter } from '@/lib/forms';
import { authErrorKey } from '@/lib/auth-errors';
import { cn, safeNextPath } from '@/lib/utils';

type Mode = 'signin' | 'signup';

export default function LoginForm() {
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('auth.login');
  // 회원가입: 이름 → 이메일 → 비밀번호 → 제출. iOS 키보드의 "다음"이 실제로 다음 칸을 연다.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const tToast = useTranslations('toast');
  const nextPath = safeNextPath(params.get('next'));

  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // 브라우저 언어로 이미 negotiate된 이 페이지의 locale을 그대로 넘긴다 — 안 그러면
          // handle_new_user 트리거가 기본값 'ko'로 만들고, 로그인 직후 AppShell의 쿠키 동기화가
          // 그 'ko'를 다시 진실로 취급해 모처럼 맞은 언어를 되돌려 버린다.
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0], locale },
            /*
              **이메일 확인을 켜면 이 링크로 돌아온다.** 지금은 Supabase에서 확인이 꺼져
              있어(가입 즉시 세션이 나온다) 이 값이 쓰이지 않지만, 없는 채로 확인을 켜면
              메일 링크가 Site URL로 떨어져 PKCE 코드가 교환되지 않는다 — 눌러도 로그인이
              안 되는 링크가 된다. 비밀번호 재설정이 이미 같은 경로를 쓴다
              (`ResetRequestForm`의 `redirectTo`).
            */
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (error) throw error;
        // 이메일 확인이 켜져 있으면 session이 비어서 온다 — 이 경우 바로 들어갈 수 없다.
        if (!data.session) {
          showMsg(tToast('confirmEmailSent'), 'info');
          setMode('signin');
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      /*
        하드 내비게이션으로 간다. `router.replace()`는 라우터 캐시에 남아 있는 목적지 항목을
        다시 그리는데, /board로 들어왔다가 proxy가 /login으로 돌려보낸 흐름에서는 그 자리에
        **로그인 화면 결과**가 들어앉아 있다 — 그래서 주소만 /board로 바뀌고 화면은 로그인
        폼에 머물렀다(새로고침해야 들어가짐). 뒤따르던 router.refresh()는 replace가 커밋되기
        전에 돌아 헛돌았다.

        로그인 직후는 쿠키가 방금 바뀌어 어차피 트리 전체를 서버에서 새로 받아야 하는
        시점이라, 클라이언트 네비게이션으로 아낄 것이 없다. busy도 여기서 풀지 않는다 —
        새 문서가 뜨기 전에 버튼이 되살아나면 한 번 더 눌리게 된다.
      */
      window.location.assign(nextPath);
    } catch (err) {
      // Supabase Auth의 영어 원문을 그대로 띄우지 않는다
      const message = err instanceof Error ? err.message : String(err);
      const key = authErrorKey(message);
      showMsg(key ? tToast(key) : message, 'error');
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      {/*
        링크로 모드를 바꾸던 걸 탭으로 바꿨다 — 로그인·회원가입이 같은 무게로 보여야 한다.
        카드 위에는 글자 대신 로고만 둔다(login/page.tsx): 앱 이름은 들어오는 길에서 이미 봤고,
        이 화면이 할 일은 둘 중 하나를 고르는 것뿐이다.
      */}
      <div className="flex overflow-hidden rounded-xl border border-hairline no-select">
        {(['signin', 'signup'] as Mode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'h-11 flex-1 text-[14px] font-medium transition-colors sm:h-10',
              mode === m ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted'
            )}
          >
            {m === 'signin' ? t('signIn') : t('signUp')}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {mode === 'signup' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-ink-secondary">{t('nameLabel')}</span>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoComplete="name"
              enterKeyHint="next"
              onKeyDown={e => focusNextOnEnter(e, emailRef.current)}
              maxLength={30}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('emailLabel')}</span>
          {/* iOS는 기본으로 첫 글자를 대문자로 바꾸고 자동 교정을 건다 — 이메일에선 둘 다 방해다 */}
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            ref={emailRef}
            autoComplete="email"
            enterKeyHint="next"
            onKeyDown={e => focusNextOnEnter(e, passwordRef.current)}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('passwordLabel')}</span>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('passwordPlaceholder')}
            ref={passwordRef}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            enterKeyHint="go"
            minLength={6}
            required
          />
        </label>

        {/* 칸이 비었거나 비밀번호가 짧으면 누를 수 없다 — iOS와 같은 규칙 */}
        <Button
          type="submit"
          size="lg"
          className="mt-2"
          disabled={busy || !email.trim() || password.length < 6}
        >
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          {mode === 'signup' ? t('signUp') : t('signIn')}
        </Button>
      </form>

      {/*
        가입 전에 약관을 볼 길을 둔다 — 지금까지는 랜딩 푸터에만 있었다.
        체크박스로 한 번 더 누르게 하지 않는다: 가입 버튼을 누르는 것 자체가 동의이고, 그걸 문장으로 알린다.
      */}
      {mode === 'signup' && (
        <p className="mt-4 text-center text-caption text-ink-muted">
          {t.rich('consent', {
            terms: chunks => (
              <Link href="/legal/terms" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
            privacy: chunks => (
              <Link href="/legal/privacy" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      {mode === 'signin' && (
        <Link
          href="/reset"
          className="mt-4 block text-center text-caption text-ink-muted transition-colors pointer-fine:hover:text-ink"
        >
          {t('forgotPassword')}
        </Link>
      )}
    </Card>
  );
}
