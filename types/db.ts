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
}
