'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useLedgerEntries, useLedgerMutations, useLedgerRealtime } from '@/hooks/useOrgLedger';
import { useOrgMembers } from '@/hooks/useOrgBoard';
import { DuePicker } from '@/components/DuePicker';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Input } from '@/components/ui';
import { focusNextOnEnter } from '@/lib/forms';
import {
  addMonths,
  cn,
  currentMonthKST,
  formatMoney,
  formatMonth,
  formatRelativeDay,
  monthRange,
  todayKST,
} from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { LedgerEntry } from '@/types/db';
import { useApp } from '../OrgContext';

/** 금액은 13자리(조 단위)까지만 — 그 위는 서버 검증에서 어차피 막힌다 */
const MAX_AMOUNT_DIGITS = 13;

/** 적어 넣을 기본 날짜: 이번 달을 보고 있으면 오늘, 지난 달이면 그 달 1일 */
function defaultDayOf(month: string): string {
  return month === currentMonthKST() ? todayKST() : monthRange(month).start;
}

/**
 * 가계부 — 조직이 쓴 돈을 적어 두고 한 달 합계를 본다.
 *
 * 보드의 네 번째 뷰가 아니라 별도 라우트다. 보드의 세 뷰는 전부 같은 `todos` 캐시를 다르게
 * 그린 것이지만, 가계부는 데이터도(지출) 연산도(합계) 다르다 — BoardClient에 얹으면
 * 가계부만 보는 동안에도 보드 쿼리와 실시간 구독이 계속 돈다.
 */
export default function LedgerClient() {
  const { activeOrgId, userId, orgs, profile, openMenu, pendingInvites } = useApp();
  const locale = useLocale() as Locale;
  const t = useTranslations('ledger');
  const tCommon = useTranslations('common');

  const [month, setMonth] = useState(currentMonthKST);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [spentOn, setSpentOn] = useState<string>(() => defaultDayOf(currentMonthKST()));
  // 금액 → "다음" → 내용 → "완료"면 바로 추가된다. 영수증을 몰아 적을 때 손이 화면으로 안 내려간다.
  const titleRef = useRef<HTMLInputElement>(null);

  const members = useOrgMembers(activeOrgId);
  const entries = useLedgerEntries(activeOrgId, month);
  useLedgerRealtime(activeOrgId);
  const { add, remove } = useLedgerMutations(activeOrgId, month);

  const rows = useMemo(() => entries.data ?? [], [entries.data]);
  const total = useMemo(() => rows.reduce((sum, e) => sum + e.amount, 0), [rows]);

  /* 낸 사람별 합계 — 공유 가계부라 "누가 얼마 냈나"가 총액만큼 자주 궁금하다 */
  const byPayer = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(e => map.set(e.payer_id, (map.get(e.payer_id) ?? 0) + e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const memberOf = (id: string) => members.data?.find(m => m.user_id === id);

  /*
    입력칸이 문자열이고 제출할 값이 숫자라 둘이 갈라진다 — 실제로 보낼 값을 여기서 한 번만
    구해서 버튼 비활성 판정과 제출이 같은 값을 보게 한다.
    (이게 갈라져 있을 때 "0"이나 "abc"를 넣으면 버튼은 눌리는데 제출 함수는 조용히 return해서,
    눌러도 아무 일도 안 일어나고 이유도 안 나왔다.)
  */
  const parsedAmount = useMemo(() => Number(amount.replace(/[^0-9]/g, '')) || 0, [amount]);

  /* 날짜 피커에 보여 줄 범위 — 시작은 늘 1일이라 마지막 날짜 숫자가 곧 그 달의 일수다 */
  const monthDays = useMemo(() => {
    const { start, end } = monthRange(month);
    return { start, count: Number(end.slice(8)) };
  }, [month]);

  const canSubmit = parsedAmount > 0 && title.trim().length > 0 && !add.isPending;

  /*
    금액은 숫자만 받고 천 단위로 끊어 보여 준다.
    "12000"과 "120000"을 눈으로 구분하기 어려운 게 오입력의 큰 원인이고,
    애초에 숫자 아닌 글자가 들어갈 길을 막으면 "왜 추가가 안 되지"가 사라진다.
  */
  function changeAmount(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_AMOUNT_DIGITS);
    setAmount(digits ? Number(digits).toLocaleString(locale) : '');
  }

  /* 달을 옮기면 적을 날짜도 그 달로 따라간다 — 보고 있는 달과 저장되는 달이 갈리면 안 된다 */
  function goMonth(delta: number) {
    const next = addMonths(month, delta);
    setMonth(next);
    setSpentOn(defaultDayOf(next));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    add.mutate(
      { amount: parsedAmount, title: title.trim(), spentOn },
      {
        onSuccess: () => {
          setAmount('');
          setTitle('');
          // 날짜는 남긴다 — 하루치 영수증을 몰아 적을 때 매번 다시 고르게 하면 손이 많이 간다
        },
      }
    );
  }

  if (orgs.length === 0) {
    return (
      <Notice
        title={t('noOrgTitle')}
        description={t('noOrgDescription')}
        action={
          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/orgs/new"
              className="flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
            >
              {t('createOrg')}
            </Link>
            <button
              type="button"
              onClick={openMenu}
              className="flex h-13 items-center justify-center gap-1.5 rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
            >
              {t('checkInvites')}
              {pendingInvites > 0 && <span className="size-2 rounded-full bg-danger" />}
            </button>
          </div>
        }
      />
    );
  }

  /*
    설정에서 끈 상태로 주소를 직접 열었을 때. 조용히 /board로 튕기면 "왜 안 열리지"가 되므로
    어디서 켜는지 알려 준다.
  */
  if (profile && !profile.show_ledger) {
    return (
      <Notice
        title={t('disabledTitle')}
        description={t('disabledDescription')}
        action={
          <Link
            href="/me"
            className="mt-7 flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('goToSettings')}
          </Link>
        }
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-5 pb-safe sm:py-6">
      {/* 달 이동 — 합계는 "한 달치"여야 의미가 있다. 범위가 없으면 숫자가 영원히 커지기만 한다 */}
      <div className="flex items-center gap-1">
        <MonthButton dir="prev" label={t('prevMonth')} onClick={() => goMonth(-1)} />
        <h1 className="flex-1 text-center text-title text-ink tabular-nums">
          {formatMonth(month, locale)}
        </h1>
        <MonthButton dir="next" label={t('nextMonth')} onClick={() => goMonth(1)} />
      </div>

      <Card className="p-5">
        <p className="text-caption text-ink-muted">{t('totalLabel')}</p>
        <p className="mt-1 text-heading-1 text-ink tabular-nums">{formatMoney(total, locale)}</p>
        <p className="mt-0.5 text-caption text-ink-faint">{t('entryCount', { count: rows.length })}</p>

        {byPayer.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-t border-hairline pt-3">
            {byPayer.map(([payerId, sum]) => {
              const m = memberOf(payerId);
              return (
                <li key={payerId} className="flex items-center gap-2">
                  <Avatar
                    name={m?.display_name ?? '?'}
                    color={m?.avatar_color}
                    imageUrl={m?.avatar_url}
                    seed={payerId}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                    {m?.display_name ?? t('unknownMember')}
                  </span>
                  <span className="text-[14px] text-ink-secondary tabular-nums">
                    {formatMoney(sum, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <div className="flex gap-2">
            {/*
              inputMode="numeric"이라야 폰에서 숫자 키패드가 뜬다.
              type="number"는 쓰지 않는다 — iOS에서 스피너·휠 스크롤로 값이 바뀌고,
              "12,000"처럼 붙여 넣은 값을 통째로 버린다.

              폭은 w-[38%]가 아니라 basis로 잡는다. Input이 이미 w-full을 갖고 있어서
              둘 중 어느 쪽이 이길지는 클래스 순서가 아니라 스타일시트 순서에 달렸고,
              실제로 w-full이 이겨서 금액 칸이 줄 전체를 먹고 내용 칸이 카드 밖으로 밀렸다.
              flex 항목에서는 basis가 width를 이긴다.
            */}
            <Input
              value={amount}
              onChange={e => changeAmount(e.target.value)}
              inputMode="numeric"
              placeholder={t('amountPlaceholder')}
              aria-label={t('amountPlaceholder')}
              enterKeyHint="next"
              onKeyDown={e => focusNextOnEnter(e, titleRef.current)}
              className="shrink-0 grow-0 basis-[38%] tabular-nums"
            />
            <Input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              aria-label={t('titlePlaceholder')}
              enterKeyHint="done"
              maxLength={100}
              className="min-w-0 flex-1"
            />
          </div>

          {/*
            보고 있는 달의 날짜만 고르게 한다. 오늘 기준으로 앞뒤 며칠을 늘어놓으면
            7월을 보면서 적은 지출이 8월로 저장돼 목록에서 사라진다.
            카드 패딩까지 스크롤 영역을 넓혀 가장자리에서 잘린 것처럼 보이지 않게 한다.
          */}
          <DuePicker
            /*
              달마다 다시 마운트시킨다 — DuePicker는 "열릴 때 선택된 날짜를 가운데로"
              스크롤을 마운트 시점에 한 번만 잡는다. key가 없으면 달을 넘겨도 스크롤이
              지난 달 자리에 남아 엉뚱한 날짜부터 보인다.
            */
            key={month}
            value={spentOn}
            onChange={next => setSpentOn(next ?? defaultDayOf(month))}
            allowNone={false}
            anchor={monthDays.start}
            pastDays={0}
            futureDays={monthDays.count - 1}
            className="-mx-5 px-5"
          />

          <Button type="submit" disabled={!canSubmit}>
            {t('addEntry')}
          </Button>
        </form>
      </Card>

      {entries.isLoading ? (
        <p className="py-8 text-center text-caption text-ink-faint">{tCommon('loading')}</p>
      ) : entries.error ? (
        <p className="py-8 text-center text-caption text-danger">{String(entries.error.message)}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-caption text-ink-faint">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              locale={locale}
              payerName={memberOf(entry.payer_id)?.display_name ?? t('unknownMember')}
              payerColor={memberOf(entry.payer_id)?.avatar_color ?? null}
              payerAvatar={memberOf(entry.payer_id)?.avatar_url ?? null}
              canRemove={entry.created_by === userId || entry.payer_id === userId}
              onRemove={() => remove.mutate(entry.id)}
              removing={remove.isPending}
              deleteLabel={tCommon('delete')}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function EntryRow({
  entry,
  locale,
  payerName,
  payerColor,
  payerAvatar,
  canRemove,
  onRemove,
  removing,
  deleteLabel,
}: {
  entry: LedgerEntry;
  locale: Locale;
  payerName: string;
  payerColor: string | null;
  payerAvatar: string | null;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
  deleteLabel: string;
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5">
      <Avatar
        name={payerName}
        color={payerColor}
        imageUrl={payerAvatar}
        seed={entry.payer_id}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm break-words text-ink">{entry.title}</p>
        <p className="mt-0.5 text-caption text-ink-faint">
          {payerName} · {formatRelativeDay(`${entry.spent_on}T00:00:00Z`, locale)}
        </p>
      </div>
      <p className="shrink-0 pt-0.5 text-body-sm font-medium text-ink tabular-nums">
        {formatMoney(entry.amount, locale)}
      </p>
      {/* 소프트 삭제라 확인 창 없이 바로 지운다 — 되살릴 수 있는 것과 아닌 것을 구분한다 */}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={deleteLabel}
          className="-my-1 shrink-0 p-1.5 text-ink-faint transition-[color,transform] active:scale-90 sm:hover:text-danger"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </li>
  );
}

function MonthButton({
  dir,
  label,
  onClick,
}: {
  dir: 'prev' | 'next';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-xl no-select transition-colors active:bg-canvas-soft"
    >
      <svg
        viewBox="0 0 24 24"
        className={cn('size-5 text-ink-secondary', dir === 'next' && 'rotate-180')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Notice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-safe text-center">
      <h1 className="text-heading-1 text-ink">{title}</h1>
      <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
      {action}
    </main>
  );
}
