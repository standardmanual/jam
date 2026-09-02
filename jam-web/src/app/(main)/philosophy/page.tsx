import TopNav from '@/components/ui/TopNav'

/**
 * 철학 페이지 (티켓 20260901_2125).
 *
 * Footer의 Philosophy 링크로만 진입하는 정적 문서 페이지 — DB/API 의존이 없어
 * 서버 컴포넌트로 두고 원고는 파일 내 상수로 관리한다. 라벨과 달리 장문 원고는
 * i18n(ko.ts)에 넣지 않는다: ko.ts는 짧은 UI 라벨 사전이라 성격이 무너진다.
 *
 * 타이포는 미니멀·장문 읽기용으로 --text-body + --leading-reading(1.75)을 쓴다. --leading-loose
 * (1.6)는 토큰 정의부 주석이 "condition/description blocks" 용도로 못박고 있어 10문단 에세이에는
 * 맞지 않았다(20260901_2125 인터랙션 리뷰). 행간을 올린 만큼 문단 간격도 --spacing-32로 올려
 * "문단 사이 > 한 줄" 비율을 유지한다.
 *
 * 여백은 위에서 아래로 좁아지는 서열을 만든다 — 본문 상단 --spacing-64 > 제목 아래
 * --spacing-48 > 섹션 사이 --spacing-64(섹션 자체가 큰 단락 전환이라 문단 간격보다 크다)
 * > 소제목-본문 간 --spacing-16(제목은 자기 본문에 붙는다) > 문단 사이 --spacing-32.
 * 커버 이미지·태그 등 장식은 두지 않는다.
 *
 * 읽기 폭은 (main)/layout.tsx의 앱 컬럼(max-w-[430px])이 결정한다 — 좌우 패딩을 빼면 최대
 * 398px다. 이 파일에서 별도 max-width를 걸지 않는 이유가 그것이다(42rem을 걸어봐야 발동하지
 * 않는 무효 선언이 된다).
 *
 * 본문은 에세이라 UX 라이팅 해요체 규칙의 적용 대상이 아니며 경어체를 그대로 유지한다.
 *
 * 20260902 티켓 20260902_1347: 원고를 Google Docs("260902_JAM! Philosophy") 전문으로 교체.
 * 신규 원고는 문서 아웃라인상 3개 소제목으로 섹션이 나뉘어 있어, 기존 flat한 `PARAGRAPHS: string[]`
 * 구조를 `SECTIONS: { heading?, paragraphs }[]`로 바꿔 소제목(`<h2>`, --text-h4 토큰)을
 * 렌더링할 수 있게 했다. 소제목 전용 신규 토큰은 추가하지 않고 기존 h4 스케일을 그대로 썼다.
 */

const PAGE_TITLE = 'Philosophy'

/** 확정 원고. 임의 수정·윤문 금지 (Google Docs 원문 그대로, 티켓 20260902_1347). */
const SECTIONS: { heading?: string; paragraphs: string[] }[] = [
  {
    paragraphs: [
      '"기록을 속이면 어떻게 되나요?" JAM을 만들며 가장 자주 듣는 질문입니다.',
      '남들이 쉽게 가질 수 없는 것. 모으는 재미는 거기서 나옵니다. 누군가 거짓으로 얻은 배지 하나는 오늘 정직하게 땀 흘린 당신의 가치마저 깎아내립니다.',
      "우리가 속임수를 막는 이유는 단 하나입니다. 누군가를 단속하려는 게 아니라, 당신이 느낄 '모으는 재미'를 지켜주고 싶어서입니다.",
    ],
  },
  {
    heading: '두 가지 약속',
    paragraphs: [
      '속이기 어렵게 만들기보다, 속이고 싶은 마음이 들지 않게 만드는 것.',
      '그리고 거짓된 한 사람을 놓치는 것보다, 정직한 한 사람을 오해하는 것을 더 크게 두려워하는 것.',
      'JAM은 운동과 활동을 직접 재지 않습니다. 손목 위의 시계, 자전거 속도계, 원래 쓰시던 앱이 묵묵히 측정한 기록을 그대로 가져옵니다.',
      '직접 재지 않으니 부풀릴 자리도 없습니다. 손으로 적어 넣은 숫자는 받지 않습니다. 사람의 몸으로 낼 수 없는 속도나 거리는 처음부터 빼고 셉니다.',
    ],
  },
  {
    heading: '의심스러운 계정을 바로 막지 않는 이유',
    paragraphs: [
      '아무리 정교한 시스템도 때로 실수를 합니다. 빌딩 숲 사이에 서 있었다는 이유만으로 억울하게 오해를 받기도 합니다.',
      '속이려던 사람은 막히면 또 다른 길을 찾습니다. 하지만 정직하게 움직인 사람은, 억울하게 막히면 아무 말 없이 앱을 지웁니다. 뭘 잘못했는지도 모른 채로요.',
      '우리가 의심스러운 계정을 바로 차단하지 않는 이유입니다. 겉으로는 평소처럼 작동하되, 탐나는 보상만 조용히 비워둡니다. 꼼수를 쓰던 사람이 다른 꼼수를 찾지 못하도록. 무엇보다, 오해받은 정직한 분이 입을 상처를 줄이기 위해서입니다.',
    ],
  },
  {
    heading: "땀 흘린 끝에 '빈손'은 없습니다",
    paragraphs: [
      "오늘의 움직임을 마치면 무엇이든 하나는 나옵니다. JAM에는 '꽝'이 없습니다.",
      '지치는 날이 있습니다. 나서려니 비가 오고, 뜻대로 몸이 움직이지 않는 날도 있습니다. 그 무거운 몸을 이끌고 끝마쳤을 때 앱마저 빈손을 내민다면, 그 실망은 너무 큽니다. 몸을 움직였다는 사실만으로도 당신은 이미 충분했습니다.',
      '우리가 늘 옳다고 생각하지 않습니다. 거르는 기준은 앞으로도 계속 고쳐나갈 것입니다.',
      '다만 그 기준을 바꿀 때, 우리가 가장 먼저 돌아볼 사람은 이미 정해져 있습니다.',
      '시스템의 실수로 억울하게 오해받은, 정직하게 땀 흘린 한 사람의 마음입니다.',
    ],
  },
]

export default function PhilosophyPage() {
  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={PAGE_TITLE} />

      <article className="px-[var(--spacing-16)] pt-[var(--spacing-64)] pb-[var(--spacing-64)]">
        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-[number:var(--weight-h3)] tracking-[var(--tracking-h3)]">
          {PAGE_TITLE}
        </h1>

        <div className="mt-[var(--spacing-48)] flex flex-col gap-[var(--spacing-64)]">
          {SECTIONS.map((section, i) => (
            <section key={i} className="flex flex-col gap-[var(--spacing-16)]">
              {section.heading && (
                <h2 className="text-[length:var(--text-h4)] leading-[var(--leading-h4)] font-[number:var(--weight-h4)] tracking-[var(--tracking-h4)] [word-break:keep-all]">
                  {section.heading}
                </h2>
              )}
              <div className="flex flex-col gap-[var(--spacing-32)]">
                {section.paragraphs.map((paragraph, j) => (
                  // word-break: keep-all — CSS 기본값에서 한글은 음절 단위로 아무 데서나 끊긴다.
                  // 앱 컬럼이 좁아(한 줄 약 24자) 지정하지 않으면 문단마다 어절이 쪼개진다.
                  // break-words는 공백 없는 긴 덩어리가 폭을 넘을 때만 쓰는 최후 수단.
                  // (NotificationsClient·BadgeRevealCarousel의 선례와 같은 조합)
                  <p
                    key={j}
                    className="text-[length:var(--text-body)] leading-[var(--leading-reading)] text-text/90 [word-break:keep-all] break-words"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
