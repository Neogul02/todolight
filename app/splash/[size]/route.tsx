import { ImageResponse } from 'next/og';
import { AppSplashMark } from '@/lib/app-icon';
import { SPLASH_SCREENS, splashSlug } from '@/lib/splash-screens';

/**
 * iOS 실행 화면(스플래시) 이미지.
 *
 * `[size]`는 `1179x2556` 또는 `1179x2556-dark` 꼴이다. 목록과 media 조건은
 * `lib/splash-screens.ts`가 갖고, `app/layout.tsx`의 link 태그가 같은 목록을 돌며 건다 —
 * 기기를 하나 추가할 때 손댈 곳이 목록 한 군데뿐이게 하려는 것이다.
 *
 * **generateStaticParams로 빌드 때 미리 그린다.** iOS는 앱을 켜는 바로 그 순간 이 이미지를
 * 가져가므로, 요청마다 그리면 흰 화면을 없애려고 만든 그림이 오히려 흰 화면을 늘린다.
 */
export function generateStaticParams() {
  return SPLASH_SCREENS.flatMap(screen =>
    [false, true].map(dark => ({ size: splashSlug(screen, dark) }))
  );
}

/** `1179x2556-dark` → { width, height, dark } */
function parse(size: string): { width: number; height: number; dark: boolean } | null {
  const match = /^(\d+)x(\d+)(-dark)?$/.exec(size);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]), dark: Boolean(match[3]) };
}

export async function GET(_request: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const parsed = parse(size);
  // 목록에 없는 크기는 그리지 않는다 — 주소를 지어내 임의 크기 이미지를 뽑아 가는 길을 막는다
  const known = parsed && generateStaticParams().some(p => p.size === size);
  if (!parsed || !known) return new Response('Not found', { status: 404 });

  return new ImageResponse(
    <AppSplashMark width={parsed.width} height={parsed.height} dark={parsed.dark} />,
    { width: parsed.width, height: parsed.height }
  );
}
