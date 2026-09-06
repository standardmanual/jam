import { d } from '@/lib/i18n'

/**
 * 배지 상세화면 본문의 "획득 조건" 카드 — [20260819_011]
 * activity/poi 변형에 중복돼 있던 마크업을 추출한 순수 리팩터링(렌더링 결과 동일).
 * 어드민 배경 제너레이터 미리보기가 실제 본문과 동일한 카드를 그대로 재사용하기 위해 분리했다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 *
 * 2026-09-06 [20260906_1305]: 안내 «문장»과 조건 «표기»를 두 줄로 나눴다.
 * 한 줄에 섞여 있을 때 어디까지가 조건이고 마지막 숫자가 무엇의 횟수인지 읽히지 않았다.
 *
 * 2026-09-06 [20260906_1412]: 둘을 나란히 두니 **같은 조건이 두 번** 나왔다
 * (「…총 10회 이상 조건을 채우면 획득할 수 있어요.」 + 「…총 10회 이상」).
 * 표기 줄이 사실을 다 담으므로 **표기가 있으면 그것만** 그린다. 문장은 표기할 조건이
 * 없을 때의 폴백으로만 남는다 — 아래 `spec` 주석 참고.
 */
interface BadgeConditionCardProps {
  /**
   * 조건 설명 문구 — 안내 문장. 종결형이다.
   * `spec`이 있으면 그리지 않는다(같은 말을 두 번 하게 된다).
   */
  text: string
  /**
   * 조건 표기 줄(명사구). `formatBadgeConditionSpec()`의 결과를 그대로 받는다.
   * **optional이다** — 표기할 조건이 없으면 넘기지 않거나 `null`을 넘기고,
   * 그러면 `text` 한 줄만 그린다. 그 경로가 실제로 쓰이는 곳:
   * 미션 보상(「'X' 미션을 완료하면…」) · 어드민 수동 발급 · 레지스트리가 모르는 키 ·
   * 체크인 배지(`conditionCheckinBody`) · 어드민 미리보기.
   */
  spec?: string | null
}

export default function BadgeConditionCard({ text, spec }: BadgeConditionCardProps) {
  return (
    <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-2">
      <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.conditionTitle}</p>
      {spec ? (
        /* 카드에 이 줄뿐이라 굵기를 주지 않는다 — 대비할 문장이 없으면 볼드가 근거를 잃는다.
           길어지면 줄바꿈한다. 조건이 잘리면 안 되므로 말줄임(truncate)을 쓰지 않는다. */
        <p className="text-[length:var(--text-small)] text-text leading-[var(--leading-loose)] tabular-nums [word-break:keep-all] break-words">
          {spec}
        </p>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] leading-[var(--leading-loose)]">{text}</p>
      )}
    </div>
  )
}
