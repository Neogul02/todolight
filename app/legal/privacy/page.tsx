import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRIVACY } from '@/lib/legal';
import LegalPage from '../LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return { title: t('privacy.title') };
}

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} titleKey="privacy.title" />;
}
