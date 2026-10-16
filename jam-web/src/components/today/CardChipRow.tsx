import { LabelChip } from '@ds/components/cards/LabelChip'
import { RarityBadge, type Rarity } from '@ds/components/cards/RarityBadge'
import { PinIcon } from '@/components/ui/icons'
import { formatKstMonthDay, type CardView } from '@/lib/today/cardView'

/**
 * 카드 칩 줄 — 라벨 → 지역 핀 → 희귀도 → 게재일 (티켓 20261001_1737, 상위 20260930_1453 조각 b3).
 * `BriefCard`가 혼자 쓰던 칩 줄을 `HeroCard`가 두 번째 소비자가 되면서 공용으로 뺐다.
 *
 * **바탕에 따라 글자색이 둘이다**(`on`, 티켓 20261001_2013 b4). 기본 `'white'`는 기본 `Card`(흰 면) 위다: 옅은 글자는 `text-muted`(흰 면 위 5.74:1)다.
 * `'scrim'`은 이미지 위 어두운 막(`poster`) 위다: 지역 핀·게재일 글자는 `text-snow`다 — 막 위 순백 이미지에서 밝은 글자 대비가 AA(snow 5.60:1)를 지키는 것은
 * 가장 밝은 글자뿐이라 옅은 단계를 두지 않는다.
 * 라벨 칩은 두 바탕 모두 기본 색조(`--background-secondary` 알약 + `--foreground` 글자)다(티켓 20261015_2133): 막 위에서도 밝은 알약이라 어두운 막과 갈린다.
 * 이름을 `tone`으로 하지 않은 것은 `Card`의 `tone`(면 톤)과 `LabelChip`의 `tone`(알약 색조)이 서로 다른 축이라 섞이기 때문이다.
 * 막 전용 칩 줄을 따로 만들지 않는 것은 아래 규칙(줄바꿈 금지·핀만 줄어듦·드랍은 핀 생략)이 두 곳으로 갈라지기 때문이다.
 *
 * - 그리는 값만 받는다. 간격(위·아래 마진)은 호출부가 `className`으로 준다.
 * - 줄바꿈하지 않는다(첫 줄 높이 고정). 좁아지면 줄어드는 것은 지역 핀 글자뿐이다(라벨·희귀도·게재일은 `shrink-0`).
 * - 드랍은 필수 정보 「지역 ○○」 줄이 같은 지역 값을 이미 내므로 핀을 뺀다(한 카드에 같은 값이 두 번 보이지 않게). 이 규칙은 여기 한 곳에만 둔다.
 * - 그릴 것이 하나도 없으면(라벨·지역 핀·희귀도·게재일 모두 없음) 줄 자체를 그리지 않는다 — 이 코드가 모르는 템플릿 값의 카드는 라벨이 사전에 없어 생략되는데
 *   빈 줄이 남으면 호출부가 준 아래 마진만 남아 제목이 8px 밀려 내려간다(티켓 20261006_1217).
 * - 게재일은 `publishedAt`이 있고 읽을 수 있을 때만 줄 끝에 「10월 5일」(KST, 연도 없음)로 그린다. 칩 줄 정렬 축이 둘(왼쪽 칩들, 줄 끝 게재일)인 것은
 *   분류 정보와 시점 정보를 갈라 읽게 하려는 의도라 게재일을 칩(필)으로 만들지 않는다.
 */

/** 칩 줄이 읽는 표시 데이터 값. */
export type CardChipRowView = Pick<CardView, 'resource' | 'label' | 'regionLabel' | 'rarity' | 'publishedAt'>

/** 칩 줄이 놓이는 바탕. `white`는 흰 면 위, `scrim`은 이미지 위 어두운 막 위다. */
export type CardChipRowOn = 'white' | 'scrim'

export default function CardChipRow({
  view,
  className,
  on = 'white',
}: {
  view: CardChipRowView
  className?: string
  on?: CardChipRowOn
}) {
  const scrim = on === 'scrim'
  const mutedText = scrim ? 'text-snow' : 'text-muted'
  const showRegionPin = Boolean(view.regionLabel) && view.resource !== 'drop'
  const publishedDay = view.publishedAt ? formatKstMonthDay(view.publishedAt) : null

  if (!view.label && !showRegionPin && !view.rarity && !publishedDay) return null

  return (
    <div className={className ? `flex items-center gap-2 ${className}` : 'flex items-center gap-2'}>
      <LabelChip className="shrink-0">
        {view.label}
      </LabelChip>
      {showRegionPin && (
        <span className={`inline-flex items-center gap-1 min-w-0 text-xs ${mutedText}`}>
          <PinIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">{view.regionLabel}</span>
        </span>
      )}
      {/* Common·등급 없음(null)·미지 값은 컴포넌트가 스스로 아무것도 그리지 않는다. 희귀도는 배지 자체의 정보라 흑백으로 만들지 않는다 */}
      <RarityBadge rarity={view.rarity as Rarity | null | undefined} size="md" className="shrink-0" />
      {publishedDay && (
        <time dateTime={view.publishedAt} className={`ml-auto shrink-0 whitespace-nowrap text-xs ${mutedText}`}>
          {publishedDay}
        </time>
      )}
    </div>
  )
}
