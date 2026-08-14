'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrg } from '@/app/actions/orgs';
import { Button, Card, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { useApp } from '../../OrgContext';

export default function NewOrgForm() {
  const router = useRouter();
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
    showMsg('조직을 만들었어요. 이제 팀원을 초대해 보세요.', 'success');
    router.push('/team');
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h1 className="text-heading-2 text-ink">새 조직 만들기</h1>
      <p className="mt-1 text-caption text-ink-muted">
        만든 사람이 방장이 돼요. 팀원은 이메일로 초대할 수 있어요.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">조직 이름</span>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예) 마케팅팀"
            maxLength={60}
            autoFocus
            required
          />
        </label>
        <Button type="submit" size="lg" disabled={busy || !name.trim()}>
          만들기
        </Button>
      </form>
    </Card>
  );
}
