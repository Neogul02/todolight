import type { Locale } from '@/lib/locales';

/**
 * 이용약관과 개인정보 처리방침의 본문.
 *
 * **`messages/*.json`에 넣지 않는다.** 저기는 버튼·라벨처럼 짧은 조각을 담는 곳이고,
 * 이건 문단으로 읽고 문단으로 고치는 글이다. JSON에 넣으면 한 문장 고치려고 이스케이프된
 * 한 줄을 헤집게 되고, 무엇보다 **두 언어의 문단이 1:1로 붙어 있어야** 한쪽만 고치는
 * 사고가 안 난다.
 *
 * 이 글이 있어야 하는 이유는 두 가지다:
 * - App Store 심사 제출에 **개인정보 처리방침 URL이 필수**다(App Store Connect 필수 입력).
 * - 앱 안에서도 닿을 수 있어야 한다 — 가입 화면에만 두면 이미 쓰고 있는 사람은 다시 볼
 *   길이 없다. `/me`의 「약관」 카드와 랜딩 푸터 둘 다에서 연다.
 *
 * ⚠️ **이건 초안이다.** 관할 법률과 사업자 정보는 여기서 알 수 없다.
 * 사업자로 운영한다면 상호·주소·개인정보 보호책임자를 §연락처에 추가할 것.
 */

/**
 * 문의처.
 *
 * **기본값을 코드에 둔다.** 환경 변수로만 두면 Vercel에 값을 안 넣은 채 배포됐을 때
 * 개인정보 처리방침에 "(문의처 미설정)"이 그대로 뜬다 — 하필 App Store 심사자가 계정도
 * 없이 열어 보는 페이지다. 운영자가 바꾸고 싶으면 환경 변수로 덮는다.
 */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'neogul02@icloud.com';

/** 본문을 마지막으로 고친 날. 문서를 고치면 **반드시 같이 올린다** */
export const LEGAL_UPDATED = '2026-09-08';

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = Record<Locale, LegalSection[]>;

const contact = () => CONTACT_EMAIL;

export const TERMS: LegalDoc = {
  ko: [
    {
      heading: '1. 이 약관은 무엇인가요',
      body: [
        'todolight(이하 "서비스")는 팀이 서로의 할 일을 한 화면에서 보고 대신 처리할 수 있게 하는 공유 투두 보드입니다. 이 약관은 서비스를 쓰는 사람과 운영자 사이의 약속을 적은 것이고, 회원가입을 하면 이 약관에 동의한 것으로 봅니다.',
      ],
    },
    {
      heading: '2. 계정',
      body: [
        '계정은 이메일과 비밀번호로 만듭니다. 계정 정보를 안전하게 관리할 책임은 본인에게 있고, 다른 사람과 계정을 함께 쓰지 말아 주세요.',
        '만 14세 미만은 서비스를 이용할 수 없습니다.',
        '계정은 언제든지 앱 안의 설정 → 계정 삭제에서 직접 지울 수 있습니다. 삭제하면 로그인 정보와 이름·이메일·프로필 사진이 지워지고 되돌릴 수 없습니다.',
      ],
    },
    {
      heading: '3. 조직과 공유',
      body: [
        '서비스의 핵심은 공유입니다. 같은 조직의 멤버는 서로의 할 일 목록, 메모, 일정, 가계부 기록을 볼 수 있고 서로의 할 일을 대신 처리할 수 있습니다. 조직에 참여하는 것은 그 사람들에게 내가 적은 내용을 보여 주기로 하는 것입니다.',
        '보여 주고 싶지 않은 내용은 적지 말아 주세요. 특히 비밀번호, 카드 번호, 주민등록번호 같은 것은 어떤 칸에도 넣지 마세요.',
        '조직의 방장은 멤버를 초대하고 내보낼 수 있으며, 조직 이름·아이콘·Discord 알림 설정을 바꿀 수 있습니다.',
      ],
    },
    {
      heading: '4. 하면 안 되는 것',
      body: [
        '법을 어기는 데 쓰거나, 남의 계정에 무단으로 접근하거나, 서비스를 방해할 목적으로 비정상적인 요청을 보내는 행위를 금지합니다.',
        '다른 사람의 권리를 침해하는 내용(저작권 침해물, 명예훼손, 괴롭힘)을 올리지 말아 주세요.',
        '이런 행위가 확인되면 사전 통지 없이 계정 이용을 제한할 수 있습니다.',
      ],
    },
    {
      heading: '5. 내가 적은 내용',
      body: [
        '할 일, 메모, 일정, 가계부 기록의 권리는 적은 사람에게 있습니다. 운영자는 서비스를 제공하고 백업하는 데 필요한 범위에서만 이 내용을 저장·처리합니다.',
        '다만 같은 조직 멤버에게는 서비스의 성격상 공개되며, 내가 조직을 나가거나 계정을 삭제해도 팀에 남긴 기록은 이름 없이 조직에 남습니다. 팀의 장부와 기록이 한 사람이 나갔다고 바뀌면 안 되기 때문입니다.',
      ],
    },
    {
      heading: '6. 서비스의 변경과 중단',
      body: [
        '서비스는 개인이 만들어 운영하는 프로젝트입니다. 기능이 바뀌거나 서비스가 중단될 수 있고, 중요한 변경은 미리 알리도록 노력하겠습니다.',
        '서비스는 "있는 그대로" 제공됩니다. 무료로 제공되는 범위에서는 데이터 손실·중단으로 인한 손해에 대해 법이 허용하는 최대한도로 책임을 지지 않습니다. 중요한 자료는 따로 보관해 주세요.',
      ],
    },
    {
      heading: '7. 약관의 변경',
      body: [
        '약관이 바뀌면 이 페이지의 본문과 최종 수정일을 갱신합니다. 변경 이후에도 서비스를 계속 이용하면 바뀐 약관에 동의한 것으로 봅니다.',
      ],
    },
    {
      heading: '8. 연락처',
      body: [`문의: ${contact()}`],
    },
  ],
  en: [
    {
      heading: '1. About these terms',
      body: [
        'todolight ("the Service") is a shared todo board that lets a team see each other’s tasks on one screen and take care of them for one another. These terms describe the agreement between you and the operator of the Service. By creating an account you agree to them.',
      ],
    },
    {
      heading: '2. Your account',
      body: [
        'Accounts are created with an email address and a password. You are responsible for keeping your credentials safe; please do not share an account with other people.',
        'The Service is not available to anyone under 14 years of age.',
        'You can delete your account at any time from Settings → Delete account inside the app. Deleting removes your sign-in details, name, email, and profile photo, and cannot be undone.',
      ],
    },
    {
      heading: '3. Organizations and sharing',
      body: [
        'Sharing is the point of the Service. Members of the same organization can see each other’s todos, notes, events, and ledger entries, and can complete each other’s tasks. Joining an organization means agreeing to show those people what you write.',
        'Do not write anything you would not want them to see. In particular, never enter passwords, card numbers, or government identification numbers into any field.',
        'An organization owner can invite and remove members and can change the organization’s name, icon, and Discord notification settings.',
      ],
    },
    {
      heading: '4. What you may not do',
      body: [
        'Do not use the Service to break the law, access other people’s accounts without permission, or send abnormal traffic intended to disrupt it.',
        'Do not post content that infringes other people’s rights, including copyright infringement, defamation, or harassment.',
        'Accounts found doing these things may be restricted without prior notice.',
      ],
    },
    {
      heading: '5. Your content',
      body: [
        'You keep the rights to the todos, notes, events, and ledger entries you write. The operator stores and processes them only as far as is needed to run and back up the Service.',
        'They are, by design, visible to the other members of your organization. If you leave an organization or delete your account, what you left with the team stays in the organization without your name attached — a team’s records should not change because one person left.',
      ],
    },
    {
      heading: '6. Changes and interruptions',
      body: [
        'The Service is an individually operated project. Features may change and the Service may be discontinued; we will make an effort to announce significant changes in advance.',
        'The Service is provided "as is". To the maximum extent permitted by law, and for the parts provided free of charge, the operator is not liable for damages arising from data loss or interruption. Please keep your own copy of anything important.',
      ],
    },
    {
      heading: '7. Changes to these terms',
      body: [
        'If these terms change, this page and its last-updated date are updated. Continuing to use the Service after a change means you accept the updated terms.',
      ],
    },
    {
      heading: '8. Contact',
      body: [`Contact: ${contact()}`],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  ko: [
    {
      heading: '1. 어떤 정보를 모으나요',
      body: [
        '계정 정보 — 이메일 주소, 비밀번호(암호화되어 저장되며 운영자도 원문을 볼 수 없습니다), 가입 시각.',
        '프로필 — 팀원에게 보일 이름, 프로필 사진(올린 경우), 테마·언어·화면 표시 설정.',
        '서비스 이용 내용 — 할 일과 그 상태·마감일, 메모, 일정, 가계부 기록(금액·항목·쓴 날), 조직과 멤버 관계, 초대 이메일 주소.',
        '별도의 광고 식별자나 위치 정보, 연락처 목록은 수집하지 않습니다. 광고를 붙이지 않고, 제3자 분석 도구도 쓰지 않습니다.',
      ],
    },
    {
      heading: '2. 무엇에 쓰나요',
      body: [
        '로그인과 본인 확인, 조직 안에서 누구의 할 일인지 구분하기, 팀원에게 초대장을 띄우기, 서비스 오류를 확인하고 고치기 — 이 네 가지가 전부입니다.',
        '모은 정보를 광고에 쓰거나 제3자에게 판매하지 않습니다.',
      ],
    },
    {
      heading: '3. 누구에게 보이나요',
      body: [
        '같은 조직의 멤버 — 이름, 프로필 사진, 그리고 그 조직에 적은 할 일·메모·일정·가계부 기록이 보입니다. 서비스의 목적 자체가 이 공유입니다.',
        '조직에 초대할 때는 초대받는 사람의 이메일 주소가 그 조직의 방장·관리자에게 보입니다.',
        '조직의 방장이 Discord 알림을 설정한 경우, 할 일 추가와 대신 처리 시점에 그 내용(누가·누구에게·무엇을)이 지정된 Discord 채널로 전송됩니다. 이 설정은 방장이 끌 수 있습니다.',
      ],
    },
    {
      heading: '4. 어디에 보관하나요',
      body: [
        '데이터베이스·인증·파일 저장은 Supabase(서울 리전, ap-northeast-2)를 씁니다. 애플리케이션 호스팅은 Vercel을 씁니다. 두 곳 모두 서비스 제공에 필요한 범위에서 데이터를 처리하는 수탁자입니다.',
        '프로필 사진과 조직 아이콘은 공개 URL로 저장됩니다 — 주소를 아는 사람은 볼 수 있으니, 남에게 보여도 괜찮은 사진만 올려 주세요.',
      ],
    },
    {
      heading: '5. 얼마나 보관하나요',
      body: [
        '계정이 살아 있는 동안 보관합니다.',
        '할 일·일정·가계부의 "지우기"는 되돌릴 수 있도록 표시만 하는 방식(소프트 삭제)이라, 지운 뒤에도 행 자체는 데이터베이스에 남습니다. 화면에는 더 이상 보이지 않습니다.',
        '계정을 삭제하면 로그인 정보(이메일·비밀번호)와 이름·프로필 사진이 지워지고 다시 로그인할 수 없습니다. 팀에 남긴 할 일·메모·가계부 기록은 이름 없이 조직에 남습니다 — 팀의 기록이 한 사람이 나갔다고 바뀌면 안 되기 때문입니다. 이 기록까지 지워야 한다면 아래 연락처로 알려 주세요.',
      ],
    },
    {
      heading: '6. 내 권리',
      body: [
        '언제든지 앱 안에서 프로필을 고치고, 조직에서 나가고, 설정 → 계정 삭제로 계정을 지울 수 있습니다.',
        '내 정보의 열람·정정·삭제·처리 정지를 요구할 수 있고, 요청은 아래 연락처로 받습니다.',
      ],
    },
    {
      heading: '7. 어린이',
      body: ['만 14세 미만의 개인정보를 의도적으로 수집하지 않습니다.'],
    },
    {
      heading: '8. 방침의 변경',
      body: [
        '이 방침이 바뀌면 이 페이지의 본문과 최종 수정일을 갱신합니다. 중요한 변경은 앱 안에서 따로 알리겠습니다.',
      ],
    },
    {
      heading: '9. 연락처',
      body: [`개인정보 관련 문의: ${contact()}`],
    },
  ],
  en: [
    {
      heading: '1. What we collect',
      body: [
        'Account details — your email address, your password (stored hashed; the operator cannot read it), and when you signed up.',
        'Profile — the name your teammates see, a profile photo if you upload one, and your theme, language, and display preferences.',
        'Your use of the Service — todos with their status and due dates, notes, events, ledger entries (amount, title, date spent), organization membership, and the email addresses used for invitations.',
        'We do not collect advertising identifiers, location, or your contacts. There are no ads and no third-party analytics.',
      ],
    },
    {
      heading: '2. What we use it for',
      body: [
        'Signing you in, telling whose todo is whose inside an organization, showing invitations to the people they were sent to, and diagnosing and fixing errors. That is all.',
        'We do not use this information for advertising and we do not sell it to third parties.',
      ],
    },
    {
      heading: '3. Who can see it',
      body: [
        'Members of your organization see your name, your profile photo, and the todos, notes, events, and ledger entries you wrote in that organization. This sharing is the purpose of the Service.',
        'When you invite someone, their email address is visible to that organization’s owner and admins.',
        'If an organization owner has configured Discord notifications, adding a todo or completing one on someone’s behalf sends that event (who, for whom, and what) to the configured Discord channel. The owner can turn this off.',
      ],
    },
    {
      heading: '4. Where it is stored',
      body: [
        'The database, authentication, and file storage run on Supabase (Seoul region, ap-northeast-2). The application is hosted on Vercel. Both process data on our behalf only as needed to run the Service.',
        'Profile photos and organization icons are stored at public URLs — anyone with the address can view them, so please only upload images you are comfortable sharing.',
      ],
    },
    {
      heading: '5. How long it is kept',
      body: [
        'For as long as your account exists.',
        'Deleting a todo, event, or ledger entry marks it deleted so it can be undone (a soft delete); the row remains in the database but is no longer shown anywhere in the app.',
        'Deleting your account removes your sign-in details, name, and profile photo, and you can no longer sign in. Todos, notes, and ledger entries you left with a team remain in that organization without your name attached — a team’s records should not change because one person left. If you need those removed as well, contact us at the address below.',
      ],
    },
    {
      heading: '6. Your rights',
      body: [
        'You can edit your profile, leave an organization, and delete your account from Settings → Delete account at any time.',
        'You may request access to, correction of, deletion of, or a halt to the processing of your personal data, using the contact address below.',
      ],
    },
    {
      heading: '7. Children',
      body: ['We do not knowingly collect personal information from anyone under 14 years of age.'],
    },
    {
      heading: '8. Changes to this policy',
      body: [
        'If this policy changes, this page and its last-updated date are updated. Significant changes will also be announced inside the app.',
      ],
    },
    {
      heading: '9. Contact',
      body: [`Privacy enquiries: ${contact()}`],
    },
  ],
};
