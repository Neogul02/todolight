import { ImageResponse } from 'next/og';
import { AppIconMark } from '@/lib/app-icon';

/**
 * PWA·브라우저 탭 아이콘.
 * manifest가 가리킬 실제 비트맵이 필요해서 SVG 대신 여기서 그린다 —
 * 안드로이드 런처는 SVG 아이콘을 신뢰하지 않는다.
 */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<AppIconMark size={size.width} />, size);
}
