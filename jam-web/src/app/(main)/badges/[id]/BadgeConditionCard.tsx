import { d } from '@/lib/i18n'

/**
 * 배지 상세화면 본문의 "획득 조건" 카드 — [20260819_011]
 * activity/poi 변형에 중복돼 있던 마크업을 추출한 순수 리팩터링(렌더링 결과 동일).
 * 어드민 배경 제너레이터 미리보기가 실제 본문과 동일한 카드를 그대로 재사용하기 위해 분리했다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 */
interface BadgeConditionCardProps {
  /** 조건 설명 문구 */
  text: string
}

export default function BadgeConditionCard({ text }: BadgeConditionCardProps) {
  return (
    <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-2">
      <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.conditionTitle}</p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] leading-[var(--leading-loose)]">{text}</p>
    </div>
  )
}
