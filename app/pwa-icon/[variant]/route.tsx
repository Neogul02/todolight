import { ImageResponse } from 'next/og';
import { AppIconMark } from '@/lib/app-icon';

/**
 * manifest가 가리키는 PWA 아이콘.
 *
 * app/icon.tsx는 Next가 해시 붙은 URL로 서빙해서 manifest에서 주소를 알 수 없다.
 * 그래서 고정 주소가 필요한 쪽만 여기서 따로 그린다.
 *
 * maskable은 런처가 원·둥근 사각형 등으로 잘라 내므로 안쪽 80%만 안전하다 —
 * 마크를 작게 그려 잘려 나가지 않게 한다.
 */
const VARIANTS = {
  '192': { size: 192, markRatio: 0.56 },
  '512': { size: 512, markRatio: 0.56 },
  maskable: { size: 512, markRatio: 0.4 },
} as const;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map(variant => ({ variant }));
}

export async function GET(_request: Request, ctx: { params: Promise<{ variant: string }> }) {
  const { variant } = await ctx.params;
  const config = VARIANTS[variant as keyof typeof VARIANTS];
  if (!config) return new Response('Not found', { status: 404 });

  return new ImageResponse(<AppIconMark size={config.size} markRatio={config.markRatio} />, {
    width: config.size,
    height: config.size,
  });
}
