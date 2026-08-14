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
  isManager,
  onMutated,
  onHandoff,
}: {
  todo: Todo;
  isMine: boolean;
  members: MemberSummary[];
  currentUserId: string;
  isManager: boolean;
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
  const canRemove = isMine || todo.created_by === currentUserId || isManager;

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
        'rounded-xl border border-hairline bg-surface px-3 py-1.5 transition-colors',
        done && 'bg-surface-alt'
      )}
    >
      {/*
        체크 · 제목 · X 세 칸 모두 위쪽 패딩을 py-2로 맞춰서 첫 줄 기준선이 정확히 겹치게 한다.
        그 패딩이 곧 터치 영역이기도 하다 (아이콘 20px + 상하 8px = 36px).
        음수 마진으로 위치를 미세 조정하지 말 것 — 폰트가 바뀌면 바로 어긋난다.
      */}
      <div className="flex items-start">
        <button
          type="button"
          onClick={toggleDone}
          disabled={busy}
          aria-label={done ? '완료 취소' : '완료로 표시'}
          className="shrink-0 py-2 pr-2.5 transition-transform active:scale-90"
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
          className="min-w-0 flex-1 py-2 text-left"
        >
          <p
            className={cn(
              'text-body-sm break-words',
              done ? 'text-ink-faint line-through' : 'text-ink'
            )}
          >
            {todo.title}
          </p>

          {(todo.due_date || handledByOther || noteCount > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {todo.due_date && (
                <Badge tone={DUE_TONE[due]}>
                  {formatRelativeDay(`${todo.due_date}T00:00:00Z`)}
                </Badge>
              )}
              {handledByOther && (
                <Badge tone="success">{handler?.display_name ?? '누군가'}가 대신 처리</Badge>
              )}
              {noteCount > 0 && <Badge>메모 {noteCount}</Badge>}
            </div>
          )}
        </button>

        {/* 소프트 삭제 — 확인 창 없이 바로 치우고, 복구는 DB에 남은 deleted_at으로 한다 */}
        {canRemove && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label="할 일 지우기"
            className="shrink-0 py-2 pl-2.5 text-ink-faint transition-[color,transform] active:scale-90 sm:hover:text-danger"
          >
            <span className="grid size-5 place-items-center">
              <svg
                viewBox="0 0 16 16"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        )}
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
                          imageUrl={n.author_avatar_url}
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

              {!isMine && !done && (
                <div className="mt-2.5">
                  <Button size="sm" variant="outline" onClick={() => onHandoff(todo)}>
                    대신 처리
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
