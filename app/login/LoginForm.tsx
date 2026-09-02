'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { focusNextOnEnter } from '@/lib/forms';
import { cn, safeNextPath } from '@/lib/utils';

type Mode = 'signin' | 'signup';

/**
 * 로그인·가입 알림 핑.
 *
 * 서버 액션으로 부르면 안 된다 — App Router는 서버 액션과 네비게이션을 같은 큐에서 처리해서,
 * `.catch()`로 던져 놓아도 라우터가 액션이 끝날 때까지 다음 이동을 미룬다. 시크릿 창처럼
 * 콜드 스타트가 겹치면 로그인 직후 화면이 몇 초 동안 안 넘어갔다.
 * sendBeacon은 그 큐 밖이고 페이지가 떠난 뒤에도 전송이 보장된다.
 */
function pingAuthNotify(body: Record<string, string>) {
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  if (navigator.sendBeacon?.('/api/auth-notify', blob)) return;
  // sendBeacon이 없거나 큐가 가득 찬 경우의 대비. keepalive라 이동 중에도 살아남는다.
  fetch('/api/auth-notify', { method: 'POST', body: blob, keepalive: true }).catch(() => {});
}

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
          },
        });
        if (error) throw error;
        pingAuthNotify({ type: 'signup', email: email.trim() });
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
        pingAuthNotify({ type: 'login' });
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
      const message = err instanceof Error ? err.message : String(err);
      showMsg(
        message.includes('Invalid login credentials') ? tToast('invalidCredentials') : message,
        'error'
      );
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      <Link href="/" lang="en" className="text-title tracking-tight text-ink">
        todolight
      </Link>

      {/* 링크로 모드를 바꾸던 걸 탭으로 바꿨다 — 로그인·회원가입이 같은 무게로 보여야 한다 */}
      <div className="mt-5 flex overflow-hidden rounded-xl border border-hairline no-select">
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

        <Button type="submit" size="lg" className="mt-2" disabled={busy}>
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          {mode === 'signup' ? t('signUp') : t('signIn')}
        </Button>
      </form>

      {mode === 'signin' && (
        <Link
          href="/reset"
          className="mt-4 block text-center text-caption text-ink-muted transition-colors sm:hover:text-ink"
        >
          {t('forgotPassword')}
        </Link>
      )}
    </Card>
  );
}
