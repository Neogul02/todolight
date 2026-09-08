/**
 * 보드·달력 쿼리 키. 원래 각자의 훅 파일('use client')에 있었는데,
 * board/page.tsx(서버 컴포넌트)가 서버에서 같은 키로 prefetch하려면 클라이언트 전용
 * 모듈을 거치지 않고 값만 가져올 곳이 필요해서 여기로 옮겼다.
 */
export const boardKeys = {
  todos: (orgId: string) => ['todos', orgId] as const,
  members: (orgId: string) => ['members', orgId] as const,
  /**
   * 주인별 완료 할 일 **총** 개수.
   *
   * 할 일 조회와 같은 응답에서 나오지만 캐시는 따로 둔다 — `todos` 캐시는 `Todo[]`여야
   * 하기 때문이다. 실시간 병합(`useBoardRealtime`)과 낙관적 반영(`useTodoMutations`)이
   * 전부 그 배열을 직접 주무르고 있어서, 거기에 개수를 얹어 객체로 바꾸면 그 두 곳이
   * 통째로 흔들린다. 값 하나 때문에 앱에서 제일 예민한 코드를 건드릴 이유가 없다.
   */
  doneTotals: (orgId: string) => ['done-totals', orgId] as const,
};

export const eventKeys = {
  all: (orgId: string) => ['org-events', orgId] as const,
};
