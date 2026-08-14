'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { handleForMember } from '@/app/actions/todos';
import { showMsg } from '@/lib/toast';
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
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    showMsg('대신 처리했습니다.', 'success');
    onDone();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 sm:items-center"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-[420px] rounded-2xl border border-hairline bg-surface p-5 shadow-level-2"
      >
        <p className="text-eyebrow text-ink-faint">대신 처리</p>
        <h2 className="mt-1.5 text-title text-ink">{todo.title}</h2>
        <p className="mt-1 text-caption text-ink-muted">
          {ownerName}님의 할 일입니다. 어떻게 처리했는지 한 줄 남겨 주세요.
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder="예) 거래처에 메일 보내뒀습니다. 회신 오면 공유할게요."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !note.trim()}>
              완료 처리
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
