import { ImageResponse } from 'next/og';

// 홈 화면에 추가했을 때 쓰이는 아이콘. iOS는 SVG 터치 아이콘을 제대로 다루지 않아
// 여기서 PNG로 그려 준다. 배경은 캔버스와 같은 베이지, 글자는 잉크 블랙.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3eee5',
          color: '#14120f',
          fontSize: 60,
          fontWeight: 700,
          // lineHeight를 1로 고정하지 않으면 폰트 메트릭 때문에 글자가 위로 치우친다
          lineHeight: 1,
        }}
      >
        Todo
      </div>
    ),
    size
  );
}
