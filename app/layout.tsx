import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'todolight — 조직 공유 할 일',
  description: '팀원끼리 서로의 할 일을 한 화면에서 보고, 대신 처리해 주는 공유 투두 보드',
  manifest: '/manifest.json',
  // 홈 화면에 추가했을 때 주소창 없이 앱처럼 열린다 (iOS 우선 타깃)
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'todolight' },
  formatDetection: { telephone: false },
};

// viewportFit: cover — 이게 없으면 env(safe-area-inset-*)가 전부 0으로 계산돼
// 홈 인디케이터 회피(pb-safe, board-viewport)가 무효화된다.
// maximumScale/userScalable은 건드리지 않는다 — 확대를 막으면 접근성이 깨진다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3eee5' },
    { media: '(prefers-color-scheme: dark)', color: '#f3eee5' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="sand" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
