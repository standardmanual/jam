'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'
import { formatRelativeTime } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
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

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: d.feed.filterAll },
  { key: 'badge', label: d.feed.filterItem },
  { key: 'mission', label: d.feed.filterMission },
  { key: 'activity_badge', label: d.feed.filterActivityBadge },
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
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 */
const RARITY_COLOR: Record<string, string> = {
  rare: 'text-jam-teal shadow-[inset_0_0_0_1px_var(--color-jam-teal)]',
  legendary: 'text-jam-purple shadow-[inset_0_0_0_1px_var(--color-jam-purple)]',
  mythic: 'text-jam-yellow shadow-[inset_0_0_0_1px_var(--color-jam-yellow)]',
}
const RARITY_LABEL: Record<string, string> = {
  common: d.feed.rarityCommon,
  rare: d.feed.rarityRare,
  legendary: d.feed.rarityLegendary,
  mythic: d.feed.rarityMythic,
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

export function DetailSheet({ item, onClose, badgeLinkQuery }: { item: ActivityFeedRow; onClose: () => void; badgeLinkQuery: string }) {
  const router = useRouter()
  const meta = item.metadata as Record<string, string | number | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const isBadgeEvent = BADGE_EVENTS.has(item.event_type) && Boolean(meta.badge_id)
  const rawBadgeNames = (item.metadata as Record<string, unknown>).awarded_badge_names
  const missionBadgeNames = Array.isArray(rawBadgeNames) ? (rawBadgeNames as string[]) : []

  return (
    <>
      <div className="fixed inset-0 bg-surface/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 bg-surface-inverse text-text-inverse rounded-t-[var(--radius-cards)] shadow-[inset_0_1px_0_0_var(--color-border-inverse)] px-[var(--spacing-24)] pt-[var(--spacing-16)] pb-[calc(env(safe-area-inset-bottom)+var(--spacing-32))]">
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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={badgeImage} alt={title} className="w-28 h-28 rounded-[var(--radius-cards)] object-cover shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
          ) : (
            <div className="w-28 h-28 rounded-[var(--radius-cards)] bg-surface text-text flex items-center justify-center">
              <EventIcon type={item.event_type} className="w-12 h-12" />
            </div>
          )}
        </div>
        <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mb-1">{EVENT_LABEL[item.event_type]}</p>
        <h2 className="text-center text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text-inverse mb-[var(--spacing-16)]">{title}</h2>
        {rarity && RARITY_COLOR[rarity] && (
          <div className="flex justify-center mb-[var(--spacing-16)]">
            <span className={`text-[length:var(--text-body-sm)] px-[var(--spacing-16)] py-1 rounded-[var(--radius-tags)] ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
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
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-inverse text-text-inverse rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] p-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] min-h-11 active:scale-[0.98] transition-transform duration-100 cursor-pointer"
    >
      {badgeImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badgeImage} alt={title} className="w-11 h-11 rounded-[var(--radius-cards)] object-cover shrink-0 shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
      ) : (
        <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-surface text-text flex items-center justify-center shrink-0">
          <EventIcon type={item.event_type} className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 truncate">{EVENT_LABEL[item.event_type]}</p>
        <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse truncate">{title}</p>
        {sub && <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 truncate">{sub}</p>}
        <span className="inline-flex items-center gap-[var(--spacing-8)] mt-1">
          {rarity && RARITY_COLOR[rarity] && (
            <span className={`inline-block text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
          )}
          {isLastPiece && (
            <span className="inline-flex items-center gap-1 text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-surface text-text">
              <PuzzleIcon className="w-3 h-3" />
              {d.feed.lastPiece}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{formatRelativeTime(item.event_at)}</span>
        <ChevronRightIcon className="w-4 h-4 text-text-inverse/40" />
      </div>
    </button>
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--spacing-16)]">
        <h2 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text">{title}</h2>
        <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">
          {t(d.common.countItems, { count: filtered.length })}
        </span>
      </div>
      <div className="flex gap-[var(--spacing-8)] mb-[var(--spacing-16)]">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            aria-pressed={activeFilter === key}
            className={[
              'flex-1 min-h-11 px-2 rounded-[var(--radius-nav-buttons)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]',
              'transition-transform duration-100 active:scale-95 cursor-pointer',
              activeFilter === key
                ? 'bg-surface-inverse text-text-inverse'
                : 'text-text shadow-[inset_0_0_0_1px_var(--color-border)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
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
      {selectedItem && <DetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} badgeLinkQuery={badgeLinkQuery} />}
    </section>
  )
}
