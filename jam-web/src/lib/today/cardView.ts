/**
 * 홈피드 카드 표시 데이터 변환 (티켓 20261001_1357, 상위 20260930_1453 확정 설계 2·3·8절)
 *
 * 카드 행(서버 조회 결과)을 「표시 데이터」(`CardView`)로 바꾼다. 표시 데이터는 카드 ID·활성 여부·노출 기간·
 * 정렬 순서·유저별 보유 여부 없이도 만들 수 있는 화면용 값 묶음이라, 홈 그리기와 운영툴 미리보기(티켓 20261001_1501)가
 * 같은 값으로 같은 카드를 그린다. 계측에 필요한 값(카드 ID·유형 ID·그려진 유형)은 `tracking` 하나에 묶는다 —
 * 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다(미리보기가 계측을 남기지 않게 하는 장치).
 *
 * 순수 파일이다: 서버 모듈을 값으로 불러오지 않는다(클라이언트 컴포넌트도 읽는다). `cards.ts`는 타입만 가져온다.
 * 옛 7모양 갈래는 지웠다(티켓 20261122_1101, 상위 20261122_1100 8회차-1) — 표시 데이터는 새 유형(`FeedCardView`) 하나이고, `feed_type`이
 * 비었거나 모르는 값이면 텍스트 박스로 만든다(`feedType.ts`).
 */
import type { ResolvedBadge, TodayCardWithHref } from './cards'
import type { TodayCardTemplateType, TodayListItem } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import type { FeedPalette } from './feedAssign'
import { withTicketColorQuery } from '@/lib/badgeTicket/ticketColor'
import { resolveFeedLook, type FeedLook, type RenderedFeedType } from './feedLook'
import { resolveFeedType, usableListItems } from './feedType'
import type { FeedValueChipSource } from './feedValueChips'
import { CARD_RESOURCES, resolveTitleInImage, resourceOfTemplate, type CardResource } from './shape'

// ─── 자원 ─────────────────────────────────────────────────────────────────

// 자원 목록·템플릿 → 자원 대응은 `shape.ts`에 있다(티켓 20261001_2244). 기존 호출부가 이 파일에서 가져오던 이름은 그대로 쓸 수 있게 다시 내보낸다.
export { CARD_RESOURCES, resourceOfTemplate }
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
  recipe_reveal: d.todayCard.recipeReveal,
  content_intro: d.todayCard.contentIntro,
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
  /** 레시피 재료 수(슬롯 수). 0이거나 없으면 그 줄이 없다 */
  ingredientCount?: number | null
  /** 레시피 공개 시각(ISO). 값이 있으면(공개 전) 두 번째 줄이 공개일이고, 없으면(공개 뒤) 보상이다 */
  revealAt?: string | null
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
 * - 레시피: 공개 전은 재료 N개 · 공개 M월 D일, 공개 뒤는 재료 N개 · 보상(공개일은 이미 지나 정보가 못 된다, 티켓 20261006_1217)
 * - 기사(게재일은 `publishedAt`으로 따로 둔다)·랭킹: 없음
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
    case 'recipe': {
      lines.push(
        values.ingredientCount && values.ingredientCount > 0
          ? t(d.todayCard.factIngredientCount, { count: values.ingredientCount })
          : null,
      )
      if (values.revealAt) {
        // 공개일을 읽을 수 없으면(예약 값 형식 오류) 이 줄만 생략한다
        const date = formatKstMonthDay(values.revealAt)
        lines.push(date ? t(d.todayCard.factRevealDate, { date }) : null)
      } else {
        lines.push(rewardLine(values.rewardPoints, values.rewardBadgeCount))
      }
      break
    }
    case 'article':
    case 'ranking':
      break
  }
  return lines.filter((line): line is string => line !== null).slice(0, MAX_FACTS)
}

// ─── 표시 데이터 ───────────────────────────────────────────────────────────

/**
 * 계측 정보 — 카드 ID·유형 ID·템플릿·그려진 유형. 표시 데이터에 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다
 * (운영툴 미리보기가 노출·클릭 기록을 남기지 않게 하는 장치, 티켓 20260930_1645와 이어진다).
 * 템플릿은 GA `today_card_click`의 `template_type`으로 보낸다(전환 전 옛 렌더러와 같은 값을 보내려고 실었다, 티켓 20261001_1458).
 * 그려진 유형(`feedType`)은 GA `today_card_click`의 `shape` 파라미터 값이 된다 — 파라미터 이름은 그대로이고 값이 옛 모양 이름에서 새 유형 이름으로 바뀐다(티켓 20261122_1101).
 */
export interface CardViewTracking {
  cardId: string
  contentTypeId: string | null
  templateType: TodayCardTemplateType
  /** 지금 그려진 유형. 서버 계측(`today_card_events.card_shape`)이 기록하는 값과 같다(`feedType.ts`). */
  feedType: RenderedFeedType
}

interface CardViewBase {
  resource: CardResource
  /**
   * 카드의 템플릿(진행 알림·지역 트렌드 등). 자원(`resource`)은 둘을 한 값(`auto`)으로 묶으므로 템플릿을 구분해야 하는 화면 값은 이것을 읽는다.
   * 계측 정보(`tracking`)와 별개로 `toCardView`가 늘 싣는다. 직접 만든 표시 데이터(Story)는 생략할 수 있다.
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

/**
 * 홈피드 카드 표시 데이터(티켓 20261121_0041, 상위 20261120_2026 4회차-2). `feedType`이 그리는 유형이다. `today_cards.feed_type`이 비었거나 모르는 값이면 `text_box`다(티켓 20261122_1101).
 * 값만 담는다(훅·조회 없음). 색·칩·도장·박스 같은 «그릴 값»은 `resolveFeedLook`이 낸 `look` 하나에 있다.
 * `shape?: undefined`는 `view.shape`를 읽는 어드민 코드(미리보기 등, 8-2~8-3이 정리한다)가 컴파일되고 «모양 없음»으로 읽게 하는 자리다.
 */
export interface FeedCardView extends CardViewBase {
  feedType: RenderedFeedType
  shape?: undefined
  /** 박스·히어로 이미지·전체 배경 이미지. 컬렉션 소개에서는 컬렉션 대표 그림(카드의 `cover_image_url`)이다. 없으면(null) 박스는 색 면이다. */
  imageUrl: string | null
  /** 배지 소개·배지만의 배지 그림(카드에 걸린 첫 배지). 없으면 `imageUrl`을 쓰고 둘 다 없으면 빈 영역이다. */
  badgeImageUrl?: string | null
  /** 배지 그림의 접근성 이름(카드에 걸린 첫 배지 이름) */
  badgeName?: string
  /** 컬렉션 소개: 컬렉션 이름(대표 그림의 접근성 이름) */
  collectionName?: string
  /** 컬렉션 소개: 대표 그림 뒤로 퍼지는 아이템 배지 그림(최대 4개, 그림이 있는 것만). 없거나 비면 모션 없이 대표 그림만 그린다. */
  collectionBadges?: FeedCardViewBadge[]
  /** 드랍·픽업: 박스에 담는 아이템 배지(카드에 걸린 배지의 앞 3개, 그림이 없는 배지도 있다. 1개 이상일 때만 이 갈래로 온다). */
  itemBadges?: FeedCardViewBadge[]
  /** 목록형: 항목(최대 3개, 1개 이상일 때만 이 갈래로 온다). 항목마다 따로 링크를 건다. */
  listItems?: FeedCardViewListItem[]
  /** 목록형: «→» 칸이 가는 대표 페이지 주소. 없으면 화살표 칸을 그리지 않는다. */
  listMoreHref?: string
  look: FeedLook
}

/** 컬렉션 소개·드랍·픽업이 그리는 아이템 배지 한 개. 그림이 없으면 그리는 쪽이 이름 글자로 대신한다. */
export interface FeedCardViewBadge {
  name: string
  imageUrl: string | null
}

/** 목록형 항목 한 개. */
export interface FeedCardViewListItem {
  name: string
  href: string
  imageUrl: string | null
}

/** 드랍·픽업이 박스에 담는 배지의 최대 개수. */
export const FEED_ITEM_BADGE_LIMIT = 3

export type CardView = FeedCardView

export interface ToCardViewOptions {
  /** 기준 시각(남은 시간 계산). 없으면 지금. 값을 주면 표시 데이터의 `now`에도 남는다. */
  now?: Date
  /** true면 계측 정보를 싣는다(홈 그리기). 기본은 싣지 않는다 — 미리보기가 계측을 남기지 않게 하려는 기본값이다. */
  tracking?: boolean
  /** 색 키 → hex 표(컬러셋 교체, 티켓 20261121_2145). 색이 비어 있는 개편 카드의 자동 배정에 쓴다. 없으면 기본 팔레트라 이전과 같다. */
  palette?: FeedPalette
}

/**
 * 개편 카드의 값 칩 입력. 자원(템플릿)마다 `TodayCardWithHref`가 싣고 있는 값을 읽는다(기간·보상 포인트·미션 조건 값·배지 달성 기준·레벨·컬렉션 아이템 수·체크인 필요 배지 수·장소 이름).
 * 미션 조건 값(`resolved_mission.condition_json`)과 배지 달성 기준·레벨(`resolved_badges[].condition_json`·`level`)은 조회 확장이 싣는 선택 칸이라(티켓 20261121_0155),
 * 칸이 없으면 그 칩만 만들지 않는다. 배지는 카드에 걸린 첫 배지의 값을 읽는다. 칩을 내지 않는 자원(기사·랭킹·레시피 공개)은 null이다.
 * 대응: 미션 소개 → 미션, 컬렉션 소식 → 컬렉션, 배지 소개 → 액티비티 배지, 지역 트렌드 → 체크인, 드랍 알림 → 아이템 배지(드랍·픽업), 미션을 가리키는 자동 카드 → 미션.
 */
function feedValueSourceOf(
  card: TodayCardWithHref,
  resource: CardResource,
  values: {
    mission: TodayCardWithHref['resolved_mission']
    collectionItemCount: number | null | undefined
    badgeCount: number
    /** 카드에 걸린 첫 배지(달성 기준·레벨을 읽는다) */
    firstBadge?: ResolvedBadge
  },
): FeedValueChipSource | null {
  const missionSource = (): FeedValueChipSource => ({
    resource: 'mission',
    endsAt: values.mission?.ends_at ?? null,
    rewardPoints: values.mission?.reward_points ?? null,
    condition: values.mission?.condition_json ?? null,
  })
  if (card.template_type === 'location_trend') {
    return { resource: 'checkin', requiredBadgeCount: values.badgeCount, placeName: card.region_label }
  }
  switch (resource) {
    case 'mission':
      return missionSource()
    case 'auto':
      return values.mission ? missionSource() : null
    case 'collection':
      return { resource: 'collection', itemCount: values.collectionItemCount ?? null }
    case 'badge':
      return {
        resource: 'activity_badge',
        condition: values.firstBadge?.condition_json ?? null,
        level: values.firstBadge?.level ?? null,
      }
    case 'drop':
      return { resource: 'drop_pickup' }
    default:
      return null
  }
}

/** 목록형 카드의 항목을 화면 값으로 바꾼다. 이름·주소가 비어 있는 항목은 건너뛰고 앞에서 `FEED_GALLERY.maxItems`개까지 쓴다(`usableListItems`). */
function toListItems(items: readonly TodayListItem[] | null | undefined): FeedCardViewListItem[] {
  return usableListItems(items).map((item) => ({
    name: nonBlank(item.name) ?? item.name,
    href: nonBlank(item.href) ?? item.href,
    imageUrl: nonBlank(item.image_url),
  }))
}

/**
 * 서버 조회 결과를 표시 데이터로 바꾼다. 유형은 `resolveFeedType`이 정한다 — `feed_type`이 비었거나 모르는 값이거나 그릴 값이 없으면 텍스트 박스다.
 * 홈과 어드민 미리보기가 같은 값으로 같은 유형을 그린다. 계측이 기록하는 유형(`events.ts`)은 같은 카드 행에서 같은 규칙(`feedType.ts`)으로 정한다.
 */
export function toCardView(card: TodayCardWithHref, options: ToCardViewOptions = {}): CardView {
  const now = options.now ?? new Date()
  const resource = resourceOfTemplate(card.template_type)
  const badges = card.resolved_badges ?? []
  const mission = card.resolved_mission ?? null
  const collection = card.resolved_collection ?? null
  // 레시피 값은 레시피 공개 카드만 읽는다(손으로 만든 표시 데이터가 다른 카드에 실어도 그 카드의 줄에는 번지지 않는다).
  const recipe = resource === 'recipe' ? (card.resolved_recipe ?? null) : null
  const releasedRecipe = recipe?.state === 'released' ? recipe : null

  const singleBadge = badges.length === 1 ? badges[0] : null
  const facts = buildFacts(
    resource,
    {
      period: mission ? { startsAt: mission.starts_at, endsAt: mission.ends_at } : null,
      rewardPoints: mission?.reward_points ?? releasedRecipe?.reward_points,
      rewardBadgeCount: mission?.reward_badge_count ?? releasedRecipe?.reward_badge_count,
      place: card.region_label,
      collectionName: collection?.name,
      itemCount: collection?.item_count,
      badgeName: singleBadge?.name,
      ingredientCount: recipe?.ingredient_count,
      // 공개 전에만 공개일을 싣는다. 공개 뒤에는 이 줄이 보상이다(`buildFacts`)
      revealAt: recipe?.state === 'scheduled' ? recipe.release_at : null,
    },
    now,
  )

  // 그릴 값(컬렉션 대표 그림·드랍 배지·목록 항목)이 없는 유형은 텍스트 박스로 그린다 — 화면이 비지 않는다(`resolveFeedType`).
  const listItems = card.feed_type === 'gallery_list' ? toListItems(card.list_items) : []
  const itemBadges = badges.slice(0, FEED_ITEM_BADGE_LIMIT)
  const feedType = resolveFeedType(card.feed_type, {
    hasCover: Boolean(card.cover_image_url),
    itemBadgeCount: itemBadges.length,
    listItemCount: listItems.length,
  })

  const base: CardViewBase = { resource, template: card.template_type, title: card.title }
  const label = LABEL_BY_TEMPLATE[card.template_type]
  if (label) base.label = label
  const regionLabel = nonBlank(card.region_label)
  if (regionLabel) base.regionLabel = regionLabel
  const subtitle = nonBlank(card.subtitle)
  if (subtitle) base.subtitle = subtitle
  if (facts.length > 0) base.facts = facts
  if (card.resolved_href) base.href = card.resolved_href
  if (resource === 'article') base.publishedAt = card.starts_at
  base.titleInImage = resolveTitleInImage(card)
  if (resource === 'badge' && singleBadge) base.rarity = singleBadge.rarity
  if (options.now) base.now = options.now.toISOString()
  if (options.tracking) {
    base.tracking = { cardId: card.id, contentTypeId: card.content_type_id ?? null, templateType: card.template_type, feedType }
  }

  const first = badges[0]
  const lookSource = feedValueSourceOf(card, resource, {
    mission,
    collectionItemCount: collection?.item_count,
    badgeCount: badges.length,
    firstBadge: first,
  })
  const look = resolveFeedLook({ card, feedType, valueSource: lookSource, now, palette: options.palette })
  // 이미지 순서: 커버 → 미션 대표 이미지(미션 소개 카드만) → 첫 배지 그림
  let imageUrl = card.cover_image_url || null
  if (!imageUrl && card.template_type === 'mission_spotlight' && mission?.image_url) imageUrl = mission.image_url
  else if (!imageUrl && first?.image_url) imageUrl = first.image_url
  const feedView: FeedCardView = { ...base, feedType, imageUrl, look }
  // 배지 1개 카드가 가는 상세(`/badges/{id}`)에는 카드의 바탕·박스 색을 실어 티켓색으로 이어받게 한다(티켓 20261122_2226). 다른 목적지는 그대로다.
  if (feedView.href) feedView.href = withTicketColorQuery(feedView.href, look.colors)
  if (first?.image_url) feedView.badgeImageUrl = first.image_url
  if (first?.name) feedView.badgeName = first.name
  if (feedType === 'collection_intro') {
    // 대표 그림은 커버뿐이다(첫 배지 그림으로 대신하지 않는다 — `resolveFeedType`이 커버 없는 행을 텍스트 박스로 보냈다)
    feedView.imageUrl = card.cover_image_url || null
    if (collection?.name) feedView.collectionName = collection.name
    const collectionBadges = (collection?.item_badges ?? []).map((b) => ({ name: b.name, imageUrl: b.image_url }))
    if (collectionBadges.length > 0) feedView.collectionBadges = collectionBadges
  } else if (feedType === 'drop_pickup') {
    feedView.itemBadges = itemBadges.map((b) => ({ name: b.name, imageUrl: b.image_url || null }))
  } else if (feedType === 'gallery_list') {
    feedView.listItems = listItems
    const moreHref = nonBlank(card.list_more_href)
    if (moreHref) feedView.listMoreHref = moreHref
  }
  // 설명은 유형·`show_description`이 정한다
  const feedDescription = look.showDescription ? nonBlank(card.description) : null
  if (feedDescription) feedView.description = feedDescription
  return feedView
}
