import { LabelChip } from '@ds/components/cards/LabelChip'
import { RarityBadge, type Rarity } from '@ds/components/cards/RarityBadge'
import { PinIcon } from '@/components/ui/icons'
import { formatKstMonthDay, type CardView } from '@/lib/today/cardView'

/**
 * 카드 칩 줄 — 라벨 → 지역 핀 → 희귀도 → 게재일 (티켓 20261001_1737, 상위 20260930_1453 조각 b3).
 * `BriefCard`가 혼자 쓰던 칩 줄을 `HeroCard`가 두 번째 소비자가 되면서 공용으로 뺐다.
 *
 * **흰 면(`Card tone="inverse"`) 위 전용이다.** 라벨 칩은 기본 색조(짙은 회색 칩), 옅은 글자는 `text-text-inverse/60`이라 어두운 막 위에서는
 * 안 읽힌다. 이미지 위 어두운 막에 올리는 칩 줄(`poster`, b4)은 그때 색조를 따로 판정한다 — 지금 일반화하지 않는다.
 *
 * - 그리는 값만 받는다. 간격(위·아래 마진)은 호출부가 `className`으로 준다.
 * - 줄바꿈하지 않는다(첫 줄 높이 고정). 좁아지면 줄어드는 것은 지역 핀 글자뿐이다(라벨·희귀도·게재일은 `shrink-0`).
 * - 드랍은 필수 정보 「지역 ○○」 줄이 같은 지역 값을 이미 내므로 핀을 뺀다(한 카드에 같은 값이 두 번 보이지 않게). 이 규칙은 여기 한 곳에만 둔다.
 * - 게재일은 `publishedAt`이 있고 읽을 수 있을 때만 줄 끝에 「10월 5일」(KST, 연도 없음)로 그린다. 칩 줄 정렬 축이 둘(왼쪽 칩들, 줄 끝 게재일)인 것은
 *   분류 정보와 시점 정보를 갈라 읽게 하려는 의도라 게재일을 칩(필)으로 만들지 않는다.
 */

/** 칩 줄이 읽는 표시 데이터 값. */
export type CardChipRowView = Pick<CardView, 'resource' | 'label' | 'regionLabel' | 'rarity' | 'publishedAt'>

export default function CardChipRow({ view, className }: { view: CardChipRowView; className?: string }) {
  const showRegionPin = Boolean(view.regionLabel) && view.resource !== 'drop'
  const publishedDay = view.publishedAt ? formatKstMonthDay(view.publishedAt) : null

  return (
    <div className={className ? `flex items-center gap-[var(--spacing-8)] ${className}` : 'flex items-center gap-[var(--spacing-8)]'}>
      <LabelChip className="shrink-0">{view.label}</LabelChip>
      {showRegionPin && (
        <span className="inline-flex items-center gap-1 min-w-0 text-[length:var(--text-caption)] text-text-inverse/60">
          <PinIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">{view.regionLabel}</span>
        </span>
      )}
      {/* Common·등급 없음(null)·미지 값은 컴포넌트가 스스로 아무것도 그리지 않는다. 희귀도는 배지 자체의 정보라 흑백으로 만들지 않는다 */}
      <RarityBadge rarity={view.rarity as Rarity | null | undefined} size="md" className="shrink-0" />
      {publishedDay && (
        <time dateTime={view.publishedAt} className="ml-auto shrink-0 whitespace-nowrap text-[length:var(--text-caption)] text-text-inverse/60">
          {publishedDay}
        </time>
      )}
    </div>
  )
}
