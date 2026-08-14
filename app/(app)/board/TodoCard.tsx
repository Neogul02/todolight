'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { cn, dueState, formatRelativeDay } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';
import { DuePicker } from '@/components/DuePicker';
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
  open,
  onToggleOpen,
  onHandoff,
}: {
  todo: Todo;
  isMine: boolean;
  members: MemberSummary[];
  currentUserId: string;
  isManager: boolean;
  /** 보드 전체에서 하나만 펼쳐진다 — 상태는 위에서 관리한다 */
  open: boolean;
  onToggleOpen: () => void;
  onHandoff: (todo: Todo) => void;
}) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(todo.title);
  const [draftDue, setDraftDue] = useState<string | null>(todo.due_date);
  // 편집을 시작한 순간의 값. "안 바뀜" 판정의 기준이 된다.
  const editBase = useRef({ title: todo.title, due: todo.due_date });
  const { toggleStatus, edit, remove, addNote } = useTodoMutations(todo.org_id);
  const busy = toggleStatus.isPending || remove.isPending || addNote.isPending;

  const done = todo.status === 'done';
  const handler = todo.handled_by ? members.find(m => m.user_id === todo.handled_by) : null;
  const handledByOther = done && todo.handled_by && todo.handled_by !== todo.owner_id;
  const due = dueState(todo.due_date);
  const canRemove = isMine || todo.created_by === currentUserId || isManager;

  function toggleDone() {
    // 남의 할 일을 완료로 바꾸는 건 "대신 처리" — 메모를 반드시 받는다.
    if (!done && !isMine) {
      onHandoff(todo);
      return;
    }
    toggleStatus.mutate({ todo, next: done ? 'todo' : 'done', actorId: currentUserId });
  }

  function startEditing() {
    // 편집을 시작할 때마다 지금 값으로 초안을 다시 채운다
    setDraftTitle(todo.title);
    setDraftDue(todo.due_date);
    editBase.current = { title: todo.title, due: todo.due_date };
    setEditing(true);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    setEditing(false);

    // 기준은 편집을 시작한 순간의 값이다. 지금의 todo.title과 비교하면,
    // 편집하는 동안 남이 고친 내용이 "내가 바꾼 것"으로 오인돼 그대로 덮어써진다.
    const untouched = title === editBase.current.title && draftDue === editBase.current.due;
    if (untouched) return;

    edit.mutate({ todo, title, dueDate: draftDue });
  }

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const content = note.trim();
    if (!content) return;
    setNote('');
    addNote.mutate({ todoId: todo.id, content });
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
          onClick={onToggleOpen}
          aria-expanded={open}
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
            onClick={() => remove.mutate(todo)}
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
              {editing ? (
                <form onSubmit={submitEdit} className="flex flex-col gap-2">
                  <Input
                    value={draftTitle}
                    onChange={e => setDraftTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    maxLength={500}
                    enterKeyHint="done"
                    autoFocus
                    className="h-11 sm:h-10"
                  />
                  {/* 컬럼 패딩까지 스크롤 영역을 넓혀 가장자리에서 잘린 것처럼 보이지 않게 한다 */}
                  <DuePicker value={draftDue} onChange={setDraftDue} className="-mx-3 px-3" />
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setEditing(false)}
                    >
                      취소
                    </Button>
                    <Button type="submit" className="flex-1" disabled={!draftTitle.trim()}>
                      저장
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  {noteCount > 0 && (
                    <ul className="mb-2.5 flex flex-col gap-2">
                      {todo.notes!.map(n => (
                        <li key={n.id} className="rounded-lg bg-canvas-soft px-2.5 py-2">
                          <p className="text-caption break-words text-ink-secondary">{n.content}</p>
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

                  {/*
                    Input은 w-full이라 min-w-0이 없으면 flex 안에서 줄어들지 못하고
                    전송 버튼을 카드 밖으로 밀어낸다.
                  */}
                  <form onSubmit={submitNote} className="flex items-center gap-1.5">
                    <Input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="메모 남기기"
                      maxLength={1000}
                      enterKeyHint="send"
                      className="h-10 min-w-0 flex-1"
                    />
                    <button
                      type="submit"
                      aria-label="메모 등록"
                      disabled={addNote.isPending || !note.trim()}
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition-[opacity,transform] active:scale-90 disabled:opacity-30"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 10h11M10.5 5 15.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </form>

                  {(canRemove || (!isMine && !done)) && (
                    <div className="mt-2.5 flex gap-1.5">
                      {canRemove && (
                        <Button size="sm" variant="outline" onClick={startEditing}>
                          수정
                        </Button>
                      )}
                      {!isMine && !done && (
                        <Button size="sm" variant="outline" onClick={() => onHandoff(todo)}>
                          대신 처리
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
