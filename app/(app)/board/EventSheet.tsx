'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/BottomSheet';
import { DuePicker } from '@/components/DuePicker';
import { Button, Input } from '@/components/ui';
import { EVENT_COLORS } from '@/lib/event-colors';
import { useEventMutations } from '@/hooks/useOrgEvents';
import { cn, todayKST } from '@/lib/utils';
import type { OrgEvent } from '@/types/db';

/**
 * 일정 추가·수정 시트.
 * `event`가 있으면 수정, 없으면 `defaultDate`에서 시작하는 새 일정.
 */
export function EventSheet({
  open,
  onClose,
  orgId,
  event,
  defaultDate,
  canDelete,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
  event: OrgEvent | null;
  defaultDate: string;
  canDelete: boolean;
}) {
  const t = useTranslations('event');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={event ? t('editTitle') : t('newTitle')}
      className="sm:max-w-[520px]"
    >
      {orgId && (
        // key로 시트를 열 때마다 새로 만든다 — 이전에 편집하던 값이 남아 있으면 안 된다
        <EventForm
          key={event?.id ?? `new-${defaultDate}`}
          orgId={orgId}
          event={event}
          defaultDate={defaultDate}
          canDelete={canDelete}
          onClose={onClose}
        />
      )}
    </BottomSheet>
  );
}

function EventForm({
  orgId,
  event,
  defaultDate,
  canDelete,
  onClose,
}: {
  orgId: string;
  event: OrgEvent | null;
  defaultDate: string;
  canDelete: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('event');
  const tCommon = useTranslations('common');
  const { create, update, remove } = useEventMutations(orgId);

  const [title, setTitle] = useState(event?.title ?? '');
  const [color, setColor] = useState(event?.color ?? EVENT_COLORS[0].key);
  const [start, setStart] = useState(event?.start_date ?? defaultDate ?? todayKST());
  const [end, setEnd] = useState(event?.end_date ?? defaultDate ?? todayKST());

  const busy = create.isPending || update.isPending || remove.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;

    const done = { onSuccess: onClose };
    if (event) {
      update.mutate(
        { eventId: event.id, title: trimmed, color, startDate: start, endDate: end },
        done
      );
    } else {
      create.mutate({ title: trimmed, color, startDate: start, endDate: end }, done);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-ink-secondary">{t('nameLabel')}</span>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={200}
          enterKeyHint="done"
        />
      </label>

      <div>
        <span className="text-caption font-medium text-ink-secondary">{t('colorLabel')}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {EVENT_COLORS.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setColor(c.key)}
              aria-label={t(`colors.${c.key}`)}
              aria-pressed={color === c.key}
              className={cn(
                'grid size-9 place-items-center rounded-full border-2 transition-transform active:scale-90',
                color === c.key ? 'border-ink' : 'border-transparent'
              )}
            >
              <span className="size-6 rounded-full" style={{ background: c.bar }} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-caption font-medium text-ink-secondary">{t('startLabel')}</span>
        {/*
          allowNone={false} — 일정은 시작과 끝이 반드시 있다. 기본값 그대로 두면 맨 앞에
          "마감 없음" 칸이 서는데, 누르면 라벨과 달리 오늘로 바뀌어 버린다.
        */}
        <DuePicker
          value={start}
          allowNone={false}
          onChange={next => {
            const day = next ?? todayKST();
            setStart(day);
            // 시작이 끝을 넘어서면 하루짜리로 맞춘다 — 거꾸로 된 기간을 만들 이유가 없다
            if (day > end) setEnd(day);
          }}
          className="mt-1.5"
        />
      </div>

      <div>
        <span className="text-caption font-medium text-ink-secondary">{t('endLabel')}</span>
        <DuePicker
          value={end}
          allowNone={false}
          onChange={next => setEnd(next ?? start)}
          className="mt-1.5"
        />
      </div>

      <div className="flex gap-2">
        {event && canDelete && (
          <Button
            type="button"
            variant="danger"
            onClick={() => remove.mutate(event.id, { onSuccess: onClose })}
            disabled={busy}
          >
            {t('delete')}
          </Button>
        )}
        {/*
          취소 버튼은 두지 않는다 — BottomSheet는 ESC · 바깥 누르기 · 아래로 끌기 셋으로
          이미 닫힌다. 네 번째 수단을 두느니 그 폭을 주 동작에 준다.
          편집 중에는 지우기와 나란히 서므로 393px에서도 둘 다 손가락에 맞는다.
        */}
        <Button type="submit" className="flex-1" disabled={busy || !title.trim()}>
          {event ? tCommon('save') : t('add')}
        </Button>
      </div>
    </form>
  );
}
