import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { fetchMyOrgs } from '@/app/actions/orgs';
import { fetchMyProfile } from '@/app/actions/profile';
import { getAuthUser } from '@/app/actions/_base';
import AppShell from './AppShell';
import AppShellSkeleton from './AppShellSkeleton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getAuthUser()는 쿠키의 JWT를 로컬 검증만 한다 — 네트워크 왕복이 없어 이 정도는 막아도 된다.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  /*
    조직·프로필 조회(fetchMyOrgs·fetchMyProfile)는 Supabase 네트워크 왕복이라 콜드 스타트까지
    겹치면 앱 진입 첫 화면이 1~2초 통째로 흰 화면이었다. 이 부분만 Suspense로 감싸서
    헤더·보드 스켈레톤을 먼저 그리고, 데이터가 도착하면 그 자리에서 실제 화면으로 바뀐다.
  */
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AppShellData userId={user.id} email={user.email}>
        {children}
      </AppShellData>
    </Suspense>
  );
}

async function AppShellData({
  userId,
  email,
  children,
}: {
  userId: string;
  email: string | null;
  children: React.ReactNode;
}) {
  const [orgsRes, profileRes] = await Promise.all([fetchMyOrgs(), fetchMyProfile()]);
  const orgs = orgsRes.success ? orgsRes.data : [];
  const profile = profileRes.success ? profileRes.data : null;

  return (
    <AppShell userId={userId} email={email} orgs={orgs} profile={profile}>
      {children}
    </AppShell>
  );
}
