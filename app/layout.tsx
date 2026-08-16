import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.json',
    /*
      홈 화면에 추가했을 때 주소창 없이 앱처럼 열린다 (iOS 우선 타깃).
      standalone 상태 바 색은 이 메타 태그 하나로만 정해지고 theme-color 미디어쿼리를
      안 따른다 — 'default'로 고정해 두면 어두운 테마를 쓸 때 상태 바만 흰 띠로 남는다.
      여기 값은 로그인 전 등 아직 테마를 모를 때 쓰는 초기값일 뿐이고, 실제 값은
      아래 <head>의 인라인 스크립트가 저장된 테마를 읽어 첫 페인트 전에 맞춰 덮어쓴다.
    */
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('title') },
    formatDetection: { telephone: false },
  };
}

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101010' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 테마와 달리 로케일은 쿠키로 매 요청마다 서버에서 정해진다(app/../i18n/request.ts) —
  // 텍스트는 SSR된 HTML에 바로 박히므로 클라이언트 스크립트로 사후 교정할 수 없다.
  const locale = await getLocale();

  return (
    <html lang={locale} data-theme="ink" suppressHydrationWarning>
      <head>
        {/*
          첫 페인트 전에 테마를 칠한다. React가 붙은 뒤에 칠하면 다크를 쓰는 사람에게
          흰 화면이 한 번 번쩍인다. 그래서 렌더를 막는 인라인 스크립트로 둔다.

          홈 화면에 추가된 standalone 앱의 상태 바 색도 같이 맞춘다 — iOS는 상태 바 색을
          apple-mobile-web-app-status-bar-style 메타 태그 하나로만 정하고 theme-color
          미디어쿼리를 안 따른다. 이 메타 태그는 정적이라 서버에서는 로그인한 사용자가
          어떤 테마를 저장해 뒀는지 알 수 없으니, 여기서 테마를 정하는 김에 같이 덮어써서
          어두운 테마인데 상태 바만 흰 띠로 남는 걸 막는다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var T=['ink','ink-dark','solarized','nord','dracula'];var DARK=['ink-dark','nord','dracula'];var p=localStorage.getItem('todolight_theme')||'system';var t=T.indexOf(p)>=0?p:(matchMedia('(prefers-color-scheme: dark)').matches?'ink-dark':'ink');document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(m)m.content=DARK.indexOf(t)>=0?'black':'default'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
