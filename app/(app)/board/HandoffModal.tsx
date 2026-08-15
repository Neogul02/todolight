'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { handleForMember } from '@/app/actions/todos';
import { showMsg } from '@/lib/toast';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, Textarea } from '@/components/ui';
import type { Todo } from '@/types/db';

/**
 * "대신 처리" — 완료 표시와 메모를 한 번에 남긴다.
 * 메모를 강제하는 이유: 남의 할 일이 말없이 사라지면 주인이 상황을 파악할 수 없다.
 */
export default function HandoffModal({
  todo,
  ownerName,
  onClose,
  onDone,
}: {
  todo: Todo;
  ownerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('handoff');
  const tToast = useTranslations('toast');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = note.trim();
    if (!content || busy) return;
    setBusy(true);
    const res = await handleForMember(todo.id, content);
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    showMsg(tToast('handledForMember'), 'success');
    onDone();
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={t('title')}>
      <p className="text-body-sm text-ink">{todo.title}</p>
      <p className="mt-1 text-caption text-ink-muted">{t('description', { owner: ownerName })}</p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t('placeholder')}
        />
        {/* 모바일에서는 세로로 쌓아 각 버튼을 넓게 — 한 손 조작 기준 */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy || !note.trim()} className="sm:w-auto">
            {t('submit')}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
