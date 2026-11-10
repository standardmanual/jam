import Link from 'next/link'
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
  /**
   * 보상 배지가 없을 때(포인트만·보상 없음) 쓰는 제목 — 레시피 이름(combination_recipes.name, 마이그레이션 175, 티켓 20260917_1828).
   * 보상 배지가 있으면 제목은 대표 배지명이라 이 값은 쓰지 않는다(티켓 20261110_1250).
   */
  title: string
  /**
   * 슬롯 개수 — 타이틀 우측에 회색 원형 배지 안 숫자로 표시 (티켓 20260917_2028 후속 조정).
   * 생략하면 칩을 그리지 않는다. 레시피 탐색 목록 행과 믹서 상단 요약 행 모두 생략한다(2026-11-10 사용자 지시, 티켓 20261110_0001·20261110_1005 후속)
   */
  slotCount?: number
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
  /**
   * 대표 보상 배지의 이미지와 이름을 그 배지 상세(`/badges/{id}`)로 가는 링크로 만든다(2026-11-10 사용자 지시, 믹서 상단 요약 행용).
   * 눌림 행(`onClick`)에서는 쓰지 않는다 — 행 전체가 이미 버튼이라 링크를 안에 둘 수 없다. 보상 배지가 없으면(포인트만·보상 없음) 무시한다.
   */
  linkBadge?: boolean
  /** 결과를 잠긴 채 지급하는 레시피 — 부제의 등급 칩 옆에 «잠김» 칩을 붙인다(티켓 20261018_0055 2회) */
  rewardLocked?: boolean
}

/**
 * 레시피 보상 요약 행 — 레시피 탐색 목록의 각 행과 믹서 상단 요약바가 완전히 같은 컴포넌트를
 * 공유한다(티켓 20260917_2014). `@/components/ui/ListRow` 호출 한 번으로 그리는 서비스 전용 어댑터다
 * (티켓 20261107_0011, 채원 판정). 치수·색은 ListRow가 주고 여기서는 값을 박지 않는다.
 *
 * 3케이스:
 * - 배지 + 포인트: lead=배지 이미지(tile), eyebrow=등급 칩, title=대표 배지명(+N), meta 없음, value=포인트 값
 * - 배지만: 위와 같고 value 없음
 * - 포인트만: lead=코인(round), title=레시피 이름, eyebrow·meta 없음, value=포인트 값
 *
 * 4번째 케이스(티켓 20261018_0055 2회): `noReward`면 중립 아이콘(`PackageIcon`)과 meta «보상 없음»만 그린다(title=레시피 이름).
 * `rewardLocked`면 배지 보상이 있을 때 eyebrow의 등급 칩 옆에 «잠김» 칩을 붙인다.
 *
 * `releaseAt`이 있으면 위 어느 케이스든 meta 맨 아래에 「공개 예정」 줄을 하나 더 그린다.
 * 보상 배지가 여러 개면 대표(첫 번째)만 title에 노출하고 "+N"을 붙인다.
 * 타이틀 끝에는 슬롯 개수를 `ListRowChip`으로 붙인다(`titleSuffix`). 지금은 어느 호출부도 `slotCount`를 주지 않아 칩이 없다.
 *
 * 칩을 title 아래 `chips`가 아닌 위 `eyebrow`에 두는 이유: ListRow는 eyebrow → title → meta → chips 순서로 그려서
 * chips에 두면 제목과 공개 예정 줄 아래로 내려가고, 배지명 앞에 한 줄로 두면 320px에서 배지명이 거의 가려진다.
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
  linkBadge = false,
}: Props) {
  const hasBadges = badges.length > 0
  const hasPoints = points > 0
  const primary = badges[0]
  const extraCount = badges.length - 1

  const showNoReward = noReward && !hasBadges && !hasPoints
  const showBadge = hasBadges && primary !== undefined
  // 눌림 행 안에는 링크를 둘 수 없다(버튼 안의 링크). 표시 전용 요약 행에서만 배지 상세로 연결한다
  const badgeHref = linkBadge && showBadge && !onClick ? `/badges/${primary.id}` : undefined

  // 이미지는 장식이다(`alt=""`) — 배지 이름은 제목 글자에 이미 있다. 아이콘은 20px 글리프만 주고 48 박스·면은 ListRow가 준다.
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

  // 제목: 보상 배지가 있으면 대표 배지명(+N), 없으면 레시피 이름(티켓 20261110_1250). 말줄임은 ListRow가 건다(titleLines=1).
  const badgeTitleText = showBadge ? `${primary.name}${extraCount > 0 ? ` +${extraCount}` : ''}` : undefined
  const rowTitle =
    badgeTitleText === undefined ? (
      title
    ) : badgeHref ? (
      // 링크는 글자 모양을 그대로 두고 밑줄만 더해 눌러 볼 수 있음을 알린다
      <Link href={badgeHref} className="underline underline-offset-2">
        {badgeTitleText}
      </Link>
    ) : (
      badgeTitleText
    )

  // meta는 phrasing(`<span>`)만 쓴다 — 클릭 영역(`<button>`) 안이다. 배지명은 제목으로 올라갔으므로 «보상 없음» 부제와 공개 예정 줄만 남는다.
  const noRewardLine = showNoReward ? d.combine.noRewardLabel : undefined
  const releaseLine = releaseAt ? (
    // 말줄임(truncate)을 쓰지 않는다 — 날짜가 정보라서다. 폭이 모자라면 두 조각 중 날짜 조각이
    // 통째로 다음 줄로 내려간다(조각 안에서는 끊기지 않는다).
    <span className={`flex flex-wrap gap-x-1 text-xs${noRewardLine !== undefined ? ' mt-1' : ''}`}>
      <span className="whitespace-nowrap">{d.combine.releaseScheduled} ·</span>
      <span className="whitespace-nowrap">{formatKoreanDateTime(releaseAt, { time: true })}</span>
    </span>
  ) : undefined
  const meta =
    noRewardLine !== undefined || releaseLine !== undefined ? (
      <>
        {noRewardLine}
        {releaseLine}
      </>
    ) : undefined

  // 획득 포인트: 숫자는 굵게, 줄을 바꿔 아래에 작은 글씨로 «포인트». 값과 단위의 색은 PointText 한 곳에서 `--point-text`로 정한다(티켓 20261104_2319, 규칙: UX Writing 가이드 «포인트» 행)
  const value = hasPoints ? <PointText value={points} unit={d.combine.pointsUnit} layout="stacked" /> : undefined

  return (
    <ListRow
      lead={lead}
      leadHref={badgeHref}
      leadLabel={badgeHref ? primary?.name : undefined}
      leadShape={leadShape}
      eyebrow={eyebrow}
      title={rowTitle}
      titleVariant="strong"
      titleLines={1}
      titleSuffix={slotCount !== undefined ? <ListRowChip tone="neutral">{slotCount}</ListRowChip> : undefined}
      meta={meta}
      metaLines={0}
      value={value}
      onClick={onClick}
      className={className}
    />
  )
}
