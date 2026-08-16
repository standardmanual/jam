'use client'

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'
import { formatRelativeTime } from '@/lib/utils'
import { cssDurationMs } from '@/lib/motion'
import { d, t } from '@/lib/i18n'
import { RARITY_LABEL, RARITY_COLOR } from '@/lib/rarity'
import Card from '@/components/ui/Card'
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
  CloseIcon,
  ChevronRightIcon,
} from '@/components/ui/icons'

const PAGE_SIZE = 20

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

const EVENT_LABEL: Record<ActivityFeedEventType, string> = {
  badge_earned: d.feed.eventBadgeEarned,
  item_dropped: d.feed.eventItemDropped,
  item_picked_up: d.feed.eventItemPickedUp,
  mission_joined: d.feed.eventMissionJoined,
  mission_completed: d.feed.eventMissionCompleted,
  mission_cancelled: d.feed.eventMissionCancelled,
}

/**
 * item_dropped는 두 가지 출처를 하나의 이벤트 타입으로 공유한다:
 * - 활동 연동(Strava) 후 드랍엔진이 지급한 경우 → faction_name이 항상 채워짐 → "아이템 획득"
 * - POI에 아이템배지를 직접 드랍한 경우(레거시 poi_drops 동기화) → faction_name 없음 → "아이템 드랍"
 */
function eventLabel(item: ActivityFeedRow): string {
  if (item.event_type === 'item_dropped') {
    const meta = item.metadata as Record<string, unknown>
    return meta.faction_name ? d.feed.eventItemEarned : d.feed.eventItemDropped
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
      <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{label}</span>
      <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse text-right max-w-[60%]">{value}</span>
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
        className="t-panel-slide relative w-full max-w-[430px] bg-surface-inverse text-text-inverse rounded-t-[var(--radius-cards)] shadow-[inset_0_1px_0_0_var(--color-border-inverse)] px-[var(--spacing-24)] pt-[var(--spacing-16)] pb-[calc(env(safe-area-inset-bottom)+var(--spacing-32))]"
        data-open={shown}
        style={{ '--panel-translate-y': '100%' } as CSSProperties}
      >
        <button
          onClick={onClose}
          aria-label={d.common.close}
          className="absolute top-[var(--spacing-8)] right-[var(--spacing-16)] w-11 h-11 rounded-[var(--radius-nav-buttons)] flex items-center justify-center text-text-inverse active:scale-90 transition-transform duration-100"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
        <div className="w-10 h-1 bg-surface/20 rounded-full mx-auto mb-[var(--spacing-24)]" />
        <div className="flex justify-center mb-[var(--spacing-16)]">
          {badgeImage ? (
            <Image src={badgeImage} alt={title} width={112} height={112} className="w-28 h-28 rounded-[var(--radius-cards)] object-cover shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
          ) : (
            <div className="w-28 h-28 rounded-[var(--radius-cards)] bg-surface text-text flex items-center justify-center">
              <EventIcon type={item.event_type} className="w-12 h-12" />
            </div>
          )}
        </div>
        <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mb-1">{eventLabel(item)}</p>
        <h2 className="text-center text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text-inverse mb-[var(--spacing-16)]">{title}</h2>
        {rarity && RARITY_COLOR[rarity] && (
          <div className="flex justify-center mb-[var(--spacing-16)]">
            <span className={`text-[length:var(--text-body-sm)] px-[var(--spacing-16)] py-1 rounded-[var(--radius-tags)] font-bold uppercase tracking-[var(--tracking-label)] ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
          </div>
        )}
        <div className="rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] px-[var(--spacing-16)] py-[var(--spacing-8)] mb-[var(--spacing-24)]">
          {(item.event_type === 'item_dropped' || item.event_type === 'item_picked_up') && meta.poi_name && (
            <Row label={d.feed.rowPlace} value={String(meta.poi_name)} />
          )}
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
            <Row label={d.feed.rowRewardPoints} value={t(d.feed.pointsValue, { points: String(meta.reward_points) })} />
          )}
          {item.event_type === 'badge_earned' && typeof meta.point_reward === 'number' && meta.point_reward > 0 && (
            <Row label={d.feed.rowPoints} value={t(d.feed.pointsGained, { points: Number(meta.point_reward).toLocaleString('ko-KR') })} />
          )}
          <Row label={d.feed.rowDate} value={formatFullDate(item.event_at)} />
        </div>
        {isBadgeEvent ? (
          <Button
            surface="sub"
            variant="primary"
            fullWidth
            onClick={() => router.push(`/badges/${meta.badge_id}${badgeLinkQuery}`)}
          >
            {d.common.detail}
          </Button>
        ) : (
          <Button surface="sub" variant="primary" fullWidth onClick={onClose}>
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
    if (item.event_type === 'mission_completed' && meta.reward_points) return t(d.feed.rewardPoints, { points: String(meta.reward_points) })
    return null
  })()
  const isLastPiece = item.event_type === 'item_dropped' && meta.is_last_piece === true

  return (
    <ListRowCard
      onClick={onClick}
      icon={
        badgeImage ? (
          <Image src={badgeImage} alt={title} width={40} height={40} className="w-10 h-10 rounded-[var(--radius-cards)] object-cover shadow-[inset_0_0_0_1px_var(--color-border)]" />
        ) : (
          <div className="w-10 h-10 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center">
            <EventIcon type={item.event_type} className="w-5 h-5 text-text" />
          </div>
        )
      }
      trailing={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{formatRelativeTime(item.event_at)}</span>
          <ChevronRightIcon className="w-4 h-4 text-text/40" />
        </div>
      }
    >
      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 truncate">{eventLabel(item)}</p>
      <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text truncate">{title}</p>
      {sub && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 truncate">{sub}</p>}
      <span className="inline-flex items-center gap-[var(--spacing-8)] mt-1">
        {rarity && RARITY_COLOR[rarity] && (
          <span className={`inline-block text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] font-bold uppercase tracking-[var(--tracking-label)] ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
        )}
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

interface Props {
  feedItems: ActivityFeedRow[]
  /** 배지 상세 링크에 덧붙일 쿼리스트링. 예: `?u=username`. 기본값 없음 */
  badgeLinkQuery?: string
  title?: string
}

export default function FeedSection({ feedItems, badgeLinkQuery = '', title = d.feed.title }: Props) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)
  // 상세 시트는 닫힘 트랜지션(Panel reveal) 동안 DOM에 남아야 하므로
  // "열림 여부"와 "마운트 여부(selectedItem)"를 분리한다.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const handleSheetClosed = useCallback(() => setSelectedItem(null), [])

  const filtered = feedItems.filter((f) => matchesFilter(f, activeFilter))
  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

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
        <Card className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-40)]">
          <InboxIcon className="w-8 h-8 text-text-inverse/40" />
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.feed.emptyTitle}</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            {visible.map(item => (
              <FeedCard key={item.id} item={item} onClick={() => handleCardClick(item)} />
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
