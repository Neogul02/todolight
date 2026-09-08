import { apiRoute } from '@/lib/api-v1';
import { fetchMyProfile } from '@/app/actions/profile';

// 본문이 필요 없는 조회도 POST다 — /api/v1 전체를 한 모양으로 두면 Swift 쪽 클라이언트가
// 메서드 분기 없이 한 함수로 끝난다.
export const POST = apiRoute<Record<string, never>>(() => fetchMyProfile());
