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
  /*
    오래 쉬었다 다시 들어오면(모바일 백그라운드 장시간 후 재진입) 서버리스 콜드 스타트와
    Supabase 커넥션 풀러가 겹쳐 이 첫 조회가 일시적으로 실패하는 경우가 있었다.
    실패를 곧장 빈 배열로 떨어뜨리면 조직이 있는데도 "조직이 없다" 화면이 한 번 번쩍인다 —
    한 번 더 시도해서 진짜로 조직이 없는 경우와 구분한다.
  */
  let orgs = orgsRes.success ? orgsRes.data : null;
  if (orgs === null) {
    const retryRes = await fetchMyOrgs();
    orgs = retryRes.success ? retryRes.data : [];
  }
  const profile = profileRes.success ? profileRes.data : null;

  return (
    <AppShell userId={userId} email={email} orgs={orgs} profile={profile}>
      {children}
    </AppShell>
  );
}
