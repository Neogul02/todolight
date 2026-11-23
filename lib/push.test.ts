import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }));
const { pushText, rangeText } = await import('./push');

// 사용자와 확정한 문구 표(15종) 그대로인지
describe('pushText', () => {
  const p = { actor: '진우', title: '거래처 견적서 보내기', org: 'Hiyori Sando' };
  it('남이 내 할 일을 건드릴 때', () => {
    expect(pushText('requested', { ...p, due: '2026-11-25' }, 'ko')).toEqual({
      title: '진우님이 할 일을 부탁했어요',
      body: '거래처 견적서 보내기 · 11월 25일 마감',
    });
    expect(pushText('given', { ...p, note: '이거 좀 부탁해요' }, 'ko').body).toBe('거래처 견적서 보내기 "이거 좀 부탁해요"');
    expect(pushText('handled', p, 'ko').title).toBe('진우님이 내 할 일을 끝냈어요');
    expect(pushText('noted', { ...p, note: '금액 확인 필요해요' }, 'ko').body).toBe('거래처 견적서 보내기: 금액 확인 필요해요');
    expect(pushText('requestDone', p, 'ko').title).toBe('진우님이 부탁한 일을 끝냈어요');
  });
  it('조직 소식과 나에게 오는 것', () => {
    expect(pushText('eventNew', { title: '강남 신세계 팝업', range: rangeText('2026-11-05', '2026-11-12') }, 'ko')).toEqual({
      title: '새 일정이 생겼어요',
      body: '강남 신세계 팝업 · 11/5~11/12',
    });
    expect(pushText('invited', { actor: '진형', org: 'Hiyori Sando' }, 'ko').title).toBe('Hiyori Sando에 초대받았어요');
    expect(pushText('digest', { title: '견적서', count: 3 }, 'ko')).toEqual({ title: '오늘 마감 3개', body: '견적서 외 2개' });
    expect(pushText('digest', { title: '견적서', count: 1 }, 'en')).toEqual({ title: '1 due today', body: '견적서' });
  });
});
