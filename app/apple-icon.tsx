import { ImageResponse } from 'next/og';
import { AppIconMark } from '@/lib/app-icon';

// 홈 화면에 추가했을 때 쓰이는 아이콘. iOS는 SVG 터치 아이콘을 제대로 다루지 않아
// 여기서 PNG로 그려 준다. iOS가 자체적으로 모서리를 둥글리므로 여기서는 각진 정사각형 그대로 둔다.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<AppIconMark size={size.width} />, size);
}
