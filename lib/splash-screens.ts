/**
 * iOS 홈 화면 앱의 실행 화면(스플래시) 목록.
 *
 * 홈 화면 바로가기로 열면 첫 페인트까지 **흰 판**이 뜬다. Android는 manifest의
 * `background_color`와 아이콘으로 알아서 그려 주지만, **iOS는 `apple-touch-startup-image`가
 * 없으면 그냥 흰 화면**이다. 게다가 기기 크기가 정확히 맞는 이미지가 있어야 쓰고,
 * 하나라도 어긋나면 다시 흰 화면으로 떨어진다 — 그래서 기기별로 다 적어 둔다.
 *
 * 값은 **CSS 픽셀 기준 세로 크기**와 배율이다. 실제 이미지 크기는 둘을 곱한 값이고
 * `app/splash/[size]/route.tsx`가 그 크기로 그린다. manifest가 `orientation: portrait`라
 * 가로 방향은 적지 않는다(적으면 개수가 두 배가 된다).
 *
 * 기기가 새로 나오면 여기에 한 줄 추가하면 된다 — 이미지는 빌드 때 자동으로 생긴다.
 */
export type SplashScreen = {
  /** CSS 픽셀 폭 */
  width: number;
  /** CSS 픽셀 높이 */
  height: number;
  /** 배율(-webkit-device-pixel-ratio) */
  ratio: number;
  /** 어떤 기기가 이 크기를 쓰는지 — 목록을 손볼 때 판단 근거가 된다 */
  devices: string;
};

export const SPLASH_SCREENS: SplashScreen[] = [
  { width: 440, height: 956, ratio: 3, devices: '16 Pro Max' },
  { width: 430, height: 932, ratio: 3, devices: '16 Plus · 15 Pro Max · 15 Plus · 14 Pro Max' },
  { width: 402, height: 874, ratio: 3, devices: '16 Pro' },
  { width: 393, height: 852, ratio: 3, devices: '16 · 15 Pro · 15 · 14 Pro' },
  { width: 428, height: 926, ratio: 3, devices: '14 Plus · 13 Pro Max · 12 Pro Max' },
  { width: 390, height: 844, ratio: 3, devices: '14 · 13 Pro · 13 · 12 Pro · 12' },
  { width: 375, height: 812, ratio: 3, devices: '13 mini · 12 mini · 11 Pro · XS · X' },
  { width: 414, height: 896, ratio: 3, devices: '11 Pro Max · XS Max' },
  { width: 414, height: 896, ratio: 2, devices: '11 · XR' },
  { width: 414, height: 736, ratio: 3, devices: '8 Plus · 7 Plus' },
  { width: 375, height: 667, ratio: 2, devices: 'SE(2·3세대) · 8 · 7 · 6s' },
];

/** 라우트 파라미터 겸 파일 이름. 예: `1179x2556` / `1179x2556-dark` */
export function splashSlug(screen: SplashScreen, dark: boolean): string {
  return `${screen.width * screen.ratio}x${screen.height * screen.ratio}${dark ? '-dark' : ''}`;
}

/**
 * iOS가 이 이미지를 고를 조건.
 *
 * 밝기까지 조건에 넣어 한 기기에 밝은 것·어두운 것 두 장을 걸어 둔다 —
 * 어두운 테마를 쓰는 사람에게 흰 판이 번쩍이는 게 이 작업의 본래 목적이라,
 * 밝은 쪽에도 `(prefers-color-scheme: light)`를 명시해 둘이 동시에 맞는 일이 없게 한다.
 *
 * 앱 안에서 고른 테마(Solarized 등)가 아니라 **기기 설정**을 따른다 —
 * 스플래시는 앱 코드가 실행되기 전에 뜨는 그림이라 그때는 저장된 테마를 알 길이 없다.
 */
export function splashMedia(screen: SplashScreen, dark: boolean): string {
  return [
    `(prefers-color-scheme: ${dark ? 'dark' : 'light'})`,
    `(device-width: ${screen.width}px)`,
    `(device-height: ${screen.height}px)`,
    `(-webkit-device-pixel-ratio: ${screen.ratio})`,
    '(orientation: portrait)',
  ].join(' and ');
}
