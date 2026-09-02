'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { cn, dueState, formatRelativeDay } from '@/lib/utils';
import { DuePicker } from './DuePicker';
import type { Locale } from '@/lib/locales';

/*
  마감일 알약 — 접혀 있을 때는 "오늘"이라는 한 마디이고, 누르면 그 자리에서 날짜 레일이 펼쳐진다.

  예전에는 할 일 추가 칸에 글자를 넣는 순간 레일과 [추가] 버튼이 **아래에서 솟아나** 목록을
  통째로 밀어냈다. 한 글자 치는 동작에 화면이 100px 가까이 움직이니 방금 보던 카드가 어디로
  갔는지 매번 다시 찾아야 했고, 정작 날짜는 대부분 기본값(오늘) 그대로 두면서 그 자리만
  차지했다. 반대로 날짜를 **한 번도 보여 주지 않으면** "Enter를 치면 며칠로 저장되는가"를
  화면이 답하지 못한다 — 실제로 마감이 조용히 오늘로 박히는 걸 모르는 채로 쓰게 된다.

  그래서 늘 자리를 지키되 한 줄(28px)만 쓰고, 필요한 사람만 눌러서 편다.
  펴고 접는 것이 곧 이 앱에서 가장 자주 만지는 동작이라, 여기 하나에만 모션을 준다.

  마감일과 가계부의 쓴 날이 같은 피커를 쓴다는 규칙은 그대로다 — 이건 그 피커를 감싸는
  껍데기이지 두 번째 피커가 아니다.
*/

/** 지난 마감만 색으로 알린다. 오늘·나중은 기본값에 가까워서 색을 주면 경고처럼 읽힌다 */
const TONE = {
  overdue: 'border-danger/40 bg-danger-soft text-danger',
  today: 'border-hairline-strong bg-surface text-ink',
  upcoming: 'border-hairline-strong bg-surface text-ink',
  none: 'border-dashed border-hairline-strong bg-transparent text-ink-faint',
} as const;

export function DuePill({
  value,
  onChange,
  open,
  onOpenChange,
  className,
  railClassName,
  allowNone = true,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  /** 펼침은 부모가 들고 있는다 — 추가를 마치면 부모가 접어야 하기 때문이다 */
  open: boolean;
  onOpenChange: (next: boolean) => void;
  className?: string;
  /**
   * 레일을 감싸는 상자에 붙는다. 컬럼 패딩만큼 좌우로 넓혀(`-mx-3 px-3`) 날짜가 가장자리에서
   * 잘린 것처럼 보이지 않게 하는 용도다. 애니메이션 때문에 이 상자가 overflow-hidden이라
   * **레일이 아니라 이 상자를 넓혀야** 넓힌 만큼이 잘리지 않는다.
   */
  railClassName?: string;
  allowNone?: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('duePicker');
  const reduceMotion = useReducedMotion();

  const state = dueState(value);
  const label = value ? formatRelativeDay(`${value}T00:00:00Z`, locale) : t('noDue');

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={t('changeDue', { date: label })}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium no-select',
          'transition-colors active:scale-[0.97]',
          TONE[state]
        )}
      >
        <CalendarGlyph className="size-3.5 opacity-70" />
        <span className="tabular-nums">{label}</span>
        <ChevronGlyph className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className={cn('overflow-hidden', railClassName)}
          >
            {/* 고르면 곧바로 접는다 — 고른 값은 알약에 그대로 적히니 레일이 남아 있을 이유가 없다 */}
            <DuePicker
              value={value}
              onChange={next => {
                onChange(next);
                onOpenChange(false);
              }}
              allowNone={allowNone}
              className="pt-1.5"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2.5" />
      <path d="M2.25 6.5h11.5M5.5 2v2.5M10.5 2v2.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m4 6.5 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
