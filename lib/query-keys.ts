/**
 * 보드·달력 쿼리 키. 원래 각자의 훅 파일('use client')에 있었는데,
 * board/page.tsx(서버 컴포넌트)가 서버에서 같은 키로 prefetch하려면 클라이언트 전용
 * 모듈을 거치지 않고 값만 가져올 곳이 필요해서 여기로 옮겼다.
 */
export const boardKeys = {
  todos: (orgId: string) => ['todos', orgId] as const,
  members: (orgId: string) => ['members', orgId] as const,
};

export const eventKeys = {
  all: (orgId: string) => ['org-events', orgId] as const,
};
