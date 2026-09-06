import { d } from '@/lib/i18n'

/**
 * 배지 상세화면 본문의 "획득 조건" 카드 — [20260819_011]
 * activity/poi 변형에 중복돼 있던 마크업을 추출한 순수 리팩터링(렌더링 결과 동일).
 * 어드민 배경 제너레이터 미리보기가 실제 본문과 동일한 카드를 그대로 재사용하기 위해 분리했다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 *
 * 2026-09-06 [20260906_1305]: 안내 «문장»과 조건 «표기»를 두 줄로 나눴다.
 * 한 줄에 섞여 있을 때 어디까지가 조건이고 마지막 숫자가 무엇의 횟수인지 읽히지 않았다.
 */
interface BadgeConditionCardProps {
  /** 조건 설명 문구 — 안내 문장. 종결형이다 */
  text: string
  /**
   * 조건 표기 줄(명사구). `formatBadgeConditionSpec()`의 결과를 그대로 받는다.
   * **optional이다** — 미션 보상·수동 발급·체크인 배지처럼 표기할 조건이 없으면
   * 넘기지 않거나 `null`을 넘긴다. 그러면 지금까지와 똑같이 문장 한 줄만 그린다
   * (어드민 미리보기가 이 경로를 쓴다).
   */
  spec?: string | null
}

export default function BadgeConditionCard({ text, spec }: BadgeConditionCardProps) {
  return (
    <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-2">
      <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.conditionTitle}</p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] leading-[var(--leading-loose)]">{text}</p>
      {spec && (
        /* 문장과 형태로 구분한다 — 구분선 + 본문 색 + 굵기 + tabular 숫자.
           길어지면 줄바꿈한다. 조건이 잘리면 안 되므로 말줄임(truncate)을 쓰지 않는다. */
        <p className="mt-1 pt-3 border-t border-text/10 text-[length:var(--text-small)] font-bold text-text leading-[var(--leading-loose)] tabular-nums [word-break:keep-all] break-words">
          {spec}
        </p>
      )}
    </div>
  )
}
