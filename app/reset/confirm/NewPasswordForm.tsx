'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { showMsg } from '@/lib/toast';
import { Button, Card, Input, Spinner } from '@/components/ui';

/**
 * 메일 링크 → /auth/callback에서 세션 교환 → 여기.
 * 이 화면에 도달했다는 건 이미 복구 세션이 쿠키에 있다는 뜻이라, updateUser만 호출하면 된다.
 */
export default function NewPasswordForm() {
  const router = useRouter();
  const t = useTranslations('auth.resetConfirm');
  const tToast = useTranslations('toast');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      showMsg(tToast('passwordMismatch'), 'error');
      return;
    }
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showMsg(tToast('passwordChanged'), 'success');
      router.replace('/board');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showMsg(message.includes('Auth session missing') ? t('linkExpiredError') : message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-7">
      <h1 className="text-title text-ink">{t('title')}</h1>
      <p className="mt-1 text-caption text-ink-muted">{t('description')}</p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('newPasswordLabel')}</span>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="6+"
            autoComplete="new-password"
            enterKeyHint="next"
            minLength={6}
            autoFocus
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('confirmLabel')}</span>
          <Input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={t('confirmPlaceholder')}
            autoComplete="new-password"
            enterKeyHint="go"
            minLength={6}
            required
          />
        </label>

        <Button type="submit" size="lg" className="mt-2" disabled={busy || !password || !confirm}>
          {busy ? <Spinner className="border-accent-ink/40 border-t-transparent" /> : null}
          {t('submitButton')}
        </Button>
      </form>

      <Link
        href="/reset"
        className="mt-4 block text-center text-caption text-ink-muted transition-colors sm:hover:text-ink"
      >
        {t('expiredLinkPrompt')}
      </Link>
    </Card>
  );
}
