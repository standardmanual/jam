/**
 * 홈피드 카드 표시 데이터 변환 (티켓 20261001_1357, 상위 20260930_1453 확정 설계 2·3·8절)
 *
 * 카드 행(서버 조회 결과)을 「표시 데이터」(`CardView`)로 바꾼다. 표시 데이터는 카드 ID·활성 여부·노출 기간·
 * 정렬 순서·유저별 보유 여부 없이도 만들 수 있는 화면용 값 묶음이라, 홈 그리기와 운영툴 미리보기(티켓 20261001_1501)가
 * 같은 값으로 같은 카드를 그린다. 계측에 필요한 값(카드 ID·유형 ID·그려진 모양)은 `tracking` 하나에 묶는다 —
 * 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다(미리보기가 계측을 남기지 않게 하는 장치).
 *
 * 순수 파일이다: 서버 모듈을 값으로 불러오지 않는다(클라이언트 컴포넌트도 읽는다). `cards.ts`·`rankingDataSource.ts`는 타입만 가져온다.
 * 홈 화면이 이 값을 그리는 모양은 `components/today`의 `RENDERED_SHAPES`가 정한다(조각 b2~b5가 하나씩 더한다).
 */
import type { TodayCardWithHref } from './cards'
import type { RankingBoardResult } from '@/lib/ranking/rankingDataSource'
import type { TodayCardTemplateType } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import {
  CARD_RESOURCES,
  fallbackEmptyTileShape,
  isRankingRows,
  resolveShape,
  resolveTitleInImage,
  resourceOfTemplate,
  type CardResource,
  type CardShape,
  type ImageCardShape,
} from './shape'

// ─── 자원 ─────────────────────────────────────────────────────────────────

// 자원 목록·템플릿 → 자원 대응·타일 0개 대체 규칙은 계측(`events.ts`)도 쓰는 순수 판정이라 `shape.ts`에 있다(티켓 20261001_2244).
// 기존 호출부가 이 파일에서 가져오던 이름은 그대로 쓸 수 있게 다시 내보낸다.
export { CARD_RESOURCES, fallbackEmptyTileShape, resourceOfTemplate }
export type { CardResource }

/** 칩 줄 라벨 — 템플릿 이름(`ko.ts`의 `todayCard`)을 그대로 쓴다. */
const LABEL_BY_TEMPLATE: Record<TodayCardTemplateType, string> = {
  badge_spotlight: d.todayCard.badgeSpotlight,
  progress_nudge: d.todayCard.progressNudge,
  mission_spotlight: d.todayCard.missionSpotlight,
  itembook_milestone: d.todayCard.itembookMilestone,
  location_trend: d.todayCard.locationTrend,
  drop_alert: d.todayCard.dropAlert,
  editorial_article: d.todayCard.editorialArticle,
  ranking_board: d.todayCard.rankingBoard,
}

// ─── 필수 정보 줄 ──────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** 종료까지 이 기간 이내일 때만 남은 시간을 보인다. */
const REMAINING_WINDOW_MS = 7 * DAY_MS

/** 필수 정보 줄은 최대 2개다(확정 설계 2절). */
export const MAX_FACTS = 2

/** `buildFacts`가 자원별로 읽는 값. 줄에 쓸 값이 없으면(생략·null) 그 줄을 만들지 않는다. */
export interface CardFactValues {
  /** 미션 기간(미션·자동 카드). `endsAt`이 null이면 상시 */
  period?: { startsAt: string; endsAt: string | null } | null
  rewardPoints?: number | null
  rewardBadgeCount?: number | null
  /** 드랍 지역(`region_label`) */
  place?: string | null
  collectionName?: string | null
  itemCount?: number | null
  /** JAM! 배지 이름(배지 1개일 때) */
  badgeName?: string | null
}

/** KST 기준 「M월 D일」. 시각을 읽을 수 없으면 null. */
export function formatKstMonthDay(iso: string): string | null {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  // KST는 서머타임이 없어 9시간을 더한 뒤 UTC 필드를 읽으면 서버·개발 머신 시간대와 무관하게 같은 값이다.
  const kst = new Date(ms + KST_OFFSET_MS)
  return t(d.todayCard.factMonthDay, { month: kst.getUTCMonth() + 1, day: kst.getUTCDate() })
}

/**
 * 남은 시간 문구. 종료가 지금부터 7일 이내일 때만 만든다 — 24시간 이내는 「N시간 남음」(올림, 최소 1시간),
 * 그보다 길면 「N일 남음」(내림, 최소 1일). 이미 끝났거나 7일보다 멀면 null이다.
 * 초·분 단위와 카운트다운은 쓰지 않는다. 카드의 `ends_at`이 아니라 자원의 종료 시각을 받는다.
 */
function remainingText(endsAt: string | null, now: Date): string | null {
  if (!endsAt) return null
  const end = new Date(endsAt).getTime()
  if (Number.isNaN(end)) return null
  const remaining = end - now.getTime()
  if (remaining <= 0 || remaining > REMAINING_WINDOW_MS) return null
  if (remaining <= DAY_MS) return t(d.todayCard.remainingHours, { count: Math.ceil(remaining / HOUR_MS) })
  return t(d.todayCard.remainingDays, { count: Math.floor(remaining / DAY_MS) })
}

/** 기간 줄. 종료가 7일 이내면 남은 시간이 기간을 대신한다. 기간을 읽을 수 없으면 null. */
function periodLine(period: NonNullable<CardFactValues['period']>, now: Date): string | null {
  const remaining = remainingText(period.endsAt, now)
  if (remaining) return remaining
  if (!period.endsAt) return d.todayCard.factPeriodOngoing
  const start = formatKstMonthDay(period.startsAt)
  const end = formatKstMonthDay(period.endsAt)
  if (!start || !end) return null
  return t(d.todayCard.factPeriod, { range: t(d.todayCard.factPeriodRange, { start, end }) })
}

/** 보상 줄. 포인트·배지 중 있는 것만 「 · 」로 잇고, 둘 다 없으면 null. */
function rewardLine(points: number | null | undefined, badgeCount: number | null | undefined): string | null {
  const parts: string[] = []
  if (points && points > 0) parts.push(t(d.todayCard.factRewardPoints, { points: points.toLocaleString('ko-KR') }))
  if (badgeCount && badgeCount > 0) parts.push(t(d.todayCard.factRewardBadges, { count: badgeCount }))
  return parts.length > 0 ? t(d.todayCard.factReward, { items: parts.join(' · ') }) : null
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * 자원별 필수 정보(확정 설계 2절)를 글자 줄 최대 2개로 만든다. 값이 없는 줄은 생략한다.
 *
 * - 미션: 기간(또는 남은 시간) · 보상 / 자동 카드: 미션을 가리키면 그 미션의 기간
 * - 드랍: 지역(시각은 값이 없어 생략, 티켓 O6 1457) / 컬렉션: 이름 · 아이템 N개 / JAM! 배지: 이름
 * - 기사(게재일은 `publishedAt`으로 따로 둔다)·랭킹·레시피(템플릿이 아직 없다): 없음
 */
export function buildFacts(resource: CardResource, values: CardFactValues, now: Date): string[] {
  const lines: (string | null)[] = []
  switch (resource) {
    case 'mission':
      lines.push(values.period ? periodLine(values.period, now) : null)
      lines.push(rewardLine(values.rewardPoints, values.rewardBadgeCount))
      break
    case 'auto':
      lines.push(values.period ? periodLine(values.period, now) : null)
      break
    case 'drop': {
      const place = nonBlank(values.place)
      lines.push(place ? t(d.todayCard.factPlace, { place }) : null)
      break
    }
    case 'collection':
      lines.push(nonBlank(values.collectionName))
      lines.push(
        values.itemCount && values.itemCount > 0 ? t(d.todayCard.factItemCount, { count: values.itemCount }) : null,
      )
      break
    case 'badge':
      lines.push(nonBlank(values.badgeName))
      break
    case 'article':
    case 'ranking':
    case 'recipe':
      break
  }
  return lines.filter((line): line is string => line !== null).slice(0, MAX_FACTS)
}

// ─── 표시 데이터 ───────────────────────────────────────────────────────────

/** `list` 타일형의 타일 하나(배지·재료). */
export interface CardViewTile {
  name: string
  imageUrl: string | null
  rarity?: string | null
  /** 유저가 보유했는지. 값이 없으면(유저 정보가 없는 미리보기) 컬러로 그린다. */
  earned?: boolean
}

/**
 * 계측 정보 — 카드 ID·유형 ID·템플릿·그려진 모양. 표시 데이터에 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다
 * (운영툴 미리보기가 노출·클릭 기록을 남기지 않게 하는 장치, 티켓 20260930_1645와 이어진다).
 * 템플릿은 GA `today_card_click`의 `template_type`으로 보낸다(새 틀도 옛 렌더러와 같은 값을 보내야 해서 싣는다, 티켓 20261001_1458).
 */
export interface CardViewTracking {
  cardId: string
  contentTypeId: string | null
  templateType: TodayCardTemplateType
  shape: CardShape
}

interface CardViewBase {
  resource: CardResource
  /**
   * 카드의 템플릿(진행 알림·지역 트렌드 등). 자원(`resource`)은 둘을 한 값(`auto`)으로 묶으므로 아이콘처럼 템플릿을 구분해야 하는 화면 값은 이것을 읽는다
   * (`components/today/resourceIcon.ts`). 계측 정보(`tracking`)와 별개로 `toCardView`가 늘 싣는다 — 미리보기와 홈이 같은 아이콘을 그리게 하려는 값이다.
   * 직접 만든 표시 데이터(Story)는 생략할 수 있고, 생략하면 자원의 기본 아이콘이다.
   */
  template?: TodayCardTemplateType
  title: string
  /** 칩 줄 라벨(템플릿 이름). */
  label?: string
  /** 칩 줄 지역 핀(`region_label`). */
  regionLabel?: string
  subtitle?: string
  description?: string
  /** 필수 정보 줄. 최대 2개, 값이 없는 줄은 없다. */
  facts?: string[]
  href?: string
  /** 기사 게재일(ISO, `starts_at`). 칩 줄 끝에 그린다. */
  publishedAt?: string
  /** 이미지가 제목을 말하는 카드인지. */
  titleInImage?: boolean
  /** JAM! 배지 1개 카드의 희귀도(색 칩). */
  rarity?: string | null
  /** 이 표시 데이터를 만든 기준 시각(ISO). `toCardView`에 기준 시각을 넘겼을 때만 있다. */
  now?: string
  tracking?: CardViewTracking
}

/** 이미지가 있는 모양. `imageUrl`이 없으면(null) 그리는 쪽이 이미지 칸을 유지하고 자리 표시를 그린다. */
export interface ImageCardView extends CardViewBase {
  shape: ImageCardShape
  imageUrl: string | null
  /** 첫 배지 그림이 커버로 올라간 카드에서 유저가 그 배지를 아직 갖지 않았을 때 true(흑백으로 그린다). 값이 없으면(유저 정보가 없는 미리보기) 컬러다. */
  imageDimmed?: boolean
}

export interface BriefCardView extends CardViewBase {
  shape: 'brief'
  /**
   * 64px 칸에 그릴 배지 그림 — JAM! 배지가 정확히 1개이고 그림이 있을 때만 있다. 없으면 그리는 쪽이 자원 아이콘을 그린다.
   * `imageUrl`을 쓰지 않는 이유: `imageUrl`은 「이미지가 있는 모양」(`isImageShape`, 이미지 제작 필요 신호의 단일 원천)의 값이라
   * `brief`에 쓰면 그 판정과 섞인다. 커버(`cover_image_url`)와 미션 이미지는 썸네일로 쓰지 않는다.
   */
  thumbnailUrl?: string
  /** 유저가 그 배지를 아직 갖지 않았을 때 true(흑백으로 그린다). 값이 없으면(유저 정보가 없는 미리보기) 컬러다. */
  thumbnailDimmed?: true
}

/**
 * 목록 모양. `resource`가 `ranking`이면 행형(`ranking`을 그린다, `tiles`는 빈 배열), 아니면 타일형(`tiles`를 그린다).
 * 타일이 0개인 타일형은 만들어지지 않는다 — `toCardView`가 `brief`로 바꾼다.
 */
export interface ListCardView extends CardViewBase {
  shape: 'list'
  tiles: CardViewTile[]
  /** 랭킹 행형 전용. 순위를 읽지 못했으면 null. */
  ranking?: RankingBoardResult | null
}

export type CardView = ImageCardView | BriefCardView | ListCardView

export interface ToCardViewOptions {
  /** 기준 시각(남은 시간 계산). 없으면 지금. 값을 주면 표시 데이터의 `now`에도 남는다. */
  now?: Date
  /** true면 계측 정보를 싣는다(홈 그리기). 기본은 싣지 않는다 — 미리보기가 계측을 남기지 않게 하려는 기본값이다. */
  tracking?: boolean
}

/**
 * 서버 조회 결과를 표시 데이터로 바꾼다. 모양은 `resolveShape`로 정한다 — 홈과 어드민 미리보기가 같은 값으로 같은 모양을 그리고,
 * 전환 상수(`LEGACY_SHAPE_CUTOVER`)와 무관하다. 계측이 기록하는 모양(`events.ts`)은 같은 카드 행에서 같은 입력으로 정한다(티켓 20261001_2244).
 */
export function toCardView(card: TodayCardWithHref, options: ToCardViewOptions = {}): CardView {
  const now = options.now ?? new Date()
  const resource = resourceOfTemplate(card.template_type)
  const badges = card.resolved_badges ?? []
  const mission = card.resolved_mission ?? null
  const collection = card.resolved_collection ?? null

  const tiles: CardViewTile[] = badges.map((b) => ({
    name: b.name,
    imageUrl: b.image_url,
    rarity: b.rarity,
    earned: b.earned,
  }))

  // 타일이 0개인 타일형은 brief로 그린다(확정 설계 1절).
  const shape = fallbackEmptyTileShape(resolveShape(card), resource, tiles.length)

  const singleBadge = badges.length === 1 ? badges[0] : null
  const facts = buildFacts(
    resource,
    {
      period: mission ? { startsAt: mission.starts_at, endsAt: mission.ends_at } : null,
      rewardPoints: mission?.reward_points,
      rewardBadgeCount: mission?.reward_badge_count,
      place: card.region_label,
      collectionName: collection?.name,
      itemCount: collection?.item_count,
      badgeName: singleBadge?.name,
    },
    now,
  )

  const base: CardViewBase = { resource, template: card.template_type, title: card.title }
  const label = LABEL_BY_TEMPLATE[card.template_type]
  if (label) base.label = label
  const regionLabel = nonBlank(card.region_label)
  if (regionLabel) base.regionLabel = regionLabel
  const subtitle = nonBlank(card.subtitle)
  if (subtitle) base.subtitle = subtitle
  const description = nonBlank(card.description)
  if (description) base.description = description
  if (facts.length > 0) base.facts = facts
  if (card.resolved_href) base.href = card.resolved_href
  if (resource === 'article') base.publishedAt = card.starts_at
  base.titleInImage = resolveTitleInImage(card, mission?.image_url)
  if (resource === 'badge' && singleBadge) base.rarity = singleBadge.rarity
  if (options.now) base.now = options.now.toISOString()
  if (options.tracking) {
    base.tracking = {
      cardId: card.id,
      contentTypeId: card.content_type_id ?? null,
      templateType: card.template_type,
      shape,
    }
  }

  if (shape === 'list') {
    const rows = isRankingRows(resource)
    const view: ListCardView = { ...base, shape, tiles: rows ? [] : tiles }
    if (rows) view.ranking = card.resolved_ranking ?? null
    return view
  }
  if (shape === 'brief') {
    const view: BriefCardView = { ...base, shape }
    // 64px 칸의 썸네일은 JAM! 배지 1개 카드의 배지 그림뿐이다(여러 개는 `list`가 맞다)
    if (resource === 'badge' && singleBadge?.image_url) {
      view.thumbnailUrl = singleBadge.image_url
      // 보유 여부를 모르면(earned 없음, 유저 정보가 없는 미리보기) 컬러다 — 타일(`list`)과 같은 규칙(티켓 20261001_2208)
      if (singleBadge.earned === false) view.thumbnailDimmed = true
    }
    return view
  }

  // hero·poster·square — 커버가 있으면 커버, 없으면 첫 배지 그림(옛 카드가 올려 쓰던 규칙 그대로)
  const first = badges[0]
  const view: ImageCardView = { ...base, shape, imageUrl: card.cover_image_url || null }
  if (!card.cover_image_url && first?.image_url) {
    view.imageUrl = first.image_url
    if (first.earned === false) view.imageDimmed = true
  }
  return view
}
