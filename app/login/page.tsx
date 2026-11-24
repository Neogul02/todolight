import { LogoMark } from '@/components/LogoMark';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/board');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-10 pb-safe sm:px-6 sm:py-12">
      {/* 이름 대신 로고 하나 — 홈 화면 아이콘과 같은 그림이라 어디에 들어왔는지 바로 안다 */}
      <LogoMark size={56} />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
