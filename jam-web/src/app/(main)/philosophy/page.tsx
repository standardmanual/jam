import TopNav from '@/components/ui/TopNav'

/**
 * 철학 페이지 (티켓 20260901_2125).
 *
 * Footer의 Philosophy 링크로만 진입하는 정적 문서 페이지 — DB/API 의존이 없어
 * 서버 컴포넌트로 두고 원고는 파일 내 상수 배열로 관리한다. 라벨과 달리 장문 원고는
 * i18n(ko.ts)에 넣지 않는다: ko.ts는 짧은 UI 라벨 사전이라 성격이 무너진다.
 *
 * 타이포는 미니멀·장문 읽기용으로 --text-body + --leading-reading(1.75)을 쓴다. --leading-loose
 * (1.6)는 토큰 정의부 주석이 "condition/description blocks" 용도로 못박고 있어 10문단 에세이에는
 * 맞지 않았다(20260901_2125 인터랙션 리뷰). 행간을 올린 만큼 문단 간격도 --spacing-32로 올려
 * "문단 사이 > 한 줄" 비율을 유지한다.
 *
 * 여백은 위에서 아래로 좁아지는 서열을 만든다 — 본문 상단 --spacing-64 > 제목 아래
 * --spacing-48 > 문단 사이 --spacing-32. 제목 위아래가 같으면 제목이 어느 쪽에도 속하지 않고
 * 뜬다. 커버 이미지·태그 등 장식은 두지 않는다.
 *
 * 읽기 폭은 (main)/layout.tsx의 앱 컬럼(max-w-[430px])이 결정한다 — 좌우 패딩을 빼면 최대
 * 398px다. 이 파일에서 별도 max-width를 걸지 않는 이유가 그것이다(42rem을 걸어봐야 발동하지
 * 않는 무효 선언이 된다).
 *
 * 본문은 에세이라 UX 라이팅 해요체 규칙의 적용 대상이 아니며 경어체를 그대로 유지한다.
 */

const PAGE_TITLE = 'Philosophy'

/** 확정 원고. 임의 수정·윤문 금지 (티켓 20260901_2125 컨텐츠 항목). */
const PARAGRAPHS = [
  '운동 기록으로 보상을 주는 서비스는 같은 질문을 받습니다. 기록을 속이면 어떻게 되느냐는 것입니다.',
  '모으는 재미는 아무나 못 갖는 데서 옵니다. 그래서 속여서 얻은 배지 하나는 그 사람 것만 가짜가 되지 않습니다. 같은 배지를 정직하게 모은 분들의 것까지 값어치를 깎습니다.',
  '저희가 속임수를 막는 이유가 여기 있습니다. 단속하려는 게 아니라, 재미를 지키려는 것입니다.',
  '기준은 두 가지입니다. 속이기 어렵게 만들기보다, 속일 마음이 덜 들게 만듭니다. 그리고 속인 사람 하나를 놓치는 것보다, 정직한 한 분을 잘못 막는 쪽을 더 큰 손해로 봅니다.',
  'JAM은 운동을 직접 재지 않습니다. 손목시계나 자전거 속도계, 원래 쓰시던 운동 앱이 잰 기록을 받아옵니다. 저희가 재지 않으니 부풀릴 자리도 없습니다. 손으로 적어 넣은 기록은 아예 받지 않습니다. 사람 다리로는 낼 수 없는 속도, 하루에 갈 수 없는 거리도 빼고 셉니다.',
  '그래도 거르다 보면 실수가 납니다. 건물 안에 있는데 밖에 있는 것으로 잡히기도 합니다. 초기에 그 때문에 아무 잘못 없는 분이 막힌 적이 있습니다.',
  '속이려는 사람은 막히면 다른 길을 찾습니다. 정직한 분은 막히면 앱을 닫습니다. 따지지 않습니다. 그냥 지웁니다. 뭘 잘못했는지도 모른 채로요. 저희는 그분이 떠난 것도 나중에 압니다. 두 사람이 잃는 것은 크기가 다릅니다.',
  '의심스러운 계정을 바로 막지 않는 것도 그래서입니다. 겉으로는 평소처럼 쓰이되, 좋은 보상만 나오지 않게 둡니다. 봐주는 게 아닙니다. 바로 막으면 걸린 걸 알아채고, 다음엔 더 감쪽같이 속입니다. 조용히 두는 편이 낫습니다. 실수로 걸린 분이 겪는 불편도 그만큼 적습니다.',
  '운동을 마치면 무엇이든 하나는 나옵니다. 꽝이 없습니다. 무엇이 나올지는 열어봐야 알지만, 나오느냐 마느냐로 마음 졸이게 하지는 않습니다. 운동은 그것만으로도 사람을 충분히 지치게 합니다. 속도가 안 나는 날이 있고, 나가려니 비가 옵니다. 그 끝에 앱을 열었는데 빈손이면, 그 실망은 저희가 보탠 것입니다.',
  '저희가 늘 옳다고 생각하지는 않습니다. 거르는 기준은 앞으로도 고쳐 나갈 것입니다. 다만 고칠 때 누구를 먼저 볼지는 정해 두었습니다. 잘못 막힌 한 분입니다.',
]

export default function PhilosophyPage() {
  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={PAGE_TITLE} />

      <article className="px-[var(--spacing-16)] pt-[var(--spacing-64)] pb-[var(--spacing-64)]">
        <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-[number:var(--weight-h3)] tracking-[var(--tracking-h3)]">
          {PAGE_TITLE}
        </h1>

        <div className="mt-[var(--spacing-48)] flex flex-col gap-[var(--spacing-32)]">
          {PARAGRAPHS.map((paragraph, i) => (
            // word-break: keep-all — CSS 기본값에서 한글은 음절 단위로 아무 데서나 끊긴다.
            // 앱 컬럼이 좁아(한 줄 약 24자) 지정하지 않으면 문단마다 어절이 쪼개진다.
            // break-words는 공백 없는 긴 덩어리가 폭을 넘을 때만 쓰는 최후 수단.
            // (NotificationsClient·BadgeRevealCarousel의 선례와 같은 조합)
            <p
              key={i}
              className="text-[length:var(--text-body)] leading-[var(--leading-reading)] text-text/90 [word-break:keep-all] break-words"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </div>
  )
}
