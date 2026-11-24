import { BACKGROUND, INK, MARK_PATH, MARK_STROKE } from '@/lib/app-icon';
import { cn } from '@/lib/utils';

/**
 * 화면 안의 todolight 로고 — 홈 화면 아이콘과 **같은 그림**(흰 판 위 검은 삼각형)이다.
 *
 * 테마 토큰을 쓰지 않는 유일한 컴포넌트다. 로고는 앱 아이콘을 그대로 보여 주는 것이라
 * 어두운 테마에서도 흰 판이어야 홈 화면에서 본 그 아이콘으로 알아본다.
 * 판 가장자리는 hairline 테두리로만 둔다 — 밝은 테마에서 흰 판이 배경에 녹지 않게.
 */
export function LogoMark({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-hairline',
        className
      )}
      style={{ width: size, height: size, borderRadius: size * 0.225, background: BACKGROUND }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 100 100" fill="none">
        <path
          d={MARK_PATH}
          fill={INK}
          stroke={INK}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
