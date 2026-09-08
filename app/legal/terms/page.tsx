import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TERMS } from '@/lib/legal';
import LegalPage from '../LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return { title: t('terms.title') };
}

export default function TermsPage() {
  return <LegalPage doc={TERMS} titleKey="terms.title" />;
}
