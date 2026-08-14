import { redirect } from 'next/navigation';
import { fetchMyOrgs } from '@/app/actions/orgs';
import { fetchMyProfile } from '@/app/actions/profile';
import { getAuthUser } from '@/app/actions/_base';
import AppShell from './AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const [orgsRes, profileRes] = await Promise.all([fetchMyOrgs(), fetchMyProfile()]);
  const orgs = orgsRes.success ? orgsRes.data : [];
  const profile = profileRes.success ? profileRes.data : null;

  return (
    <AppShell userId={user.id} email={user.email} orgs={orgs} profile={profile}>
      {children}
    </AppShell>
  );
}
