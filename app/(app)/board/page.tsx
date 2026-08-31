import { cookies } from 'next/headers';
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { fetchOrgMembers } from '@/app/actions/orgs';
import { fetchOrgTodos } from '@/app/actions/todos';
import { fetchOrgEvents } from '@/app/actions/events';
import { boardKeys, eventKeys } from '@/lib/query-keys';
import ViewPager from '../ViewPager';

const ACTIVE_ORG_COOKIE = 'todolight_active_org';

/**
 * 보드·달력·가계부가 전부 이 한 라우트에 산다 — 어느 패널을 보여 줄지는 `?view=`가 정하고,
 * 그 값은 AppShell이 읽어 컨텍스트로 내려 준다(app/(app)/ViewPager.tsx 참고).
 *
 * 예전엔 이 페이지가 <ViewPager />만 그렸다 — 그러면 멤버·할 일·일정이 전부 클라이언트
 * useQuery라서 "서버가 조직·프로필 내려줌 → 하이드레이션 → 그제서야 왕복 한 번 더"의
 * 2단 폭포가 생겼다. 달력은 ViewPager가 패널을 처음 열 때만 마운트하기 때문에 그 왕복이
 * 달력을 처음 여는 순간에 그대로 드러나 "단순 조회인데 느리다"로 체감됐다.
 *
 * 여기서 마지막으로 보던 조직(쿠키, hooks/useActiveOrg.ts가 채워 둔다)의 멤버·할 일·일정을
 * 서버에서 미리 읽어 하이드레이션해 둔다 — 클라이언트 훅은 그대로 두고 쿼리 키만 맞추면
 * TanStack Query가 이 캐시를 그대로 쓴다. 가계부는 일부러 뺀다 — 한 번도 안 본 사람에게는
 * 쿼리도 실시간 채널도 안 도는 기존 설계를 지켜야 한다(무겁고 자주 안 쓰는 화면이다).
 */
export default async function BoardPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  // 첫 방문 등 쿠키가 없으면 prefetch를 건너뛴다 — 클라이언트가 평소대로 첫 조직을 불러온다.
  if (!orgId) return <ViewPager />;

  const queryClient = new QueryClient();

  // 하나라도 실패해도(나간 조직을 쿠키가 여전히 가리키는 등) 나머지는 살린다.
  // prefetchQuery를 안 쓰는 이유: 실패를 그대로 캐시에 태우면 클라이언트가 그 에러 상태부터
  // 보게 된다 — 성공한 것만 채우고 실패한 건 그냥 비워서 클라이언트의 평소 로딩 흐름에 맡긴다.
  const [membersRes, todosRes, eventsRes] = await Promise.allSettled([
    fetchOrgMembers(orgId),
    fetchOrgTodos(orgId),
    fetchOrgEvents(orgId),
  ]);

  if (membersRes.status === 'fulfilled' && membersRes.value.success)
    queryClient.setQueryData(boardKeys.members(orgId), membersRes.value.data);
  if (todosRes.status === 'fulfilled' && todosRes.value.success)
    queryClient.setQueryData(boardKeys.todos(orgId), todosRes.value.data);
  if (eventsRes.status === 'fulfilled' && eventsRes.value.success)
    queryClient.setQueryData(eventKeys.all(orgId), eventsRes.value.data);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ViewPager />
    </HydrationBoundary>
  );
}
