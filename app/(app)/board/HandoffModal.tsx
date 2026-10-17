'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, Textarea } from '@/components/ui';
import type { Todo } from '@/types/db';

/**
 * "대신 처리" — 완료 표시와 메모를 한 번에 남긴다.
 * 메모를 강제하는 이유: 남의 할 일이 말없이 사라지면 주인이 상황을 파악할 수 없다.
 *
 * 쓰기는 `useTodoMutations`를 거친다 — 체크처럼 낙관적으로 끝내고 시트는 바로 닫는다.
 * 실패하면 거기서 되돌리고 토스트로 알린다.
 */
export default function HandoffModal({
  todo,
  ownerName,
  currentUserId,
  onClose,
}: {
  todo: Todo;
  ownerName: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const t = useTranslations('handoff');
  const { handOff } = useTodoMutations(todo.org_id);
  const [note, setNote] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = note.trim();
    if (!content) return;
    handOff.mutate({ todo, note: content, actorId: currentUserId });
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
          autoFocus
        />
        {/* 모바일에서는 세로로 쌓아 각 버튼을 넓게 — 한 손 조작 기준 */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={!note.trim()} className="sm:w-auto">
            {t('submit')}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
