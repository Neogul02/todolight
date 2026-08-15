'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { cn, dueState, formatKSTTime, formatRelativeDay, subjectParticle } from '@/lib/utils';
import { getAvatarColor } from '@/lib/avatar';
import { vibrateTick } from '@/lib/haptics';
import { Avatar } from '@/components/Avatar';
import { DuePicker } from '@/components/DuePicker';
import { Badge, Button, Input } from '@/components/ui';
import type { Locale } from '@/lib/locales';
import type { MemberSummary, Todo } from '@/types/db';
import type { TypingUser } from '@/hooks/useTypingPresence';
import type { FocusUser } from '@/hooks/useFocusPresence';

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
  typingUsers,
  onTyping,
  focusUsers,
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
  /** 지금 이 할 일의 제목/메모를 입력 중인 다른 멤버들 */
  typingUsers?: TypingUser[];
  onTyping: (todoId: string, field: 'title' | 'note') => void;
  /** 지금 이 카드를 펼쳐서 보고 있는 다른 멤버들 */
  focusUsers?: FocusUser[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('board');
  const reduceMotion = useReducedMotion();
  const { toggleStatus, remove } = useTodoMutations(todo.org_id);
  const busy = toggleStatus.isPending || remove.isPending;
  const participantIds = todo.participant_ids ?? [];

  const done = todo.status === 'done';
  const handler = todo.handled_by ? members.find(m => m.user_id === todo.handled_by) : null;
  const handledByOther = done && todo.handled_by && todo.handled_by !== todo.owner_id;
  /*
    주인이 직접 넣은 게 아니면 누가 부탁한 것이다.
    "이거 왜 내 목록에 있지"를 카드에서 바로 알 수 있어야 한다 — 추가할 때 뜬 토스트는
    금방 사라지고, 남의 컬럼에 꽂아 넣은 사람 말고는 아무도 그 토스트를 못 본다.
  */
  const askedByOther = todo.created_by !== todo.owner_id;
  const requester = askedByOther
    ? members.find(m => m.user_id === todo.created_by)
    : undefined;

  /**
   * "최진형이 부탁" / "Requested by Jinhyung" — 한국어는 받침에 따라 조사가 갈려서
   * ICU 메시지 하나로 표현할 수 없다. 로케일에 따라 아예 다른 문장 구조를 쓴다.
   */
  const requestedByText = (name: string) =>
    locale === 'ko' ? `${name}${subjectParticle(name)} 부탁` : t('card.requestedBy', { name });
  const handledByText = (name: string) =>
    locale === 'ko' ? `${name}${subjectParticle(name)} 대신 처리` : t('card.handledByOther', { name });

  const requesterName = requester?.display_name ?? t('someone');
  const handlerName = handler?.display_name ?? t('someone');
  const due = dueState(todo.due_date);
  const canRemove = isMine || todo.created_by === currentUserId || isManager;

  function toggleDone() {
    // 남의 할 일을 완료로 바꾸는 건 "대신 처리" — 메모를 반드시 받는다.
    if (!done && !isMine) {
      onHandoff(todo);
      return;
    }
    if (!done) vibrateTick();
    toggleStatus.mutate({ todo, next: done ? 'todo' : 'done', actorId: currentUserId });
  }

  /*
    제목은 늘 여닫기만 한다 — 예전엔 열린 상태에서 제목을 한 번 더 누르면 바로 편집 폼으로
    덮어써서, 편집을 취소해도 카드가 펼쳐진 채로 남고 접을 방법이 마땅치 않았다(제목을 눌러도
    또 편집으로 들어갈 뿐). 여닫기와 편집 진입을 분리해야 아코디언처럼 예측 가능해진다 —
    편집은 펼친 내용 안의 연필 아이콘으로 따로 들어간다(TodoCardOpenContent).
    편집 상태 자체도 그 컴포넌트 안에서만 산다 — 카드가 접히며 그 컴포넌트가 언마운트되면
    자동으로 초기화되니, "접혀도 편집 중이었다는 걸 기억해서 다시 열면 또 편집 화면"이 될
    여지가 아예 없다(effect로 상태를 되돌리는 것보다 이쪽이 React가 권장하는 방식이다).
  */
  function handleTitleClick() {
    onToggleOpen();
  }

  const noteCount = todo.notes?.length ?? 0;

  // 펼쳐진 상태에서 카드 바깥을 클릭하면 접힌다. 닫혀 있을 땐 검사할 필요가 없다.
  const cardRef = useRef<HTMLLIElement>(null);
  useOutsideClick(cardRef, onToggleOpen, open);

  const titleTypers = (typingUsers ?? []).filter(u => u.field === 'title');
  const noteTypers = (typingUsers ?? []).filter(u => u.field === 'note');
  const typingText = (users: TypingUser[]) =>
    t('card.typingIndicator', { name: users.map(u => u.displayName).join(', ') });

  /*
    노션처럼 — 지금 이 카드를 펼쳐서 보고 있는 다른 멤버를 테두리 + 아바타로 보여준다.
    본인 이벤트는 useFocusPresence가 이미 걸러 주므로 focusUsers는 항상 "남"이다.
    여러 명이 몰리면 테두리 색은 먼저 들어온 한 명만 쓴다 — 색이 계속 바뀌며 깜빡이는 것보다
    아바타를 겹쳐서 인원수를 보여주는 쪽이 덜 어지럽다.
  */
  const focusMembers = (focusUsers ?? [])
    .map(f => members.find(m => m.user_id === f.userId))
    .filter((m): m is MemberSummary => Boolean(m));
  const focusColor = focusMembers[0] ? getAvatarColor(focusMembers[0].avatar_color, focusMembers[0].user_id).bg : null;

  return (
    <motion.li
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.16 }}
      className={cn(
        'relative rounded-xl border border-hairline bg-surface px-3 py-1.5 transition-colors',
        done && 'bg-surface-alt'
      )}
    >
      {focusColor && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl border-2"
          style={{ borderColor: focusColor }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.45, 1] }}
          transition={
            reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      )}
      {focusMembers.length > 0 && (
        <div
          role="img"
          aria-label={t('card.viewingBadge', {
            names: focusMembers.map(m => m.display_name).join(', '),
          })}
          className="absolute -top-2 -right-2 flex -space-x-2"
        >
          {focusMembers.slice(0, 3).map(m => (
            <Avatar
              key={m.user_id}
              name={m.display_name}
              color={m.avatar_color}
              imageUrl={m.avatar_url}
              seed={m.user_id}
              size="sm"
              className="ring-2 ring-surface"
            />
          ))}
        </div>
      )}
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
          aria-label={done ? t('card.markUndone') : t('card.markDone')}
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
          onClick={handleTitleClick}
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

          {(todo.due_date ||
            askedByOther ||
            handledByOther ||
            noteCount > 0 ||
            participantIds.length > 0 ||
            titleTypers.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {titleTypers.length > 0 && <Badge>{typingText(titleTypers)}</Badge>}
              {todo.due_date && (
                <Badge tone={DUE_TONE[due]}>
                  {formatRelativeDay(`${todo.due_date}T00:00:00Z`, locale)}
                </Badge>
              )}
              {askedByOther && (
                <Badge className="pl-0.5">
                  <PersonDot member={requester} fallbackId={todo.created_by} />
                  {requestedByText(requesterName)}
                </Badge>
              )}
              {handledByOther && (
                <Badge tone="success" className="pl-0.5">
                  <PersonDot member={handler ?? undefined} fallbackId={todo.handled_by!} />
                  {handledByText(handlerName)}
                </Badge>
              )}
              {noteCount > 0 && <Badge>{t('card.notesCount', { count: noteCount })}</Badge>}
              {/* 같이하는 사람들 — 주인 컬럼·참여자 컬럼 양쪽에서 다 보인다 */}
              {participantIds.length > 0 && (
                <span className="flex -space-x-1.5">
                  {participantIds.map(uid => {
                    const m = members.find(mm => mm.user_id === uid);
                    return (
                      <Avatar
                        key={uid}
                        name={m?.display_name ?? '?'}
                        color={m?.avatar_color}
                        imageUrl={m?.avatar_url}
                        seed={uid}
                        size="sm"
                        className="size-4 border border-surface text-[8px]"
                      />
                    );
                  })}
                </span>
              )}
            </div>
          )}
        </button>

        {/* 소프트 삭제 — 확인 창 없이 바로 치우고, 복구는 DB에 남은 deleted_at으로 한다 */}
        {canRemove && (
          <button
            type="button"
            onClick={() => remove.mutate(todo)}
            disabled={busy}
            aria-label={t('card.deleteAria')}
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
            {/*
              편집/메모 상태(editing 등)는 여기 안에서만 산다 — open이 false가 되면 이
              서브트리 자체가 통째로 언마운트되니 다음에 다시 펼칠 때 상태가 저절로
              초기화된다. 부모에서 effect로 리셋하는 것보다 이 편이 더 단순하고 확실하다.
            */}
            <TodoCardOpenContent
              todo={todo}
              currentUserId={currentUserId}
              canRemove={canRemove}
              isMine={isMine}
              done={done}
              members={members}
              locale={locale}
              onTyping={onTyping}
              noteTypers={noteTypers}
              participantIds={participantIds}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function TodoCardOpenContent({
  todo,
  currentUserId,
  canRemove,
  isMine,
  done,
  members,
  locale,
  onTyping,
  noteTypers,
  participantIds,
}: {
  todo: Todo;
  currentUserId: string;
  canRemove: boolean;
  isMine: boolean;
  done: boolean;
  members: MemberSummary[];
  locale: Locale;
  onTyping: (todoId: string, field: 'title' | 'note') => void;
  noteTypers: TypingUser[];
  participantIds: string[];
}) {
  const t = useTranslations('board');
  const tCommon = useTranslations('common');
  const { edit, addNote, editNote, deleteNote, join, leave } = useTodoMutations(todo.org_id);
  const isParticipant = participantIds.includes(currentUserId);

  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(todo.title);
  const [draftDue, setDraftDue] = useState<string | null>(todo.due_date);
  // 편집을 시작한 순간의 값. "안 바뀜" 판정의 기준이 된다.
  const editBase = useRef({ title: todo.title, due: todo.due_date });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const noteCount = todo.notes?.length ?? 0;
  const typingText = (users: TypingUser[]) =>
    t('card.typingIndicator', { name: users.map(u => u.displayName).join(', ') });

  function startEditing() {
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

  function startEditingNote(noteId: string, content: string) {
    setEditingNoteId(noteId);
    setNoteDraft(content);
  }

  function submitNoteEdit(e: React.FormEvent) {
    e.preventDefault();
    const content = noteDraft.trim();
    if (!content || !editingNoteId) return;
    editNote.mutate({ todoId: todo.id, noteId: editingNoteId, content });
    setEditingNoteId(null);
  }

  return (
    /*
      overflow-x-hidden — 안전망이다. Input의 포커스 링은 ring-inset으로 이미 안쪽으로
      그리지만, DuePicker의 -mx-3 bleed처럼 폭을 계산해서 맞추는 요소가 하나라도 반 픽셀
      어긋나면 카드/컬럼이 가로로 넘친다. 여기서 한 번 잘라 두면 그런 계산 오차가 있어도
      바깥으로 새지 않는다.
    */
    <div className="mt-3 overflow-x-hidden border-t border-hairline pt-3">
      {editing ? (
        <form onSubmit={submitEdit} className="flex flex-col gap-2">
          <Input
            value={draftTitle}
            onChange={e => {
              setDraftTitle(e.target.value);
              onTyping(todo.id, 'title');
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') setEditing(false);
            }}
            maxLength={500}
            enterKeyHint="done"
            autoFocus
            className="h-10 w-full sm:h-9"
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
              {tCommon('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={!draftTitle.trim()}>
              {tCommon('save')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {/*
            제목은 여닫기 전용이라 편집은 여기 따로 둔다 — 펼친 내용 맨 위, 오른쪽 정렬.
            이 카드에서 오른쪽은 이미 "손대는 동작"의 자리다(헤더의 삭제 X, 배지의 참여자
            아바타 등) — 왼쪽에 두면 제목·본문이 흐르는 시작점과 겹쳐 뭘 누르는 건지 헷갈린다.
          */}
          {canRemove && (
            <div className="mb-2.5 flex justify-end">
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-1 text-caption text-ink-faint transition-colors active:scale-95 sm:hover:text-ink"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M11.5 2.5a1.5 1.5 0 0 1 2 2L6 12l-3 1 1-3 7.5-7.5Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t('card.edit')}
              </button>
            </div>
          )}

          {noteCount > 0 && (
            <ul className="mb-2.5 flex flex-col gap-2">
              {todo.notes!.map(n => {
                const mine = n.author_id === currentUserId;
                if (editingNoteId === n.id) {
                  return (
                    <li key={n.id} className="rounded-lg bg-canvas-soft px-2.5 py-2">
                      <form onSubmit={submitNoteEdit} className="flex flex-col gap-1.5">
                        <Input
                          value={noteDraft}
                          onChange={e => setNoteDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setEditingNoteId(null);
                          }}
                          maxLength={1000}
                          enterKeyHint="done"
                          autoFocus
                          className="h-9 w-full text-caption"
                        />
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setEditingNoteId(null)}
                          >
                            {tCommon('cancel')}
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            className="flex-1"
                            disabled={!noteDraft.trim()}
                          >
                            {tCommon('save')}
                          </Button>
                        </div>
                      </form>
                    </li>
                  );
                }
                return (
                  <li key={n.id} className="rounded-lg bg-canvas-soft px-2.5 py-2">
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        disabled={!mine}
                        onClick={() => mine && startEditingNote(n.id, n.content)}
                        className={cn(
                          'block min-w-0 flex-1 text-left text-caption break-words text-ink-secondary',
                          mine && 'sm:hover:text-ink'
                        )}
                      >
                        {n.content}
                      </button>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => deleteNote.mutate({ todoId: todo.id, noteId: n.id })}
                          disabled={deleteNote.isPending}
                          aria-label={t('card.deleteNoteAria')}
                          className="shrink-0 text-ink-faint transition-colors active:scale-90 sm:hover:text-danger"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="size-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <Avatar
                        name={n.author_name ?? '?'}
                        color={n.author_color}
                        imageUrl={n.author_avatar_url}
                        seed={n.author_id}
                        size="sm"
                        className="size-4 text-[9px]"
                      />
                      {/*
                        날짜만 있으면 같은 날 쌓인 메모의 순서를 알 수 없다 —
                        "오늘"에 KST 24시간 시각을 붙여 몇 시에 남긴 말인지 드러낸다.
                      */}
                      {n.author_name ?? t('unknown')} · {formatRelativeDay(n.created_at, locale)}{' '}
                      {formatKSTTime(n.created_at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {noteTypers.length > 0 && (
            <p className="mb-1.5 text-caption text-ink-faint">{typingText(noteTypers)}</p>
          )}

          {/*
            Input은 w-full이라 min-w-0이 없으면 flex 안에서 줄어들지 못하고
            전송 버튼을 카드 밖으로 밀어낸다.
          */}
          <form onSubmit={submitNote} className="flex items-center gap-1.5">
            <Input
              value={note}
              onChange={e => {
                setNote(e.target.value);
                onTyping(todo.id, 'note');
              }}
              placeholder={t('card.notePlaceholder')}
              maxLength={1000}
              enterKeyHint="send"
              className="h-10 min-w-0 flex-1"
            />
            <button
              type="submit"
              aria-label={t('card.noteSubmitAria')}
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

          {/*
            대신 처리는 별도 버튼 없이 체크박스로만 들어간다(toggleDone → 남의 할 일이면
            자동으로 onHandoff) — 같은 동작을 두 군데 두지 않는다.
          */}
          {!isMine && !done && (
            <div className="mt-2.5 flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  isParticipant
                    ? leave.mutate({ todoId: todo.id, userId: currentUserId })
                    : join.mutate({ todoId: todo.id, userId: currentUserId })
                }
                disabled={join.isPending || leave.isPending}
              >
                {isParticipant ? t('card.leaveTogether') : t('card.joinTogether')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 배지 안에 들어가는 아주 작은 아바타 — 이름만으로는 누구인지 한 박자 늦게 읽힌다 */
function PersonDot({ member, fallbackId }: { member?: MemberSummary; fallbackId: string }) {
  return (
    <Avatar
      name={member?.display_name ?? '?'}
      color={member?.avatar_color}
      imageUrl={member?.avatar_url}
      seed={fallbackId}
      size="sm"
      className="size-3.5 text-[8px]"
    />
  );
}
