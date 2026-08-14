/**
 * 지금 서버 응답을 기다리는 중인 할 일 id.
 *
 * 실시간 구독은 react-query 밖에서 캐시에 직접 쓰기 때문에 `cancelQueries`가 막아 주지 못한다.
 * 그래서 내 변경이 아직 커밋되기 전에 도착한 남의(혹은 내 이전 요청의) 행 전체가
 * 방금 낙관적으로 바꾼 값을 되돌려 버릴 수 있다 — 체크가 저 혼자 풀리는 증상.
 * 여기 등록된 id는 실시간 병합에서 건너뛰고, 뮤테이션이 끝날 때 invalidate로 맞춘다.
 *
 * 같은 할 일에 여러 요청이 겹칠 수 있으므로 개수를 센다(Set이면 먼저 끝난 쪽이 지워 버린다).
 */
const pending = new Map<string, number>();

export function markTodoPending(id: string): void {
  pending.set(id, (pending.get(id) ?? 0) + 1);
}

export function clearTodoPending(id: string): void {
  const next = (pending.get(id) ?? 0) - 1;
  if (next > 0) pending.set(id, next);
  else pending.delete(id);
}

export function isTodoPending(id: string): boolean {
  return pending.has(id);
}
