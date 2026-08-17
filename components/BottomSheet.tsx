'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsClient } from '@/hooks/useIsClient';
import { cn } from '@/lib/utils';

/**
 * 모바일에서 아래에서 올라오는 시트, sm 이상에서는 가운데 모달.
 * iOS 습관대로 아래로 끌어내리면 닫히고, 홈 인디케이터 높이만큼 여백을 준다.
 *
 * **body로 포털한다.** 시트의 바깥 껍데기는 `fixed inset-0`인데, CSS에서 `position: fixed`는
 * 조상 중에 `transform`이 걸린 요소가 있으면 뷰포트가 아니라 **그 조상**을 기준으로 배치된다.
 * 뷰 전환기(ViewPager)가 패널 트랙에 `translateX`를 상시 걸고 있어서, 그 안에서 시트를 열면
 * 화면 밖으로 밀려난다. 트리 위치와 무관하게 늘 뷰포트를 덮도록 body에 그린다.
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
  // 슬라이드-업 애니메이션이 끝난 뒤 딱 한 번만 자동 포커스한다 — 아래 onAnimationComplete 참고
  const focusedOnEnterRef = useRef(false);

  const focusables = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    // 새로 열릴 때마다 자동 포커스를 한 번 다시 허용한다(닫힐 때는 안 건드린다 —
    // 그러면 닫히는 애니메이션이 끝나며 onAnimationComplete가 또 불려서 포커스를 도로 뺏어 간다)
    focusedOnEnterRef.current = false;

    const panel = panelRef.current;
    // 시트를 열기 직전에 무엇이 포커스를 갖고 있었는지 기억해 뒀다가 닫을 때 돌려준다
    const restoreTo = document.activeElement as HTMLElement | null;

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

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      restoreTo?.focus?.();
    };
  }, [open, onClose, focusables]);

  // 서버 렌더에는 document가 없다 — 하이드레이션 전에는 아무것도 그리지 않는다.
  // 시트는 사용자가 눌러야 열리므로 첫 페인트에 보일 일이 없다.
  const isClient = useIsClient();
  if (!isClient) return null;

  return createPortal(
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
            /*
              슬라이드-업이 끝나기 전에 포커스를 주면(예: 필드에 autoFocus) 포커스가 부른
              키보드가 아직 올라오는 중인 시트와 동시에 움직여서 겹쳐 보인다 — 애니메이션이
              다 끝난 뒤에야 포커스를 준다. 닫히는 애니메이션이 끝날 때도 이 콜백이 다시
              불리므로 focusedOnEnterRef로 한 번만 걸리게 막는다(안 막으면 restoreTo?.focus()로
              돌려놓은 포커스를 도로 뺏어 간다).
            */
            onAnimationComplete={() => {
              if (focusedOnEnterRef.current) return;
              focusedOnEnterRef.current = true;
              focusables()[0]?.focus();
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

            {/*
              내용이 길면(달력처럼) 시트가 화면 밖으로 잘린다 — 여기서만 스크롤시킨다.
              패널 전체를 스크롤 컨테이너로 만들면 드래그로 닫기와 엉킨다.
              목록 맨 위에서 아래로 당기면 시트가 닫히는데, iOS 시트의 표준 동작이라 그대로 둔다.
            */}
            <div className="max-h-[70dvh] overflow-y-auto overscroll-contain px-5 pt-2 pb-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
