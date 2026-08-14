'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';

/**
 * 메일 링크 → /auth/callback에서 세션 교환 → 여기.
 * 이 화면에 도달했다는 건 이미 복구 세션이 쿠키에 있다는 뜻이라, updateUser만 호출하면 된다.
 */
export default function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      showMsg('두 비밀번호가 서로 다릅니다.', 'error');
      return;
    }
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showMsg('비밀번호를 바꿨습니다.', 'success');
      router.replace('/board');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showMsg(
        message.includes('Auth session missing')
          ? '링크가 만료됐습니다. 재설정 메일을 다시 받아 주세요.'
          : message,
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      <h1 className="text-title text-ink">새 비밀번호</h1>
      <p className="mt-1 text-caption text-ink-muted">앞으로 쓸 비밀번호를 정하세요.</p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">새 비밀번호</span>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete="new-password"
            enterKeyHint="next"
            minLength={6}
            autoFocus
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">한 번 더</span>
          <Input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="같은 비밀번호"
            autoComplete="new-password"
            enterKeyHint="go"
            minLength={6}
            required
          />
        </label>

        <Button type="submit" size="lg" className="mt-2" disabled={busy || !password || !confirm}>
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          바꾸기
        </Button>
      </form>

      <Link
        href="/reset"
        className="mt-4 block text-center text-caption text-ink-muted transition-colors sm:hover:text-ink"
      >
        링크가 만료됐나요? 다시 받기
      </Link>
    </Card>
  );
}
