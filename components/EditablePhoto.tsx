'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/BottomSheet';
import { cn } from '@/lib/utils';

/**
 * 누르면 사진을 바꾸는 사진 — 프로필 사진과 조직 아이콘이 같이 쓴다(iOS `EditablePhoto`).
 *
 * 예전엔 사진 옆에 「사진 바꾸기」·「삭제」 버튼 두 개를 늘어놓았다. 어쩌다 한 번 하는 일이 카드 한 줄을
 * 통째로 차지했다. 사진 자체가 버튼이고 오른쪽 아래 카메라 표시가 "누를 수 있다"를 알린다.
 * - 사진이 없으면 고를 것뿐이니 바로 파일 선택을 연다.
 * - 있으면 「다른 사진 고르기 · 사진 지우기」 시트를 연다.
 * 올리는 동안은 스피너 대신 사진이 은은하게 깜빡인다.
 */
export function EditablePhoto({
  hasPhoto,
  uploading,
  onPick,
  onRemove,
  label,
  className,
  children,
}: {
  hasPhoto: boolean;
  uploading: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  /** 스크린 리더용 — 무엇의 사진인지 */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('photo');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      <button
        type="button"
        aria-label={label}
        disabled={uploading}
        onClick={() => (hasPhoto ? setMenuOpen(true) : fileRef.current?.click())}
        className={cn(
          'relative shrink-0 rounded-full transition-transform active:scale-[0.94]',
          uploading && 'animate-pulse opacity-50',
          className
        )}
      >
        {children}
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full border border-hairline-strong bg-surface text-ink"
        >
          <CameraIcon />
        </span>
      </button>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              fileRef.current?.click();
            }}
            className="h-12 rounded-xl border border-hairline bg-surface text-[15px] font-medium text-ink transition-transform active:scale-[0.98]"
          >
            {t('chooseAnother')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="h-12 rounded-xl border border-hairline bg-surface text-[15px] font-medium text-danger transition-transform active:scale-[0.98]"
          >
            {t('remove')}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 4.5 7.6 6.5H5A2.5 2.5 0 0 0 2.5 9v9A2.5 2.5 0 0 0 5 20.5h14a2.5 2.5 0 0 0 2.5-2.5V9A2.5 2.5 0 0 0 19 6.5h-2.6L15 4.5H9Zm3 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
    </svg>
  );
}
