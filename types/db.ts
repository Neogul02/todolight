export type MemberRole = 'owner' | 'admin' | 'member';
export type TodoStatus = 'todo' | 'doing' | 'done';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  avatar_color: string | null;
  /** 업로드한 프로필 사진. 없으면 색 아바타로 떨어진다 */
  avatar_url: string | null;
  theme: string;
  /** 'ko' | 'en' — 기기를 옮겨도 같아야 해서 계정에 붙였다. 매 요청의 1차 출처는 쿠키(lib/locales.ts) */
  locale: string;
  /** 보드에 완료한 할 일도 보일지 — 기기를 옮겨도 같아야 해서 계정에 붙였다 */
  show_done: boolean;
  /** 가계부를 쓸지. 끄면 헤더의 가계부 버튼이 사라진다 */
  show_ledger: boolean;
  /**
   * 조직별로 정한, 보드 캐러셀·대시보드에서 나 다음에 나올 팀원 순서(나를 뺀 user_id 배열).
   * 기기를 옮겨도 같아야 해서 계정에 붙였다. 정한 적 없는 조직은 키 자체가 없다(이름순으로 떨어진다).
   */
  member_order: Record<string, string[]>;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  /** 조직 아이콘. 없으면 이름 첫 글자 + id에서 뽑은 색으로 그린다 */
  image_url: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

/** 보드 컬럼 하나 = 멤버 한 명 */
export interface MemberSummary {
  user_id: string;
  role: MemberRole;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface OrgInvite {
  id: string;
  org_id: string;
  email: string;
  invited_by: string;
  status: InviteStatus;
  created_at: string;
  responded_at: string | null;
  /** 조인해서 채워 넣는 표시용 필드 */
  org_name?: string;
  inviter_name?: string;
}

export interface TodoNote {
  id: string;
  todo_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  author_color?: string | null;
  author_avatar_url?: string | null;
}

export interface Todo {
  id: string;
  org_id: string;
  /** 이 할 일의 주인 — 보드에서 어느 컬럼에 놓일지 결정한다 */
  owner_id: string;
  title: string;
  status: TodoStatus;
  due_date: string | null;
  position: number;
  created_by: string;
  /** 남이 대신 처리한 경우 그 사람의 id (본인 처리면 owner_id와 같음) */
  handled_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** 소프트 삭제 시각 — 값이 있으면 보드에서 감춘다 */
  deleted_at: string | null;
  notes?: TodoNote[];
  /**
   * 같이하기로 참여한 사람들의 id. notes처럼 todo_participants를 조인해서 채우는
   * 필드라 실제 DB 컬럼은 아니다 — fetchOrgTodos가 채워 주고, 상태 변경류 액션은
   * (notes와 마찬가지로) 굳이 다시 채우지 않는다. 읽을 때는 `?? []`로 방어한다.
   */
  participant_ids?: string[];
}

/**
 * 조직 일정. 할 일과 다른 것이다 —
 * 기간을 갖고, 담당자가 없고, 보드에는 뜨지 않는다(달력 전용).
 */
export interface OrgEvent {
  id: string;
  org_id: string;
  title: string;
  /** 색 키. 실제 값은 lib/event-colors.ts */
  color: string;
  start_date: string;
  /** 하루짜리면 start_date와 같다 */
  end_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * 가계부 한 줄. 할 일도 일정도 아니다 —
 * "낸 사람"이 있고, 완료 상태가 없고, 보드에 뜨지 않는다.
 */
export interface LedgerEntry {
  id: string;
  org_id: string;
  /** 돈을 낸 사람. 남 대신 적어 줄 수 있어서 created_by와 다를 수 있다 */
  payer_id: string;
  /** 원 단위 정수 */
  amount: number;
  title: string;
  /** 쓴 날 (YYYY-MM-DD, KST 기준). created_at과 다르다 */
  spent_on: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
