'use client'

import { useId, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import SafeImage from '@/components/SafeImage'
import type { ActivityFeedRow, ActivityFeedEventType, BadgeRarity } from '@/types/database'
import { collapseLeveledBadgeBursts } from '@/lib/activity-feed/collapseLeveled'
import { formatRelativeTime } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
import LoadMoreButton from '@/components/ui/LoadMoreButton'
import { Card } from '@ds/components/cards/Card'
import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import { buildQueryHref, readEnumParam } from '@/lib/urlQueryState'
import {
  MedalIcon,
  BookIcon,
  PackageIcon,
  GiftIcon,
  TargetIcon,
  CheckCircleIcon,
  XCircleIcon,
  PuzzleIcon,
  InboxIcon,
} from '@/components/ui/icons'

const PAGE_SIZE = 20

/**
 * 활동 묶음 임계값 — **2건 이상일 때만** 한 카드로 접는다.
 * 1건이면 기존 FeedCard 그대로 그린다(장식만 붙고 정보가 없는 껍데기를 만들지 않는다).
 * 알림 결산의 F2 임계값(활동 2건)과 같은 판단이다 — RECAP_CASEBOOK R9.
 */
const GROUP_MIN_SIZE = 2

/** 묶음 카드 접힘 상태에 노출하는 대표 썸네일 최대 개수 */
const GROUP_THUMB_MAX = 4

type FilterTab = 'all' | 'badge' | 'mission' | 'activity_badge'

/** 필터를 주소에 싣는 쿼리 키(`?feed=badge|mission|activity_badge`). 기본 `all`은 쿼리에서 뺀다. (티켓 20261110_1217) */
const FEED_FILTER_QUERY_KEY = 'feed'
const FILTER_KEYS: readonly FilterTab[] = ['all', 'badge', 'mission', 'activity_badge']
const DEFAULT_FILTER: FilterTab = 'all'

const FILTER_TABS: SlidingTabItem<FilterTab>[] = [
  { key: 'all', label: d.feed.filterAll },
  { key: 'activity_badge', label: d.feed.filterActivityBadge },
  { key: 'badge', label: d.feed.filterItem },
  { key: 'mission', label: d.feed.filterMission },
]

const BADGE_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])
const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

/**
 * 피드 카드를 눌렀을 때 가는 곳(2026-11-08 사용자 요청: 바텀시트 대신 해당 콘텐츠의 상세 페이지로 보낸다).
 *
 * - 배지 획득·아이템 드랍·아이템 픽업: 그 배지의 상세(`/badges/{badge_id}`). 아이템 드랍은 지급 때 지점을 기록하지 않아(동기화·캡슐 지급이라 지점이 없다) 아이템 픽업과 같은 곳으로 간다.
 * - 미션 참여·완료·취소: 미션 상세(`/missions/{mission_id}`).
 * - 컬렉션 완성: 컬렉션 상세(`/collections/{collection_id}`).
 * - 챕터 오름: 상세 페이지가 없어 내 프로필 맨 위로 올린다.
 * - 갈 곳의 id가 비어 있으면 `null`이다(아무 일도 하지 않는다).
 *
 * `linkQuery`는 `?u=username` 같은 덧붙임 쿼리다(타인 프로필 기준으로 상세를 연다).
 */
export type FeedTarget = { kind: 'href'; href: string } | { kind: 'top' }

export function feedTarget(item: ActivityFeedRow, linkQuery = ''): FeedTarget | null {
  const meta = item.metadata as Record<string, unknown>
  const idOf = (key: string): string | null => {
    const v = meta[key]
    return typeof v === 'string' && v !== '' ? v : null
  }
  if (item.event_type === 'chapter_up') return { kind: 'top' }
  if (MISSION_EVENTS.has(item.event_type)) {
    const id = idOf('mission_id')
    return id ? { kind: 'href', href: `/missions/${id}` } : null
  }
  if (item.event_type === 'collection_tier_completed') {
    const id = idOf('collection_id')
    return id ? { kind: 'href', href: `/collections/${id}${linkQuery}` } : null
  }
  if (BADGE_EVENTS.has(item.event_type)) {
    const id = idOf('badge_id')
    return id ? { kind: 'href', href: `/badges/${id}${linkQuery}` } : null
  }
  return null
}

/** `feedTarget`이 정한 곳으로 간다. «맨 위»는 움직임 줄이기 설정이면 부드럽게 올리지 않고 바로 올린다. */
export function goToFeedTarget(target: FeedTarget | null, push: (href: string) => void): void {
  if (!target) return
  if (target.kind === 'href') { push(target.href); return }
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

export function matchesFilter(item: ActivityFeedRow, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'badge') return BADGE_EVENTS.has(item.event_type) && item.event_type !== 'badge_earned'
  if (tab === 'mission') return MISSION_EVENTS.has(item.event_type)
  if (tab === 'activity_badge') return item.event_type === 'badge_earned'
  return false
}

/**
 * 이미 경고를 남긴 미지 피드 종류 — 프로세스/세션 단위 중복 억제용. 카드마다·렌더마다 호출되므로 억제가 없으면 경고가 쏟아진다.
 * 소식의 `unknownNotificationType`(`lib/notifications/types.ts`)과 같은 방식이다. 그 파일은 소식 종류 전용이라 여기에 따로 둔다.
 */
const warnedUnknownFeedEventTypes = new Set<string>()

/**
 * 피드 종류 `switch`의 `default` 분기에서 호출하는 전수 처리 확인 헬퍼(티켓 20261021_1249 6-3 5회).
 * 예전 `EventIcon`은 `default`가 메달 폴백이라 종류를 추가하고 이 `switch`를 빠뜨려도 컴파일이 통과해 조용히 메달로 그려졌다.
 * 인자 타입이 `never`라 남은 종류가 있으면 **호출 지점이 컴파일 오류**가 된다.
 *
 * **던지지 않는다.** DB의 `feed_event_type`이 코드보다 먼저 늘어난 배포 시차에는 모르는 종류의 행이 목록에 섞여 들어오므로 런타임 폴백은 그대로 살아 있어야 한다.
 * 로그에는 종류만 남긴다(유저 식별자·메타데이터 원문 금지).
 */
function unknownFeedEventType(type: never): void {
  const key = String(type)
  if (warnedUnknownFeedEventTypes.has(key)) return
  warnedUnknownFeedEventTypes.add(key)
  console.warn('[feed] 미지 피드 종류', { type: key })
}

/** 이모지 대신 SVG 라인 아이콘 (등록된 배지 이미지가 있으면 그 이미지가 우선) */
export function EventIcon({ type, className }: { type: ActivityFeedEventType; className?: string }): ReactNode {
  switch (type) {
    case 'badge_earned': return <MedalIcon className={className} />
    case 'item_dropped': return <PackageIcon className={className} />
    case 'item_picked_up': return <GiftIcon className={className} />
    case 'mission_joined': return <TargetIcon className={className} />
    case 'mission_completed': return <CheckCircleIcon className={className} />
    case 'mission_cancelled': return <XCircleIcon className={className} />
    // 챕터 오름은 소식의 chapter_up이 이미 쓰는 메달, 컬렉션 완성은 컬렉션 소식이 쓰는 책이다(티켓 20261021_1249 6-3 5회, 새 아이콘을 고르지 않았다)
    case 'chapter_up': return <MedalIcon className={className} />
    case 'collection_tier_completed': return <BookIcon className={className} />
    default:
      // 모든 종류에 case가 있어 여기서 type은 never다. 종류를 추가하고 이 switch를 빠뜨리면 아래 호출이 컴파일 오류가 난다.
      unknownFeedEventType(type)
      return <MedalIcon className={className} />
  }
}

const EVENT_LABEL: Record<ActivityFeedEventType, string> = {
  badge_earned: d.feed.eventBadgeEarned,
  item_dropped: d.feed.eventItemDropped,
  item_picked_up: d.feed.eventItemPickedUp,
  mission_joined: d.feed.eventMissionJoined,
  mission_completed: d.feed.eventMissionCompleted,
  mission_cancelled: d.feed.eventMissionCancelled,
  chapter_up: d.feed.eventChapterUp,
  collection_tier_completed: d.feed.eventCollectionTierCompleted,
}

/**
 * 카드(`FeedCard`)가 쓰는 대상 이름 한 줄(상세 시트는 쓰지 않아 걷었다, 티켓 20261110_2150).
 * 예전에는 두 곳이 같은 삼항식(배지 이벤트면 `badge_name`, 아니면 `mission_title`)을 따로 갖고 있어 새 종류에서 어긋나기 쉬웠다(티켓 20261021_1249 6-3 5회).
 *
 * - 챕터 오름: `d.chapter.line.chapter`(«챕터 3»). 번호가 정수가 아니거나 1 미만이면 빈 문자열이다 — «챕터 0»을 그리지 않는다.
 * - 컬렉션 완성: `metadata.collection_name`. 비었거나 문자열이 아니면 빈 문자열이다.
 * - 그 밖: 지금까지와 같다(배지 이벤트는 `badge_name`, 나머지는 `mission_title`).
 *
 * 빈 문자열이면 카드는 제목 줄을 그리지 않고, 시트는 제목 자리에 종류 라벨을 쓴다.
 */
export function feedTitle(item: ActivityFeedRow): string {
  const meta = item.metadata as Record<string, unknown>
  switch (item.event_type) {
    case 'chapter_up': {
      const chapterNo = meta.chapter_no
      return typeof chapterNo === 'number' && Number.isInteger(chapterNo) && chapterNo >= 1
        ? t(d.chapter.line.chapter, { chapterNo })
        : ''
    }
    case 'collection_tier_completed':
      return typeof meta.collection_name === 'string' ? meta.collection_name.trim() : ''
    default:
      return BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  }
}

/**
 * badge_earned 이벤트가 **체크인 배지 획득**인지 판별한다(20260826_004).
 *
 * 체크인 배지는 별도 feed_event_type이 아니라 badge_earned + metadata로 기록된다
 * (20260826_001에서 도입). poi_name·visit_count가 둘 다 있으면 체크인이고, 없으면
 * 활동 배지 등 체크인과 무관한 획득이거나 20260826_001 이전에 쌓인 과거 행이다 —
 * 후자는 기존 '배지 획득' 라벨로 그대로 둔다(하위호환).
 */
function checkinInfo(item: ActivityFeedRow): { poiName: string; visitCount: number } | null {
  if (item.event_type !== 'badge_earned') return null
  const meta = item.metadata as Record<string, unknown>
  const poiName = typeof meta.poi_name === 'string' ? meta.poi_name : ''
  const visitCount = typeof meta.visit_count === 'number' ? meta.visit_count : 0
  if (poiName && visitCount >= 1) return { poiName, visitCount }
  return null
}

/**
 * 카드 썸네일에 붙일 «획득 횟수». 2 이상일 때만 값이 나온다(1회는 표시하지 않는다).
 *
 * 체크인은 기존대로 `visit_count`가 우선이다 — 체크인 반복은 `user_checkin_badge_earns`에
 * 쌓이고 `user_activity_badges.earn_count`는 오르지 않아 두 값이 서로 다른 사실을 말한다.
 * 그 외 배지는 `hydrateFeedBadgeInfo`가 렌더 직전에 실어준 `earn_count`를 쓴다.
 */
export function earnCountOf(item: ActivityFeedRow): number | null {
  const checkin = checkinInfo(item)
  if (checkin) return checkin.visitCount > 1 ? checkin.visitCount : null
  const raw = (item.metadata as Record<string, unknown>).earn_count
  return typeof raw === 'number' && raw > 1 ? raw : null
}

/**
 * 레벨형 배지의 Lv.N. 등급형·반복형은 null이다.
 * `rarity`가 NULL이면 레벨형이라는 v5의 유일한 판정 기준(마이그레이션 130)을 그대로 따른다 —
 * 여기서 `RarityBadge`에 넘기면 칩이 조용히 사라진다(티켓 20260905_0036).
 */
export function badgeLevelOf(item: ActivityFeedRow): number | null {
  const raw = (item.metadata as Record<string, unknown>).level
  return typeof raw === 'number' ? raw : null
}

/**
 * 배지 칩 한 자리 — 등급형은 등급 칩, 레벨형은 Lv.N 칩.
 * `BadgeGridCard`·`BadgeHeroSection`과 같은 분기다.
 */
function BadgeChip({ item }: { item: ActivityFeedRow }) {
  const level = badgeLevelOf(item)
  if (level != null) return <BadgeLevelChip level={level} size="row" />
  const meta = item.metadata as Record<string, unknown>
  const rarity = meta.rarity ? String(meta.rarity) : null
  // common은 RarityBadge가 내부에서 null을 반환해 시각적으로 아무것도 안 그린다(20260827_024).
  // 여기서 미리 걸러야 호출부의 `badgeChip || isLastPiece` 같은 진위 판정이 "칩 없음"을
  // 정확히 null로 받는다 — <RarityBadge/> JSX 객체 자체는 항상 참이라 이 필터 없이는
  // "렌더 안 됨"과 "값이 참"이 어긋난다(티켓 20260916_1720 재발).
  if (!rarity || rarity === 'common') return null
  return <RarityBadge rarity={rarity as BadgeRarity} size="row" />
}

/**
 * 카드(`FeedCard`)용 라벨 — `eventLabel`과 같은 판정이되 **평문 문자열**이다(티켓 20261106_2252 판정 1).
 * `ListRow`의 `eyebrow`는 문자열이면 한 덩어리 문장(최대 2줄)으로, ReactNode면 칩 줄로 그려진다.
 * `eventLabel`의 «N번째» 숫자 `<strong>`을 그대로 넣으면 문장이 쪼개져 4px 간격이 끼므로 카드는 이 함수를 쓴다.
 * 문구는 ko.ts 템플릿을 `t()`로 채운다. 숫자를 강조하던 `eventLabel`은 상세 시트와 함께 걷었다.
 */
export function eventLabelText(item: ActivityFeedRow): string {
  if (item.event_type === 'item_dropped') {
    const meta = item.metadata as Record<string, unknown>
    return meta.tribe_name ? d.feed.eventItemEarned : d.feed.eventItemDropped
  }
  const checkin = checkinInfo(item)
  if (checkin) {
    return checkin.visitCount <= 1 ? d.feed.eventCheckin : t(d.feed.eventCheckinRepeat, { visitCount: checkin.visitCount })
  }
  if (item.event_type === 'badge_earned') {
    const earnCount = earnCountOf(item)
    if (earnCount != null) return t(d.feed.eventBadgeEarnedRepeat, { count: earnCount })
  }
  return EVENT_LABEL[item.event_type]
}


/**
 * 피드 행의 대표 이미지 — 배지 이벤트는 배지 그림, 미션 이벤트는 미션 대표 이미지, 컬렉션 이벤트는 컬렉션 대표 이미지다
 * (`lib/activity-feed/attachImages.ts`가 미션·컬렉션 이미지를 붙인다, 2026-11-09 사용자 지시). 없으면 null이고 카드는 폴백 아이콘을 그린다.
 */
export function feedImageOf(meta: Record<string, unknown>): string | null {
  for (const key of ['badge_image_url', 'mission_image_url', 'collection_image_url']) {
    const value = meta[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function FeedCard({
  item,
  onClick,
  tone,
  separator,
}: {
  item: ActivityFeedRow
  onClick: () => void
  /** 활동 묶음 패널 안에서만 'flat'을 준다. 안 주면 단건 카드 모양 그대로다. */
  tone?: 'flat'
  separator?: boolean
}) {
  const meta = item.metadata as Record<string, string | number | boolean | null>
  const badgeImage = feedImageOf(meta)
  const title = feedTitle(item)
  const sub = (() => {
    if (item.event_type === 'item_dropped') {
      // 드랍엔진 v2: 트라이브 이름 노출 ("아스팔트 레인저의 파편")
      if (meta.tribe_name) return t(d.feed.fragmentOf, { tribe: String(meta.tribe_name) })
      return meta.poi_name ? String(meta.poi_name) : null
    }
    if (item.event_type === 'item_picked_up') return meta.poi_name ? String(meta.poi_name) : null
    if (item.event_type === 'mission_completed' && meta.reward_points) return tPoint(d.feed.rewardPoints, { points: Number(meta.reward_points).toLocaleString('ko-KR') })
    return null
  })()
  const isLastPiece = item.event_type === 'item_dropped' && meta.is_last_piece === true
  const badgeChip = BadgeChip({ item })
  // 체크인·액티비티 배지 공용 «×N». 액티비티 배지는 예전엔 poi_name이 없다는 이유로
  // 카운터가 아예 붙지 않았다(티켓 20260905_0038 ①).
  const earnCount = earnCountOf(item)

  return (
    <ListRow
      onClick={onClick}
      tone={tone}
      separator={separator}
      lead={
        // 대표 이미지가 없는 행은 아이콘 타일도 두지 않고 글만 보인다(2026-11-09 결정). 이미지는 제목이 본문에 이미 있어 장식(alt="")이다.
        // 크기는 ListRow의 `.ds-list-row-lead img` 규칙이 48 박스에 채운다. 이미지가 있는데 불러오지 못한 경우에만 아이콘을 폴백으로 쓴다.
        badgeImage ? (
          <SafeImage
            src={badgeImage}
            alt=""
            width={48}
            height={48}
            fallback={<EventIcon type={item.event_type} className="w-5 h-5 text-foreground" />}
          />
        ) : undefined
      }
      leadBadge={badgeImage && earnCount != null ? `×${earnCount}` : undefined}
      eyebrow={eventLabelText(item)}
      time={formatRelativeTime(item.created_at)}
      // 제목·부제·칩이 비면 빈 문자열·false가 아니라 undefined를 준다 — 빈 줄과 여백이 생기지 않는다.
      title={title || undefined}
      meta={sub || undefined}
      chips={
        badgeChip || isLastPiece || (!badgeImage && earnCount != null) ? (
          <>
            {badgeChip}
            {/* lead가 없으면 «×N»을 얹을 자리가 없어 칩으로 옮긴다 */}
            {!badgeImage && earnCount != null && <ListRowChip tone="neutral">{`×${earnCount}`}</ListRowChip>}
            {isLastPiece && (
              <ListRowChip tone="neutral" style={{ gap: 'var(--spacing-4)' }}>
                <PuzzleIcon className="w-3 h-3" />
                {d.feed.lastPiece}
              </ListRowChip>
            )}
          </>
        ) : undefined
      }
    />
  )
}

/**
 * 피드 렌더 단위 — 단건 카드 또는 **같은 활동에서 나온 이벤트 묶음**.
 *
 * 20260827_018 — 알림 결산(20260827_014)이 활동 단위로 접힌 뒤, 그 착지점인 프로필이
 * 같은 9개를 다시 9줄로 펴서 보여주는 문제를 없앤다. 알림함의 결산과 프로필의 묶음
 * 카드가 **같은 단위(활동)**를 말해야 착지가 성립한다.
 */
type FeedEntry =
  | { kind: 'single'; key: string; item: ActivityFeedRow }
  | { kind: 'group'; key: string; activityId: number; items: ActivityFeedRow[] }

/**
 * 이미 필터·정렬(created_at desc)이 끝난 목록을 활동 단위로 접는다.
 *
 * - **필터를 먼저 걸고 그 결과를 묶는다.** 묶음은 표현 계층이다 —
 *   「아이템」 탭에서 묶음을 열면 아이템 이벤트만 들어 있어야 한다.
 * - `strava_activity_id`가 NULL인 행은 **절대 서로 묶지 않는다**(과거 행·미션 참가 등).
 *   어느 활동에서 나왔는지 모르는 행을 추정으로 묶으면 사실이 아닌 화면이 된다.
 * - 묶음의 위치는 **가장 최신 멤버의 자리**다. 입력이 최신순이라 첫 등장 위치가 곧 그 자리다.
 */
/**
 * 같은 활동에서 나온 **같은 배지** 행을 한 장으로 접는다 — 그룹화 축에 배지 id를 더한 것이다
 * (티켓 20260905_0038 ①). 대표 행은 가장 최신(입력이 created_at desc라 첫 등장)이고,
 * 접힌 개수는 대표 행의 `earn_count`에 반영한다 — 아래 카드들이 이미 그 한 필드만 읽는다.
 *
 * **활동 축을 넘어서는 접기는 하지 않는다.** 서로 다른 활동에서 나온 획득을 한 장으로 합치면
 * 카드가 말하는 시각이 어느 획득의 것도 아니게 된다 — `strava_activity_id`가 NULL인 행을
 * 절대 서로 묶지 않는 기존 규칙과 같은 판단이다.
 *
 * v5에서 액티비티 배지가 같은 카드 여러 장으로 펴지는 일은 구조적으로 사라졌다 —
 * 반복형의 회차 증가는 **발급이 아니라서 피드 이벤트를 만들지 않는다**(티켓 20260905_0030 §2).
 * 남는 건 첫 발급 1행 + `earn_count`이고, 그게 곧 ×N이다. 이 접기는 v4 시절에 쌓인 과거 행과
 * 동시 싱크가 만든 중복 행을 위한 방어선이다.
 */
// ⚠️ 접기 대상이 BADGE_EVENTS 전체(badge_earned·item_dropped·item_picked_up)다.
//    아이템 배지는 시리얼 넘버가 다른 **개별 개체**라, 같은 활동에서 동일 아이템배지가
//    2개 나오면 한 장으로 접혀 한쪽 개체가 피드에서 도달 불가가 된다.
//    예전 드랍 엔진은 「활동당 1개 확정」이라 프로덕션 중복 그룹이 0건이었지만
//    (옛 lib/drop-engine/layers.ts, 티켓 20261022_0938에서 삭제), **드랍 규칙이 바뀌면 즉시 발화한다**(게이트 리뷰 지적).
//    그때는 아이템 이벤트를 접기에서 빼거나 inventory_item_id까지 키에 넣어야 한다.
function collapseRepeatEarns(items: ActivityFeedRow[]): ActivityFeedRow[] {
  const indexByKey = new Map<string, number>()
  const repeatByKey = new Map<string, number>()
  const kept: ActivityFeedRow[] = []

  for (const item of items) {
    const badgeId = (item.metadata as Record<string, unknown>).badge_id
    const activityId = item.strava_activity_id
    if (!BADGE_EVENTS.has(item.event_type) || typeof badgeId !== 'string' || typeof activityId !== 'number') {
      kept.push(item)
      continue
    }
    const key = `${activityId} ${badgeId}`
    const idx = indexByKey.get(key)
    if (idx == null) {
      indexByKey.set(key, kept.length)
      repeatByKey.set(key, 1)
      kept.push(item)
      continue
    }
    repeatByKey.set(key, (repeatByKey.get(key) ?? 1) + 1)
  }

  for (const [key, repeat] of repeatByKey) {
    if (repeat < 2) continue
    const idx = indexByKey.get(key)
    if (idx == null) continue
    const item = kept[idx]
    const meta = item.metadata as Record<string, unknown>
    const known = typeof meta.earn_count === 'number' ? meta.earn_count : 0
    // 기록된 회차가 더 크면 그쪽이 사실이다(회차는 피드 행보다 많을 수 있다).
    if (repeat <= known) continue
    kept[idx] = { ...item, metadata: { ...meta, earn_count: repeat } }
  }

  return kept
}

function buildFeedEntries(rawItems: ActivityFeedRow[]): FeedEntry[] {
  const items = collapseRepeatEarns(collapseLeveledBadgeBursts(rawItems))
  const buckets = new Map<number, ActivityFeedRow[]>()
  const entries: FeedEntry[] = []

  for (const item of items) {
    const activityId = item.strava_activity_id
    if (typeof activityId !== 'number') {
      entries.push({ kind: 'single', key: item.id, item })
      continue
    }
    const bucket = buckets.get(activityId)
    if (bucket) {
      // entries에 이미 들어간 배열과 같은 참조라 push만으로 묶음이 자란다.
      bucket.push(item)
      continue
    }
    const created = [item]
    buckets.set(activityId, created)
    entries.push({ kind: 'group', key: `activity_${activityId}`, activityId, items: created })
  }

  // 임계값 미달(1건) 묶음은 기존 단건 카드로 되돌린다.
  return entries.map((entry) =>
    entry.kind === 'group' && entry.items.length < GROUP_MIN_SIZE
      ? { kind: 'single' as const, key: entry.items[0].id, item: entry.items[0] }
      : entry
  )
}

/**
 * 묶음 헤드라인 — RECAP_CASEBOOK 확정 규칙을 그대로 따른다.
 * R1(「이번 활동으로」 접두 금지) · R3(화폐 단위는 「포인트」) · R5(2종 이상이면 총량).
 *
 * 포인트는 metadata의 `point_reward`를 합산한다. `badge_earned`·`item_dropped` 양쪽이
 * 같은 규약으로 싣는다(20260827_018에서 item_dropped 쪽을 맞췄다 — 그 전에는 드랍엔진이
 * 포인트를 지급하면서도 피드에 남기지 않아 알림 결산 총액보다 작은 숫자가 나왔다).
 *
 * ⚠️ 20260827_018 이전에 쌓인 item_dropped 행에는 이 필드가 없어 0으로 계산된다.
 *    활동 참조 컬럼과 같은 graceful degradation이다 — 백필하지 않는다.
 */
// 합계는 프로필이 가져온 피드 윈도우(limit 150) 안에서만 계산된다. 목록 맨 아래에서
// 활동이 잘리면 헤드라인 숫자가 실제 총량보다 작아질 수 있다 — 사실 총량처럼 읽히는
// 문장이므로 다음 사람이 다시 파지 않도록 남겨둔다.
// 20260905_0038 B — 여기 도달하는 items는 `collapseRepeatEarns`를 거친 뒤라 **배지 종류당 1건**이다.
// 그래서 「배지 N개」의 N은 이벤트 수가 아니라 고유 배지 수다(반복 획득은 각 카드의 ×N이 말한다).
// 문구를 바꾸지 않은 이유가 이것이다 — 접기 이후 숫자의 의미가 문구와 일치하게 됐다.
function groupHeadline(items: ActivityFeedRow[]): ReactNode {
  const badgeCount = items.filter((i) => BADGE_EVENTS.has(i.event_type)).length
  // 활동 id가 실리는 기록 지점은 badge_earned·item_dropped 둘뿐이라 실제로는 항상
  // badgeCount === items.length다. 그 전제가 깨지면 총량을 「배지」라고 부를 수 없으므로
  // 중립 문구로 폴백한다.
  if (badgeCount !== items.length || badgeCount === 0) {
    return t(d.feed.groupRecords, { count: items.length })
  }
  const points = items.reduce((sum, i) => {
    const reward = (i.metadata as Record<string, unknown>).point_reward
    return sum + (typeof reward === 'number' ? reward : 0)
  }, 0)
  if (points > 0) {
    return tPoint(d.feed.groupBadgesWithPoints, { count: badgeCount, points: points.toLocaleString('ko-KR') })
  }
  return t(d.feed.groupBadges, { count: badgeCount })
}

/**
 * 같은 활동에서 나온 이벤트를 접어 보여주는 **인라인 아코디언** 카드.
 *
 * 새 라우트·새 시트를 만들지 않는다 — 케이스북 R6("새 결산 화면을 만들지 않는다")이
 * 프로필 안에서도 유효하다. 펼치면 기존 FeedCard가 그대로 나오고, 카드를 누르면
 * 카드의 이동 대상(`feedTarget`)으로 간다.
 */
function ActivityGroupCard({
  items,
  activityName,
  onItemClick,
}: {
  items: ActivityFeedRow[]
  /** 없으면(조회 실패·이름 없음) 이름 줄 없이 헤드라인만 그린다. 묶음 자체는 유지한다. */
  activityName?: string
  onItemClick: (item: ActivityFeedRow) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const headline = groupHeadline(items)
  const thumbs = items
    .map((i) => String((i.metadata as Record<string, unknown>).badge_image_url ?? ''))
    .filter(Boolean)
  const shownThumbs = thumbs.slice(0, GROUP_THUMB_MAX)
  // 「+N」은 **썸네일 줄이 잘린 개수**다. items.length에서 빼면 이미지가 없는 이벤트까지
  // 섞여 들어가 「썸네일 2개 + 3」처럼 두 숫자가 서로 다른 계산처럼 읽힌다.
  // 이벤트 총량은 헤드라인이 이미 말하고 있으므로 여기서 다시 말하지 않는다.
  const restCount = thumbs.length - shownThumbs.length

  return (
    <Card
      className="t-acc"
      data-open={open}
      // 면·테두리는 Card 기본값(흰 면, 외곽선 없음)을 쓴다. 안쪽 여백만 0이다 — 안쪽 행이 px-4를 맡는다.
      // overflow는 주지 않는다 — 안쪽 행의 포커스 링이 잘린다(잘림은 t-acc-panel-inner가 맡는다).
      style={{ padding: 0 }}
    >
      <div className="px-4">
      <ListRow
        variant="media"
        tone="flat"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        // 활동 묶음 카드는 이미지 영역(활동 아이콘 타일)을 두지 않고 글만 보인다(2026-11-09 사용자 지시). 썸네일은 아래 footer에 있다.
        // 이름이 없으면 eyebrow를 주지 않는다 — ListRow가 시간을 제목 줄 오른쪽으로 옮긴다.
        eyebrow={activityName || undefined}
        time={formatRelativeTime(items[0].created_at)}
        title={headline}
        footer={
          shownThumbs.length > 0 ? (
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              {shownThumbs.map((src, i) => (
                <SafeImage
                  key={`${src}_${i}`}
                  src={src}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full object-cover"
                  fallback={<span className="w-6 h-6 rounded-full bg-background-secondary" />}
                />
              ))}
              {restCount > 0 && (
                <span className="text-xs leading-none text-muted">
                  {t(d.feed.groupMoreCount, { count: restCount })}
                </span>
              )}
            </span>
          ) : undefined
        }
      />
      </div>
      <div id={panelId} className="t-acc-panel">
        {/* 접힌 동안에도 DOM에 남아야 높이 트랜지션이 성립한다. 대신 inert로
            키보드 포커스·보조기술 노출에서 완전히 빼 유령 포커스를 막는다. */}
        {/* 패널 안 행의 포커스 링(밖으로 4px)이 overflow:hidden 가장자리에서 잘리지 않게 오른쪽·아래에 여백을 둔다.
            오른쪽은 -mr-1로 잘림 상자를 넓히고 pr-5(16+4)로 행 폭을 되돌려 헤더 px-4와 오른쪽 끝을 맞춘다(티켓 20261106_2252 판정 4, 20261108_1830). */}
        <div className="t-acc-panel-inner -mr-1" inert={!open}>
          <div className="pl-4 pr-5 pb-1">
            <div style={{ borderTop: '1px solid var(--separator)' }}>
              {items.map((item, i) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  tone="flat"
                  separator={i < items.length - 1}
                  onClick={() => onItemClick(item)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

interface Props {
  feedItems: ActivityFeedRow[]
  /** 배지 상세 링크에 덧붙일 쿼리스트링. 예: `?u=username`. 기본값 없음 */
  badgeLinkQuery?: string
  title?: string
  /** 제목·개수 줄을 화면에서 숨긴다(내 프로필). 제목은 스크린리더용 제목과 탭 이름으로 남는다 */
  hideHeader?: boolean
  /**
   * 활동 묶음 카드 헤더에 쓸 활동 이름 맵. 키는 `strava_activity_id`의 문자열.
   * 옵셔널이다 — 안 넘기면 묶음은 이름 없이 헤드라인만으로 그려진다.
   */
  activityNames?: Record<string, string>
  /**
   * 친구 소식용. `user_id`별 친구 프로필 주소(예: `{ [userId]: '/username' }`). 넘기면 카드를 눌렀을 때 종류와 상관없이 그 친구의 프로필로 간다.
   * 안 넘기면(내·타인 프로필) 카드는 `feedTarget`이 정한 상세 페이지로 간다.
   */
  friendProfileHrefs?: Record<string, string>
}

export default function FeedSection({ feedItems, badgeLinkQuery = '', title = d.feed.title, hideHeader = false, activityNames, friendProfileHrefs }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 필터는 ?feed=에서 읽어 시작한다(알 수 없는 값은 전체). 프로필의 ?u= 등 다른 쿼리는 전환 때 그대로 보존한다.
  const [activeFilter, setActiveFilter] = useState<FilterTab>(() =>
    readEnumParam(searchParams, FEED_FILTER_QUERY_KEY, FILTER_KEYS, DEFAULT_FILTER),
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 필터 → 묶음 순서를 지킨다. 묶음은 표현 계층이라 필터 결과 안에서만 성립한다.
  const filtered = feedItems.filter((f) => matchesFilter(f, activeFilter))
  const entries = buildFeedEntries(filtered)
  // 페이지네이션은 **묶음 카드 1개를 1개로** 센다(상단 카운트는 개별 이벤트 수 유지).
  const visible = entries.slice(0, visibleCount)
  const hasMore = entries.length > visibleCount

  const handleFilterChange = (tab: FilterTab) => {
    setActiveFilter(tab)
    setVisibleCount(PAGE_SIZE) // 탭 전환 시 페이지네이션 초기화
    // history를 쌓지 않고(replace) 새로고침·링크 공유·상세에서 돌아올 때 같은 필터가 유지되게 한다
    router.replace(
      buildQueryHref(pathname, searchParams, { [FEED_FILTER_QUERY_KEY]: tab === DEFAULT_FILTER ? null : tab }, window.location.hash),
      { scroll: false },
    )
  }

  // 카드를 누르면 바텀시트를 열지 않고 해당 콘텐츠의 상세 페이지로 보낸다. 친구 소식(`friendProfileHrefs`)은 종류와 상관없이 그 친구의 프로필로 보낸다.
  const handleCardClick = (item: ActivityFeedRow) => {
    const friendHref = friendProfileHrefs?.[item.user_id]
    if (friendProfileHrefs) {
      if (friendHref) router.push(friendHref)
      return
    }
    goToFeedTarget(feedTarget(item, badgeLinkQuery), router.push)
  }

  return (
    <section>
      {hideHeader ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <h2 className="text-2xl text-foreground mb-4">{title}</h2>
      )}
      {/* 필터 탭 — Tabs sliding (16-tabs-sliding.md) */}
      <div className="mb-4">
        <SlidingTabs
          items={FILTER_TABS}
          value={activeFilter}
          onChange={handleFilterChange}
          outlined={false}
          aria-label={title}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="w-8 h-8" />}
          title={d.feed.emptyTitle}
          description={d.feed.emptyBody}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {visible.map(entry => (
              entry.kind === 'group' ? (
                <ActivityGroupCard
                  key={entry.key}
                  items={entry.items}
                  activityName={activityNames?.[String(entry.activityId)]}
                  onItemClick={handleCardClick}
                />
              ) : (
                <FeedCard key={entry.key} item={entry.item} onClick={() => handleCardClick(entry.item)} />
              )
            ))}
          </div>
          {hasMore && (
            <LoadMoreButton onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
              {d.common.loadMore}
            </LoadMoreButton>
          )}
        </>
      )}
    </section>
  )
}
