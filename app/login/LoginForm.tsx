'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') || '/board';

  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.get('mode') === 'signup' ? 'signup' : 'signin'
  );
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
          options: { data: { display_name: displayName.trim() || email.split('@')[0] } },
        });
        if (error) throw error;
        // 이메일 확인이 켜져 있으면 session이 비어서 온다 — 이 경우 바로 들어갈 수 없다.
        if (!data.session) {
          showMsg('확인 메일을 보냈어요. 메일함에서 인증을 마쳐 주세요.', 'info');
          setMode('signin');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showMsg(
        message.includes('Invalid login credentials')
          ? '이메일 또는 비밀번호가 맞지 않습니다.'
          : message,
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      <Link href="/" className="text-title tracking-tight text-ink">
        todolight
      </Link>
      <p className="mt-1 text-caption text-ink-muted">
        {mode === 'signup' ? '계정을 만들고 조직을 시작하세요.' : '다시 오셨네요.'}
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        {mode === 'signup' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-ink-secondary">이름</span>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="팀원에게 보일 이름"
              autoComplete="name"
              maxLength={30}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">이메일</span>
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
            autoComplete="email"
            enterKeyHint="next"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">비밀번호</span>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            enterKeyHint="go"
            minLength={6}
            required
          />
        </label>

        <Button type="submit" size="lg" className="mt-2" disabled={busy}>
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          {mode === 'signup' ? '가입하기' : '로그인'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        className="mt-5 w-full text-caption text-ink-muted transition-colors hover:text-ink"
      >
        {mode === 'signup' ? '이미 계정이 있어요 · 로그인' : '계정이 없어요 · 가입하기'}
      </button>
    </Card>
  );
}
