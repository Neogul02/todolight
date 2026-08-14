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
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
