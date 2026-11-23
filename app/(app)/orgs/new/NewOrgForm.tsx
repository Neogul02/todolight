'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    const res = await createOrg(value);
    if (!res.success) {
      setBusy(false);
      showMsg(res.error, 'error');
      return;
    }

    /*
      조직 목록 캐시에 새 조직이 들어온 **뒤에** 넘어간다. 안 기다리면 팀 화면이 옛 목록(0개)으로
      그려져 방금 만든 조직 대신 "조직이 없어요"가 뜨고, staleTime(30초) 동안 그대로 남았다.
      초대 수락(AppShell의 respond)과 같은 이유 · 같은 순서다.
    */
    await queryClient.invalidateQueries({ queryKey: ['my-orgs'] });
    selectOrg(res.data.id);
    showMsg(tToast('orgCreated'), 'success');
    router.push('/team');
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-heading-2 text-ink">{t('title')}</h1>

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
