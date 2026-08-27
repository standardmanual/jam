'use client'

import { useCallback, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { ActivityFeedRow, ActivityFeedEventType, BadgeRarity } from '@/types/database'
import { formatRelativeTime } from '@/lib/utils'
import { cssDurationMs } from '@/lib/motion'
import { d, t } from '@/lib/i18n'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import Button from '@/components/ui/Button'
import ListRowCard from '@/components/ui/ListRowCard'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import {
  MedalIcon,
  PackageIcon,
  GiftIcon,
  TargetIcon,
  CheckCircleIcon,
  XCircleIcon,
  PuzzleIcon,
  InboxIcon,
  ChevronRightIcon,
  ActivityIcon,
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

const FILTER_TABS: SlidingTabItem<FilterTab>[] = [
  { key: 'all', label: d.feed.filterAll },
  { key: 'activity_badge', label: d.feed.filterActivityBadge },
  { key: 'badge', label: d.feed.filterItem },
  { key: 'mission', label: d.feed.filterMission },
]

const BADGE_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])
const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

function matchesFilter(item: ActivityFeedRow, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'badge') return BADGE_EVENTS.has(item.event_type) && item.event_type !== 'badge_earned'
  if (tab === 'mission') return MISSION_EVENTS.has(item.event_type)
  if (tab === 'activity_badge') return item.event_type === 'badge_earned'
  return false
}

/** 이모지 대신 SVG 라인 아이콘 (등록된 배지 이미지가 있으면 그 이미지가 우선) */
function EventIcon({ type, className }: { type: ActivityFeedEventType; className?: string }): ReactNode {
  switch (type) {
    case 'badge_earned': return <MedalIcon className={className} />
    case 'item_dropped': return <PackageIcon className={className} />
    case 'item_picked_up': return <GiftIcon className={className} />
    case 'mission_joined': return <TargetIcon className={className} />
    case 'mission_completed': return <CheckCircleIcon className={className} />
    case 'mission_cancelled': return <XCircleIcon className={className} />
    default: return <MedalIcon className={className} />
  }
}

/**
 * 반복 체크인 배지 썸네일 모서리에 붙는 작은 카운터 배지("×N").
 * 인터랙션 리뷰 발견 3(20260826_001) — 반복 획득 이벤트가 최초 획득과 시각적으로 완전히
 * 동일해 텍스트를 읽기 전까지 구분이 안 된다는 지적 반영. 신규 컴포넌트를 만들지 않고 기존
 * 하우스 스타일(ProfileClient.tsx의 아바타 모서리 버튼과 동일한 pill 배지 톤)만 재사용한다.
 */
function CheckinCountBadge({ count }: { count: number }) {
  return (
    <span
      className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-[var(--radius-pill)] bg-surface-elevated border border-[color:var(--color-border)] text-[length:var(--text-caption)] leading-none font-bold text-text/80 flex items-center justify-center"
      aria-hidden="true"
    >
      ×{count}
    </span>
  )
}

const EVENT_LABEL: Record<ActivityFeedEventType, string> = {
  badge_earned: d.feed.eventBadgeEarned,
  item_dropped: d.feed.eventItemDropped,
  item_picked_up: d.feed.eventItemPickedUp,
  mission_joined: d.feed.eventMissionJoined,
  mission_completed: d.feed.eventMissionCompleted,
  mission_cancelled: d.feed.eventMissionCancelled,
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
 * item_dropped는 두 가지 출처를 하나의 이벤트 타입으로 공유한다:
 * - 활동 연동(Strava) 후 드랍엔진이 지급한 경우 → faction_name이 항상 채워짐 → "아이템 획득"
 * - 지점에 아이템배지를 직접 드랍한 경우(레거시 poi_drops 동기화) → faction_name 없음 → "아이템 드랍"
 *
 * 체크인 배지 획득(badge_earned + poi_name·visit_count)만 짧은 라벨이 아니라 **문장**으로
 * 표시한다(20260826_004 사용자 확정) — 첫 획득은 "체크인 했어요", 두 번째부터는
 * "{N}번째 체크인 했어요". 나머지 5개 타입의 라벨은 건드리지 않는다. 반복 획득일 때는
 * "N번째" 숫자만 인라인으로 강조해 핵심 정보를 눈에 띄게 한다(인터랙션 리뷰 발견 4).
 */
function eventLabel(item: ActivityFeedRow): ReactNode {
  if (item.event_type === 'item_dropped') {
    const meta = item.metadata as Record<string, unknown>
    return meta.faction_name ? d.feed.eventItemEarned : d.feed.eventItemDropped
  }
  const checkin = checkinInfo(item)
  if (checkin) {
    if (checkin.visitCount <= 1) return d.feed.eventCheckin
    // "{visitCount}번째 체크인 했어요" 템플릿을 {visitCount} 자리로 쪼개 숫자 부분만
    // <strong>으로 감싼다 — 템플릿 자체는 ko.ts 한 곳에서 계속 관리한다.
    const [prefix, suffix] = d.feed.eventCheckinRepeat.split('{visitCount}')
    return (
      <>
        {prefix}
        <strong className="font-bold text-text">{checkin.visitCount}</strong>
        {suffix}
      </>
    )
  }
  return EVENT_LABEL[item.event_type]
}


function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[var(--spacing-8)]">
      <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{label}</span>
      <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text text-right max-w-[60%]">{value}</span>
    </div>
  )
}

/**
 * 피드 상세 바텀시트.
 *
 * Panel reveal(07-panel-reveal.md) 적용 — 닫힘 트랜지션을 보여주려면 닫는
 * 즉시 언마운트하면 안 되므로, 부모는 `open`만 false로 바꾸고 `onClosed`
 * 콜백이 올 때 실제로 언마운트한다.
 */
export function DetailSheet({
  item,
  open,
  onClose,
  onClosed,
  badgeLinkQuery,
}: {
  item: ActivityFeedRow
  open: boolean
  onClose: () => void
  onClosed: () => void
  badgeLinkQuery: string
}) {
  const router = useRouter()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      // 닫힌 상태로 한 프레임 마운트한 뒤 data-open을 올려야 트랜지션이 발화한다.
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
    const raf = requestAnimationFrame(() => setShown(false))
    const timer = setTimeout(onClosed, cssDurationMs('--panel-close-dur', 350))
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [open, onClosed])

  const meta = item.metadata as Record<string, string | number | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const isBadgeEvent = BADGE_EVENTS.has(item.event_type) && Boolean(meta.badge_id)
  const rawBadgeNames = (item.metadata as Record<string, unknown>).awarded_badge_names
  const missionBadgeNames = Array.isArray(rawBadgeNames) ? (rawBadgeNames as string[]) : []
  const checkin = checkinInfo(item)

  return (
    <>
      <div className="fixed inset-0 bg-surface/60 z-40 t-panel-backdrop" data-open={shown} onClick={onClose} />
      {/*
        Panel reveal 래퍼. 시트 본체가 `-translate-x-1/2`로 가운데 정렬돼 있으면
        `.t-panel-slide`의 transform과 충돌하므로, 가운데 정렬은 flex 래퍼가
        맡고 시트 본체는 transform을 트랜지션에 온전히 넘긴다.
      */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
      <div
        className="t-panel-slide relative w-full max-w-[430px] bg-surface text-text rounded-t-[var(--radius-cards)] px-[var(--spacing-24)] pt-[var(--spacing-16)] pb-[calc(env(safe-area-inset-bottom)+var(--spacing-32))]"
        data-open={shown}
        style={{ '--panel-translate-y': '100%' } as CSSProperties}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-[var(--spacing-24)]" />
        <div className="flex justify-center mb-[var(--spacing-16)]">
          <div className="relative">
            {badgeImage ? (
              <Image src={badgeImage} alt={title} width={112} height={112} className="w-28 h-28 rounded-[var(--radius-cards)] object-cover" />
            ) : (
              <div className="w-28 h-28 rounded-[var(--radius-cards)] bg-surface-elevated text-text flex items-center justify-center">
                <EventIcon type={item.event_type} className="w-12 h-12" />
              </div>
            )}
            {checkin && checkin.visitCount > 1 && <CheckinCountBadge count={checkin.visitCount} />}
          </div>
        </div>
        <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 mb-1 line-clamp-2">{eventLabel(item)}</p>
        <h2 className="text-center text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text mb-[var(--spacing-16)]">{title}</h2>
        {rarity && rarity !== 'common' && (
          <div className="flex justify-center mb-[var(--spacing-16)]">
            <RarityBadge rarity={rarity as BadgeRarity} />
          </div>
        )}
        {/* 20260816_012: 보더 제거 — 티켓 20260820_012: 다크 시트 전환으로 4% 화이트 틴트로 구분 */}
        <div className="rounded-[var(--radius-cards)] bg-white/[0.04] px-[var(--spacing-16)] py-[var(--spacing-8)] mb-[var(--spacing-24)]">
          {(item.event_type === 'item_dropped' || item.event_type === 'item_picked_up') && meta.poi_name && (
            <Row label={d.feed.rowPlace} value={String(meta.poi_name)} />
          )}
          {/* 라벨이 "체크인 했어요"로 바뀌면서 문장에서 빠진 지점명을 상세에서 보존한다(20260826_004) */}
          {checkin && <Row label={d.feed.rowCheckinPlace} value={checkin.poiName} />}
          {item.event_type === 'mission_completed' && meta.target_value != null && Number(meta.target_value) > 0 && (
            <Row
              label={d.feed.rowResult}
              value={t(d.feed.resultValue, { current: String(meta.final_progress_value ?? 0), target: String(meta.target_value) })}
            />
          )}
          {item.event_type === 'mission_completed' && missionBadgeNames.length > 0 && (
            <Row label={d.feed.rowRewardBadges} value={missionBadgeNames.join(', ')} />
          )}
          {item.event_type === 'mission_completed' && meta.reward_points && (
            <Row label={d.feed.rowRewardPoints} value={t(d.feed.pointsValue, { points: Number(meta.reward_points).toLocaleString('ko-KR') })} />
          )}
          {item.event_type === 'badge_earned' && typeof meta.point_reward === 'number' && meta.point_reward > 0 && (
            <Row label={d.feed.rowPoints} value={t(d.feed.pointsGained, { points: Number(meta.point_reward).toLocaleString('ko-KR') })} />
          )}
          {/* 20260824_006 — 표시 기준을 created_at(획득 시각, 항상 정확)으로 변경.
              event_at(Strava 활동 시작 시각)은 로컬 벽시계 오해석 버그로 미래가 찍힐 수 있었다. */}
          <Row label={d.feed.rowDate} value={formatFullDate(item.created_at)} />
        </div>
        {isBadgeEvent ? (
          <Button
            surface="main"
            variant="primary"
            fullWidth
            onClick={() => router.push(`/badges/${meta.badge_id}${badgeLinkQuery}`)}
          >
            {d.common.detail}
          </Button>
        ) : (
          <Button surface="main" variant="primary" fullWidth onClick={onClose}>
            {d.common.close}
          </Button>
        )}
      </div>
      </div>
    </>
  )
}

function FeedCard({ item, onClick }: { item: ActivityFeedRow; onClick: () => void }) {
  const meta = item.metadata as Record<string, string | number | boolean | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const sub = (() => {
    if (item.event_type === 'item_dropped') {
      // 드랍엔진 v2: 세계관 이름 노출 ("아스팔트 레인저의 파편")
      if (meta.faction_name) return t(d.feed.fragmentOf, { faction: String(meta.faction_name) })
      return meta.poi_name ? String(meta.poi_name) : null
    }
    if (item.event_type === 'item_picked_up') return meta.poi_name ? String(meta.poi_name) : null
    if (item.event_type === 'mission_completed' && meta.reward_points) return t(d.feed.rewardPoints, { points: Number(meta.reward_points).toLocaleString('ko-KR') })
    return null
  })()
  const isLastPiece = item.event_type === 'item_dropped' && meta.is_last_piece === true
  const checkin = checkinInfo(item)

  return (
    <ListRowCard
      onClick={onClick}
      icon={
        <div className="relative">
          {badgeImage ? (
            <Image src={badgeImage} alt={title} width={40} height={40} className="w-10 h-10 rounded-[var(--radius-cards)] object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center">
              <EventIcon type={item.event_type} className="w-5 h-5 text-text" />
            </div>
          )}
          {checkin && checkin.visitCount > 1 && <CheckinCountBadge count={checkin.visitCount} />}
        </div>
      }
      trailing={
        <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{formatRelativeTime(item.created_at)}</span>
      }
    >
      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 line-clamp-2">{eventLabel(item)}</p>
      <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text truncate">{title}</p>
      {sub && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 truncate">{sub}</p>}
      <span className="inline-flex items-center gap-[var(--spacing-8)] mt-1">
        {rarity && <RarityBadge rarity={rarity as BadgeRarity} />}
        {isLastPiece && (
          <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-surface text-text">
            <PuzzleIcon className="w-3 h-3" />
            {d.feed.lastPiece}
          </span>
        )}
      </span>
    </ListRowCard>
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
function buildFeedEntries(items: ActivityFeedRow[]): FeedEntry[] {
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
function groupHeadline(items: ActivityFeedRow[]): string {
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
    return t(d.feed.groupBadgesWithPoints, { count: badgeCount, points: points.toLocaleString('ko-KR') })
  }
  return t(d.feed.groupBadges, { count: badgeCount })
}

/**
 * 같은 활동에서 나온 이벤트를 접어 보여주는 **인라인 아코디언** 카드.
 *
 * 새 라우트·새 시트를 만들지 않는다 — 케이스북 R6("새 결산 화면을 만들지 않는다")이
 * 프로필 안에서도 유효하다. 펼치면 기존 FeedCard가 그대로 나오고, 카드를 누르면
 * 기존 DetailSheet가 뜬다.
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
    <div className="t-acc" data-open={open}>
      <ListRowCard
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        icon={
          <div className="w-10 h-10 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center">
            <ActivityIcon className="w-5 h-5 text-text" />
          </div>
        }
        trailing={
          <span className="inline-flex items-center gap-[var(--spacing-8)]">
            <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">
              {formatRelativeTime(items[0].created_at)}
            </span>
            <ChevronRightIcon className="t-acc-chevron t-acc-chevron-right w-4 h-4 text-text/60" />
          </span>
        }
      >
        {activityName && (
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 truncate">
            {activityName}
          </p>
        )}
        <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text truncate">{headline}</p>
        {shownThumbs.length > 0 && (
          <span className="inline-flex items-center gap-1 mt-1" aria-hidden="true">
            {shownThumbs.map((src, i) => (
              <Image
                key={`${src}_${i}`}
                src={src}
                alt=""
                width={24}
                height={24}
                className="w-6 h-6 rounded-[var(--radius-tags)] object-cover"
              />
            ))}
            {restCount > 0 && (
              <span className="text-[length:var(--text-caption)] leading-none text-text/60">
                {t(d.feed.groupMoreCount, { count: restCount })}
              </span>
            )}
          </span>
        )}
      </ListRowCard>
      <div id={panelId} className="t-acc-panel">
        {/* 접힌 동안에도 DOM에 남아야 높이 트랜지션이 성립한다. 대신 inert로
            키보드 포커스·보조기술 노출에서 완전히 빼 유령 포커스를 막는다. */}
        <div className="t-acc-panel-inner" inert={!open}>
          <div className="flex flex-col gap-[var(--spacing-8)] pt-[var(--spacing-8)] pl-[var(--spacing-16)]">
            {items.map((item) => (
              <FeedCard key={item.id} item={item} onClick={() => onItemClick(item)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface Props {
  feedItems: ActivityFeedRow[]
  /** 배지 상세 링크에 덧붙일 쿼리스트링. 예: `?u=username`. 기본값 없음 */
  badgeLinkQuery?: string
  title?: string
  /**
   * 활동 묶음 카드 헤더에 쓸 활동 이름 맵. 키는 `strava_activity_id`의 문자열.
   * 옵셔널이다 — 안 넘기면 묶음은 이름 없이 헤드라인만으로 그려진다.
   */
  activityNames?: Record<string, string>
}

export default function FeedSection({ feedItems, badgeLinkQuery = '', title = d.feed.title, activityNames }: Props) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)
  // 상세 시트는 닫힘 트랜지션(Panel reveal) 동안 DOM에 남아야 하므로
  // "열림 여부"와 "마운트 여부(selectedItem)"를 분리한다.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const handleSheetClosed = useCallback(() => setSelectedItem(null), [])

  // 필터 → 묶음 순서를 지킨다. 묶음은 표현 계층이라 필터 결과 안에서만 성립한다.
  const filtered = feedItems.filter((f) => matchesFilter(f, activeFilter))
  const entries = buildFeedEntries(filtered)
  // 페이지네이션은 **묶음 카드 1개를 1개로** 센다(상단 카운트는 개별 이벤트 수 유지).
  const visible = entries.slice(0, visibleCount)
  const hasMore = entries.length > visibleCount

  const handleFilterChange = (tab: FilterTab) => {
    setActiveFilter(tab)
    setVisibleCount(PAGE_SIZE) // 탭 전환 시 페이지네이션 초기화
  }

  const handleCardClick = (item: ActivityFeedRow) => {
    if (MISSION_EVENTS.has(item.event_type)) {
      const meta = item.metadata as Record<string, string>
      if (meta.mission_id) { router.push(`/missions/${meta.mission_id}`); return }
    }
    setSelectedItem(item)
    setSheetOpen(true)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--spacing-16)]">
        <h2 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text">{title}</h2>
        <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">
          {t(d.common.countItems, { count: filtered.length })}
        </span>
      </div>
      {/* 필터 탭 — Tabs sliding (16-tabs-sliding.md) */}
      <div className="mb-[var(--spacing-16)]">
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
          <div className="flex flex-col gap-[var(--spacing-8)]">
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
            <Button
              variant="outline"
              surface="main"
              fullWidth
              className="mt-[var(--spacing-16)]"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              {d.common.loadMore}
            </Button>
          )}
        </>
      )}
      {selectedItem && (
        <DetailSheet
          item={selectedItem}
          open={sheetOpen}
          onClose={closeSheet}
          onClosed={handleSheetClosed}
          badgeLinkQuery={badgeLinkQuery}
        />
      )}
    </section>
  )
}
