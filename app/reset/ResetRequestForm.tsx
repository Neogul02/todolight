'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';

export default function ResetRequestForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // 메일 링크는 콜백 라우트로 돌아와 세션으로 교환된 뒤 새 비밀번호 화면으로 간다
        redirectTo: `${window.location.origin}/auth/callback?next=/reset/confirm`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-[400px] p-6 sm:p-7">
        <h1 className="text-title text-ink">메일을 보냈어요</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          <span className="font-medium text-ink">{email.trim()}</span> 으로 재설정 링크를
          보냈어요. 메일함에서 링크를 눌러 새 비밀번호를 정해 주세요.
        </p>
        <p className="mt-3 text-caption text-ink-faint">
          메일이 안 보이면 스팸함도 확인해 주세요. 링크는 1시간 뒤 만료돼요.
        </p>
        <Link href="/login" className="mt-5 block">
          <Button size="lg" variant="outline" className="w-full">
            로그인으로 돌아가기
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      <h1 className="text-title text-ink">비밀번호 재설정</h1>
      <p className="mt-1 text-caption text-ink-muted">
        가입한 이메일로 재설정 링크를 보내 드려요.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">이메일</span>
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
            enterKeyHint="send"
            autoFocus
            required
          />
        </label>

        <Button type="submit" size="lg" disabled={busy || !email.trim()}>
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          링크 보내기
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-4 block text-center text-caption text-ink-muted transition-colors sm:hover:text-ink"
      >
        로그인으로 돌아가기
      </Link>
    </Card>
  );
}
