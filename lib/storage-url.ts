/**
 * 아바타·조직 아이콘 URL이 실제로 우리 Storage의 해당 버킷·경로를 가리키는지 확인한다.
 *
 * updateMyProfile/updateOrgImage는 클라이언트가 업로드를 마친 뒤 그 결과 URL만 받아서
 * DB에 저장한다(lib/image-upload.ts 참고) — 검증 없이 그대로 받으면 조직 멤버 아무나
 * 자기 아바타·조직 아이콘을 임의 외부 URL로 바꿀 수 있고, 그 값은 <img src>로 검증 없이
 * 그려지므로 같은 조직의 다른 멤버 전원이 보드를 열 때마다 그 URL로 요청을 보내게 된다
 * (IP·접속 시각을 추적하는 트래킹 픽셀이 된다). null(사진 지우기)은 이 함수로 걸러지지
 * 않으니 호출부에서 따로 허용해야 한다.
 */
export function isOwnStorageUrl(url: string, bucket: string, pathPrefix: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    const target = new URL(url);
    const base = new URL(supabaseUrl);
    if (target.origin !== base.origin) return false;
    return target.pathname.startsWith(`/storage/v1/object/public/${bucket}/${pathPrefix}`);
  } catch {
    return false;
  }
}
