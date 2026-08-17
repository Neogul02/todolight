'use client';

import { useEffect } from 'react';

/*
  같이하기로 참여한 할 일은 주인 컬럼과 참여자 컬럼(들)에 각각 별도의 TodoCard로
  동시에 렌더링된다(BoardClient.tsx의 todosByOwner). 펼침 상태(openTodoId)는 보드
  전체에서 하나뿐이라 이런 할 일을 열면 두 인스턴스가 동시에 open=true가 된다.

  이때 한쪽 인스턴스 안(메모 입력창, 같이하기 버튼 등)을 클릭하면 그 클릭은 **다른
  인스턴스의 DOM에는 속하지 않으므로** 그 인스턴스 입장에서는 "바깥 클릭"이라 즉시
  onOutside를 불러 카드를 닫아 버린다 — 같은 할 일의 두 인스턴스가 공유하는 상태라
  한쪽이 닫히면 둘 다 닫힌다. 메모를 쓰려고 입력창을 누르는 순간 카드 전체가
  접혀버리는 게 이 경로다.

  그래서 "바깥"의 기준을 이 인스턴스의 DOM 하나가 아니라, 같은 할 일 id로 지금 열려
  있는 모든 인스턴스의 DOM 합집합으로 넓힌다 — 형제 인스턴스 안을 클릭한 것도 "안"으로 친다.
*/
const openNodesByGroup = new Map<string, Set<HTMLElement>>();

function isInsideGroup(groupId: string, target: Node): boolean {
  const nodes = openNodesByGroup.get(groupId);
  if (!nodes) return false;
  for (const node of nodes) {
    if (node.contains(target)) return true;
  }
  return false;
}

/**
 * 지금 열려 있는 동안 이 요소를 groupId(할 일 id) 아래에 등록한다.
 * 같은 groupId로 동시에 열린 다른 인스턴스가 이 요소 안 클릭을 "바깥"으로 오인하지 않게 한다.
 */
export function useOutsideClickGroup(
  ref: React.RefObject<HTMLElement | null>,
  groupId: string,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const nodes = openNodesByGroup.get(groupId) ?? new Set<HTMLElement>();
    nodes.add(el);
    openNodesByGroup.set(groupId, nodes);

    return () => {
      nodes.delete(el);
      if (nodes.size === 0) openNodesByGroup.delete(groupId);
    };
  }, [ref, groupId, active]);
}

/**
 * ref가 가리키는 요소 바깥을 클릭하면 onOutside를 부른다.
 * enabled가 false면 리스너를 아예 붙이지 않는다(예: 카드가 닫혀 있을 땐 검사할 필요가 없다).
 *
 * mousedown 기준으로 판정한다 — React의 onClick(사실상 mouseup 기반 합성 이벤트)보다
 * 먼저 발생하므로, 다른 카드 제목을 클릭한 경우 "바깥 클릭으로 닫힘" → "그 클릭의 onClick으로
 * 새 카드 열림" 순서가 자연스럽게 이어진다(레이스 없음).
 *
 * groupId를 주면 "바깥"의 기준이 이 ref 하나가 아니라 같은 groupId로 등록된(같은 할 일을
 * 그리는 형제 인스턴스 포함) 모든 요소로 넓어진다 — useOutsideClickGroup 참고.
 */
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
  groupId?: string
) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Node;
      if (el.contains(target)) return;
      if (groupId && isInsideGroup(groupId, target)) return;
      onOutside();
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [ref, onOutside, enabled, groupId]);
}
