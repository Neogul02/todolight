'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createOrg } from '@/app/actions/orgs';
import { Button, Card, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { useApp } from '../../OrgContext';

export default function NewOrgForm() {
  const router = useRouter();
  const t = useTranslations('newOrg');
  const tToast = useTranslations('toast');
  const { selectOrg } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    const res = await createOrg(value);
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }

    selectOrg(res.data.id);
    showMsg(tToast('orgCreated'), 'success');
    router.push('/team');
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-heading-2 text-ink">{t('title')}</h1>
      <p className="mt-1 text-caption text-ink-muted">{t('description')}</p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('nameLabel')}</span>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            enterKeyHint="done"
            maxLength={60}
            autoFocus
            required
          />
        </label>
        <Button type="submit" size="lg" disabled={busy || !name.trim()}>
          {t('submitButton')}
        </Button>
      </form>
    </Card>
  );
}
