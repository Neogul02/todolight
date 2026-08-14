'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { DEFAULT_THEME, isValidTheme, resolveTheme } from '@/lib/themes';

export const THEME_STORAGE_KEY = 'todolight_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/*
  "시스템"을 골랐으면 기기 설정이 바뀔 때마다 따라가야 한다.
  그러려면 구독을 하나 유지해야 하는데, 테마를 바꿀 때마다 갈아 끼워야 하므로
  모듈 수준에 둔다(화면 어디서 applyTheme을 부르든 구독은 하나뿐이다).
*/
let darkQuery: MediaQueryList | null = null;
let onSystemChange: (() => void) | null = null;

function unsubscribe() {
  if (darkQuery && onSystemChange) darkQuery.removeEventListener('change', onSystemChange);
  darkQuery = null;
  onSystemChange = null;
}

function paint(preference: string) {
  const prefersDark = window.matchMedia(DARK_QUERY).matches;
  document.documentElement.dataset.theme = resolveTheme(preference, prefersDark);
}

export function applyTheme(theme: string) {
  const preference = isValidTheme(theme) ? theme : DEFAULT_THEME;
  localStorage.setItem(THEME_STORAGE_KEY, preference);

  unsubscribe();
  if (preference === 'system') {
    darkQuery = window.matchMedia(DARK_QUERY);
    onSystemChange = () => paint('system');
    darkQuery.addEventListener('change', onSystemChange);
  }
  paint(preference);
}

/**
 * 첫 칠은 layout.tsx의 인라인 스크립트가 이미 해 뒀다(깜빡임 방지).
 * 여기서는 "시스템" 구독만 다시 걸어 준다.
 */
function ThemeSync() {
  useEffect(() => {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(isValidTheme(cached) ? cached! : DEFAULT_THEME);
    return unsubscribe;
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      {children}
      {/*
        sticky 헤더에 가리지 않도록 헤더 높이만큼 내려서 띄운다.
        richColors는 sonner가 자체 팔레트를 쓰게 만들어 잉크 블랙에서 흰 박스로 튄다 —
        시맨틱 토큰으로 직접 칠한다.
      */}
      <Toaster
        position="top-center"
        offset="calc(var(--header-h) + 8px)"
        toastOptions={{
          classNames: {
            // 내용만큼만 차지하는 작은 알약 — 화면을 가리지 않는다
            toast:
              'w-auto gap-2 rounded-full border border-hairline bg-surface px-3.5 py-2 text-[13px] text-ink shadow-level-2',
            title: 'text-ink',
            description: 'text-ink-muted',
            actionButton:
              'h-7 shrink-0 rounded-full bg-accent px-2.5 text-[12px] font-medium text-accent-ink',
            cancelButton: 'h-7 rounded-full bg-canvas-soft px-2.5 text-[12px] text-ink-muted',
            icon: 'shrink-0 text-ink-muted',
            success: 'text-ink',
            error: 'text-danger',
          },
        }}
      />
    </QueryClientProvider>
  );
}
