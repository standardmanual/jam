import SafeImage from '@/components/SafeImage'
import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { PointText } from '@ds/components/patterns/PointText'
import { CoinIcon, PackageIcon } from '@/components/ui/icons'
import { formatKoreanDateTime } from '@/components/LocalDate'
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

export interface RecipeRewardBadge {
  id: string
  name: string
  image_url: string | null
  rarity: BadgeRarity | null
}

interface Props {
  /** 레시피 이름 — combination_recipes.name (마이그레이션 175, 티켓 20260917_1828) */
  title: string
  /** 슬롯 개수 — 타이틀 우측에 회색 원형 배지 안 숫자로 표시 (티켓 20260917_2028 후속 조정) */
  slotCount: number
  badges: RecipeRewardBadge[]
  points: number
  /** 지정하면 레시피 탐색 목록 행(클릭 가능). 생략하면 믹서 상단 요약바(표시 전용). */
  onClick?: () => void
  className?: string
  /**
   * 공개 시각 — 공개 전 레시피를 운영자에게 보여 줄 때만 서버가 채운다(티켓 20261001_1159). 값이
   * 있으면 「공개 예정 · 10월 6일 오후 3시 30분」 한 줄을 더 그린다. 공개 전인지는 서버가 정해서
   * 내려주므로 여기서 `new Date()`로 다시 계산하지 않는다. 없으면 지금과 똑같은 렌더다.
   */
  releaseAt?: string | null
  /**
   * 보상 없음으로 정한 레시피(보상 배지 0개, 포인트 0) — 코인 아이콘 대신 중립 아이콘과 «보상 없음» 부제를 그린다.
   * 이 값이 없으면 보상이 비어 있어도 지금과 똑같이 그린다(티켓 20261018_0055 2회).
   */
  noReward?: boolean
  /** 결과를 잠긴 채 지급하는 레시피 — 부제의 등급 칩 옆에 «잠김» 칩을 붙인다(티켓 20261018_0055 2회) */
  rewardLocked?: boolean
}

/**
 * 레시피 보상 요약 행 — 레시피 탐색 목록의 각 행과 믹서 상단 요약바가 완전히 같은 컴포넌트를
 * 공유한다(티켓 20260917_2014). `@/components/ui/ListRow` 호출 한 번으로 그리는 서비스 전용 어댑터다
 * (티켓 20261107_0011, 채원 판정). 치수·색은 ListRow가 주고 여기서는 값을 박지 않는다.
 *
 * 3케이스:
 * - 배지 + 포인트: lead=배지 이미지(tile), eyebrow=등급 칩, meta=배지명, value=포인트 값
 * - 배지만: 위와 같고 value 없음
 * - 포인트만: lead=코인(round), eyebrow·meta 없음, value=포인트 값
 *
 * 4번째 케이스(티켓 20261018_0055 2회): `noReward`면 중립 아이콘(`PackageIcon`)과 meta «보상 없음»만 그린다.
 * `rewardLocked`면 배지 보상이 있을 때 eyebrow의 등급 칩 옆에 «잠김» 칩을 붙인다.
 *
 * `releaseAt`이 있으면 위 어느 케이스든 meta 맨 아래에 「공개 예정」 줄을 하나 더 그린다.
 * 보상 배지가 여러 개면 대표(첫 번째)만 노출하고 "+N"을 붙인다.
 * 타이틀 끝에는 슬롯 개수를 `ListRowChip`으로 붙인다(`titleSuffix`).
 *
 * 칩을 title 아래 `chips`가 아닌 위 `eyebrow`에 두는 이유: ListRow는 eyebrow → title → meta → chips 순서로 그려서
 * chips에 두면 배지명과 공개 예정 줄 아래로 내려가고, 배지명 앞에 한 줄로 두면 320px에서 배지명이 거의 가려진다.
 */
export default function RecipeRewardRow({
  title,
  slotCount,
  badges,
  points,
  onClick,
  className = '',
  releaseAt,
  noReward = false,
  rewardLocked = false,
}: Props) {
  const hasBadges = badges.length > 0
  const hasPoints = points > 0
  const primary = badges[0]
  const extraCount = badges.length - 1

  const showNoReward = noReward && !hasBadges && !hasPoints
  const showBadge = hasBadges && primary !== undefined

  // 이미지는 장식이다(`alt=""`) — 배지 이름은 meta 글자에 이미 있다. 아이콘은 20px 글리프만 주고 48 박스·면은 ListRow가 준다.
  const lead = showBadge ? (
    <SafeImage
      src={primary.image_url}
      alt=""
      width={48}
      height={48}
      fallback={<PackageIcon className="w-5 h-5 text-muted" />}
    />
  ) : showNoReward ? (
    <PackageIcon className="w-5 h-5 text-muted" />
  ) : (
    <CoinIcon className="w-5 h-5 text-muted" />
  )
  const leadShape = !showBadge && !showNoReward ? 'round' : 'tile'

  // eyebrow 노드를 만들기 전에 그릴 칩이 하나라도 있는지 먼저 판정한다 — 빈 노드를 넘기면 빈 줄이 남는다.
  // 등급이 common·null이면 RarityBadge는 null을 돌려주므로 칩이 없을 수 있다.
  const hasRarityChip = showBadge && primary.rarity != null && primary.rarity !== 'common'
  const hasLockedChip = showBadge && rewardLocked
  // 등급 칩은 `size="row"`라 잠김 칩(ListRowChip)과 같은 12px/20px다. 래퍼 `items-center`는 두 칩을 한 줄 중앙에 맞춘다.
  const eyebrow =
    hasRarityChip || hasLockedChip ? (
      <span className="inline-flex items-center gap-1">
        {showBadge && <RarityBadge rarity={primary.rarity} size="row" />}
        {hasLockedChip && <ListRowChip tone="neutral">{d.lockedItem.detail.chip}</ListRowChip>}
      </span>
    ) : undefined

  // meta는 phrasing(`<span>`)만 쓴다 — 클릭 영역(`<button>`) 안이다. `metaLines={0}`이라 말줄임은 배지명 줄에만 직접 건다.
  const badgeLine = showBadge ? (
    <span className="block truncate">
      {primary.name}
      {extraCount > 0 ? ` +${extraCount}` : ''}
    </span>
  ) : showNoReward ? (
    d.combine.noRewardLabel
  ) : undefined
  const releaseLine = releaseAt ? (
    // 말줄임(truncate)을 쓰지 않는다 — 날짜가 정보라서다. 폭이 모자라면 두 조각 중 날짜 조각이
    // 통째로 다음 줄로 내려간다(조각 안에서는 끊기지 않는다).
    <span className={`flex flex-wrap gap-x-1 text-xs${badgeLine !== undefined ? ' mt-1' : ''}`}>
      <span className="whitespace-nowrap">{d.combine.releaseScheduled} ·</span>
      <span className="whitespace-nowrap">{formatKoreanDateTime(releaseAt, { time: true })}</span>
    </span>
  ) : undefined
  const meta =
    badgeLine !== undefined || releaseLine !== undefined ? (
      <>
        {badgeLine}
        {releaseLine}
      </>
    ) : undefined

  // 획득 포인트: 숫자는 굵게, 줄을 바꿔 아래에 작은 글씨로 «포인트». 값과 단위의 색은 PointText 한 곳에서 `--point-text`로 정한다(티켓 20261104_2319, 규칙: UX Writing 가이드 «포인트» 행)
  const value = hasPoints ? <PointText value={points} unit={d.combine.pointsUnit} layout="stacked" /> : undefined

  return (
    <ListRow
      lead={lead}
      leadShape={leadShape}
      eyebrow={eyebrow}
      title={title}
      titleVariant="strong"
      titleLines={1}
      titleSuffix={<ListRowChip tone="neutral">{slotCount}</ListRowChip>}
      meta={meta}
      metaLines={0}
      value={value}
      onClick={onClick}
      className={className}
    />
  )
}
