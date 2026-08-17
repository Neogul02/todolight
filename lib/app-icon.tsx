/**
 * 파비콘·PWA 아이콘 공통 마크.
 *
 * 예전엔 세 곳(icon.tsx·apple-icon.tsx·pwa-icon route)이 전부 베이지 배경에 검정
 * "Todo" 텍스트를 각자 그렸다 — 16px 탭 파비콘에서는 글자가 뭉개져 아예 안 읽혔고,
 * 세 곳을 따로 고쳐야 해서 하나만 바뀌고 나머지가 뒤처지기 쉬웠다.
 * 텍스트 대신 어느 크기에서도 형태로 알아볼 수 있는 체크마크 하나로 통일한다.
 * 배경은 흰색 하나로 — 작은 탭 파비콘에서는 그라디언트도 그냥 얼룩으로 뭉개져
 * 순백 배경 위 체크 하나가 가장 선명하게 남는다.
 */
const BACKGROUND = '#ffffff';
const INK = '#14120f';

export function AppIconMark({
  size,
  markRatio = 0.56,
}: {
  size: number;
  /** 마크가 전체 캔버스에서 차지하는 비율. maskable은 런처가 가장자리를 잘라내므로 더 작게 준다 */
  markRatio?: number;
}) {
  const mark = size * markRatio;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BACKGROUND,
      }}
    >
      {/* 짧은 팔과 긴 팔의 비대칭 비율을 살짝 조정해 기계적이지 않고 손으로 그린 듯한 체크로 잡았다 */}
      <svg width={mark} height={mark} viewBox="0 0 100 100" fill="none">
        <path
          d="M19 53 L40 75 L83 25"
          stroke={INK}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
