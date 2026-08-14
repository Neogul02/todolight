'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { addTodoNote, deleteTodo, setTodoStatus } from '@/app/actions/todos';
import { showMsg } from '@/lib/toast';
import { cn, dueState, formatRelativeDay } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Input } from '@/components/ui';
import type { MemberSummary, Todo } from '@/types/db';

const DUE_TONE = {
  overdue: 'danger',
  today: 'warning',
  upcoming: 'neutral',
  none: 'neutral',
} as const;

export default function TodoCard({
  todo,
  isMine,
  members,
  currentUserId,
  onMutated,
  onHandoff,
}: {
  todo: Todo;
  isMine: boolean;
  members: MemberSummary[];
  currentUserId: string;
  onMutated: () => void;
  onHandoff: (todo: Todo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const done = todo.status === 'done';
  const handler = todo.handled_by ? members.find(m => m.user_id === todo.handled_by) : null;
  const handledByOther = done && todo.handled_by && todo.handled_by !== todo.owner_id;
  const due = dueState(todo.due_date);

  async function toggleDone() {
    if (busy) return;
    // 남의 할 일을 완료로 바꾸는 건 "대신 처리" — 메모를 반드시 받는다.
    if (!done && !isMine) {
      onHandoff(todo);
      return;
    }
    setBusy(true);
    const res = await setTodoStatus(todo.id, done ? 'todo' : 'done');
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    onMutated();
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const content = note.trim();
    if (!content || busy) return;
    setBusy(true);
    const res = await addTodoNote(todo.id, content);
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    setNote('');
    onMutated();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = await deleteTodo(todo.id);
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    showMsg('삭제했습니다.', 'success');
    onMutated();
  }

  const noteCount = todo.notes?.length ?? 0;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.16 }}
      className={cn(
        'rounded-xl border border-hairline bg-surface px-3 py-2.5 transition-colors',
        done && 'bg-surface-alt'
      )}
    >
      <div className="flex items-start gap-1">
        {/*
          체크 자체는 20px이지만 패딩으로 실제 탭 영역을 44px 가까이 넓힌다.
          손가락으로 옆 카드가 아니라 이 체크가 눌려야 한다.
        */}
        <button
          type="button"
          onClick={toggleDone}
          disabled={busy}
          aria-label={done ? '완료 취소' : '완료로 표시'}
          className="-my-1 shrink-0 p-2.5 transition-transform active:scale-90"
        >
          <span
            className={cn(
              'grid size-5 place-items-center rounded-md border transition-colors',
              done
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-hairline-strong bg-surface sm:hover:border-ink-muted'
            )}
          >
            {done && (
              <svg
                viewBox="0 0 12 12"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="-mx-1 min-w-0 flex-1 px-1 py-1 text-left"
        >
          <p
            className={cn(
              'text-body-sm break-words',
              done ? 'text-ink-faint line-through' : 'text-ink'
            )}
          >
            {todo.title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {todo.due_date && (
              <Badge tone={DUE_TONE[due]}>{formatRelativeDay(`${todo.due_date}T00:00:00Z`)}</Badge>
            )}
            {handledByOther && (
              <Badge tone="success">{handler?.display_name ?? '누군가'}가 대신 처리</Badge>
            )}
            {noteCount > 0 && <Badge>메모 {noteCount}</Badge>}
          </div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-hairline pt-3">
              {noteCount > 0 && (
                <ul className="mb-3 flex flex-col gap-2">
                  {todo.notes!.map(n => (
                    <li key={n.id} className="rounded-lg bg-canvas-soft px-2.5 py-2">
                      <p className="text-caption text-ink-secondary break-words">{n.content}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                        <Avatar
                          name={n.author_name ?? '?'}
                          color={n.author_color}
                          seed={n.author_id}
                          size="sm"
                          className="size-4 text-[9px]"
                        />
                        {n.author_name ?? '알 수 없음'} · {formatRelativeDay(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitNote} className="flex gap-1.5">
                <Input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="메모 남기기"
                  maxLength={1000}
                  enterKeyHint="send"
                  className="h-11 sm:h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-11 sm:h-9"
                  disabled={busy || !note.trim()}
                >
                  등록
                </Button>
              </form>

              <div className="mt-2.5 flex items-center gap-1.5">
                {!isMine && !done && (
                  <Button size="sm" variant="outline" onClick={() => onHandoff(todo)}>
                    대신 처리
                  </Button>
                )}
                {(isMine || todo.created_by === currentUserId) && (
                  <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
                    삭제
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
