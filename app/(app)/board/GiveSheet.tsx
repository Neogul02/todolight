'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { BottomSheet } from '@/components/BottomSheet';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/ui';
import type { MemberSummary, Todo } from '@/types/db';

/**
 * 넘기기 — 할 일을 다른 팀원 컬럼으로 옮긴다.
 *
 * 사람을 누르는 순간 넘어간다(확인 단계 없음). 지우기와 같은 이유다 — 실행취소 토스트로
 * 바로 되돌릴 수 있는 동작에 확인 창을 한 번 더 두면 손만 늘어난다.
 * 그래서 메모 칸이 목록 **위에** 있다: 쓰고 나서 사람을 누르는 순서라야 한다.
 *
 * 트랙 바깥(ViewPager)에서 그린다 — 카드 안에서 열면 시트(body로 포털됨) 안의 클릭이
 * 카드 입장에서 "바깥 클릭"이라 카드가 접히며 시트까지 함께 언마운트된다.
 */
export default function GiveSheet({
  todo,
  members,
  currentUserId,
  onClose,
}: {
  todo: Todo;
  members: MemberSummary[];
  currentUserId: string;
  onClose: () => void;
}) {
  const t = useTranslations('give');
  const { give } = useTodoMutations(todo.org_id);
  const [note, setNote] = useState('');
  const candidates = members.filter(m => m.user_id !== todo.owner_id);

  function pick(m: MemberSummary) {
    give.mutate({
      todo,
      toUserId: m.user_id,
      toName: m.display_name,
      actorId: currentUserId,
      note: note.trim() || undefined,
    });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={t('title')}>
      <p className="text-body-sm text-ink">{todo.title}</p>

      {candidates.length === 0 ? (
        <p className="mt-4 text-caption text-ink-muted">{t('noOne')}</p>
      ) : (
        <>
          <Input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            maxLength={1000}
            enterKeyHint="done"
            className="mt-4 w-full"
          />
          <ul className="mt-3 flex flex-col gap-1">
            {candidates.map(m => (
              <li key={m.user_id}>
                <button
                  type="button"
                  onClick={() => pick(m)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors active:bg-surface-alt pointer-fine:hover:bg-surface-alt"
                >
                  <Avatar
                    name={m.display_name}
                    color={m.avatar_color}
                    imageUrl={m.avatar_url}
                    seed={m.user_id}
                  />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                    {m.display_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
