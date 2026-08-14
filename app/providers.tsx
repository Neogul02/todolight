'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { DEFAULT_THEME, isValidTheme } from '@/lib/themes';

const THEME_STORAGE_KEY = 'todolight_theme';

/**
 * 저장된 테마를 <html data-theme>에 붙인다.
 * 프로필에서 읽어오기 전 깜빡임을 막으려고 localStorage 캐시를 먼저 적용한다.
 */
function ThemeSync() {
  useEffect(() => {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    document.documentElement.dataset.theme = isValidTheme(cached) ? cached! : DEFAULT_THEME;
  }, []);
  return null;
}

export function applyTheme(theme: string) {
  const next = isValidTheme(theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
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
            toast:
              'bg-surface text-ink border border-hairline shadow-level-2 rounded-xl text-[14px]',
            title: 'text-ink',
            description: 'text-ink-muted',
            actionButton: 'bg-accent text-accent-ink rounded-lg px-2.5 h-8 text-[13px] font-medium',
            cancelButton: 'bg-canvas-soft text-ink-muted rounded-lg',
            icon: 'text-ink-muted',
            success: 'text-ink',
            error: 'text-danger',
          },
        }}
      />
    </QueryClientProvider>
  );
}
