'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { notifyLoggedIn, notifySignedUp } from '@/app/actions/auth-notify';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { focusNextOnEnter } from '@/lib/forms';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('auth.login');
  // 회원가입: 이름 → 이메일 → 비밀번호 → 제출. iOS 키보드의 "다음"이 실제로 다음 칸을 연다.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const tToast = useTranslations('toast');
  const nextPath = params.get('next') || '/board';

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
        // 알림 실패가 가입 흐름을 막으면 안 되므로 fire-and-forget으로만 부른다.
        notifySignedUp(email.trim()).catch(() => {});
        // 이메일 확인이 켜져 있으면 session이 비어서 온다 — 이 경우 바로 들어갈 수 없다.
        if (!data.session) {
          showMsg(tToast('confirmEmailSent'), 'info');
          setMode('signin');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // 알림 실패가 로그인 흐름을 막으면 안 되므로 fire-and-forget으로만 부른다.
        notifyLoggedIn().catch(() => {});
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showMsg(
        message.includes('Invalid login credentials') ? tToast('invalidCredentials') : message,
        'error'
      );
    } finally {
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
