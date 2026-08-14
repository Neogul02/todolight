'use client';

import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * 모바일에서 아래에서 올라오는 시트, sm 이상에서는 가운데 모달.
 * iOS 습관대로 아래로 끌어내리면 닫히고, 홈 인디케이터 높이만큼 여백을 준다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    // 시트를 열기 직전에 무엇이 포커스를 갖고 있었는지 기억해 뒀다가 닫을 때 돌려준다
    const restoreTo = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Tab이 시트 밖으로 새면 뒤에 가려진 화면을 조작하게 된다 — 시트 안에서 돌린다
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    const prevOverflow = document.body.style.overflow;
    // 시트가 떠 있는 동안 뒤 페이지가 같이 스크롤되면 위치를 잃는다
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    // 열자마자 첫 항목에 포커스를 둬야 키보드 사용자가 시트 안에서 시작한다
    const focusTimer = setTimeout(() => focusables()[0]?.focus(), 60);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
      restoreTo?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={e => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-4"
        >
          <motion.div
            key="sheet"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose();
            }}
            className={cn(
              'w-full max-w-[480px] rounded-t-3xl border border-hairline bg-surface pb-safe shadow-level-2',
              'sm:rounded-2xl sm:pb-0',
              className
            )}
          >
            {/* 드래그 핸들 — 데스크톱에서는 의미가 없어 숨긴다 */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-hairline-strong" />
            </div>

            {title && (
              <h2 id={titleId} className="px-5 pt-3 pb-1 text-title text-ink no-select sm:pt-5">
                {title}
              </h2>
            )}

            <div className="px-5 pt-2 pb-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
