import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'TodoLight',
  description: '팀원끼리 서로의 할 일을 한 화면에서 보고, 대신 처리해 주는 공유 투두 보드',
  manifest: '/manifest.json',
  // 홈 화면에 추가했을 때 주소창 없이 앱처럼 열린다 (iOS 우선 타깃)
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'TodoLight' },
  formatDetection: { telephone: false },
};

// viewportFit: cover — 이게 없으면 env(safe-area-inset-*)가 전부 0으로 계산돼
// 홈 인디케이터 회피(pb-safe, board-viewport)가 무효화된다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /*
    입력에 포커스할 때 iOS가 화면을 제멋대로 확대하는 걸 막는다.
    iOS 10부터 Safari는 접근성을 위해 사용자의 핀치 줌은 이 값과 무관하게 늘 허용하므로,
    막히는 건 자동 확대뿐이다. userScalable: false는 쓰지 않는다 — 그건 의도가 다르다.
  */
  maximumScale: 1,
  /* 키보드가 올라오면 뷰포트 자체를 줄여 준다. 콘텐츠가 키보드 뒤로 숨지 않는다 */
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="ink" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
