'use client'

import { useEffect, useMemo, useState } from 'react'
import { ActivityType, BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import CollectionGridCard from '@/components/ui/CollectionGridCard'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import { MedalIcon, PinIcon, BookIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d } from '@/lib/i18n'
import { RARITY_LABEL } from '@/lib/rarity'

type TabKey = 'activity' | 'poi' | 'itembook'
const VALID_TABS = new Set<string>(['activity', 'poi', 'itembook'])

const ACTIVITY_TYPE_ORDER: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'legend', 'mythic']
const RARITY_RANK: Record<BadgeRarity, number> = { common: 0, rare: 1, legend: 2, mythic: 3 }

function activitySortIndex(types: ActivityType[]): number {
  const idx = ACTIVITY_TYPE_ORDER.indexOf(types[0])
  return idx === -1 ? ACTIVITY_TYPE_ORDER.length : idx
}

/** 장소(POI) 배지 — 산/지하철 등 방문해서 획득하는 배지. 반복 획득 가능. */
export interface PoiBadgeItem {
  badge: BadgeRow
  /** 연결된 POI의 category slug (예: mountain, transit) */
  category: string
  /** 어드민이 관리하는 카테고리 한글 라벨 (예: 산, 대중교통) */
  categoryLabel: string
  /** 획득 횟수 — 0이면 미획득 */
  earnCount: number
  /** 가장 최근 획득 시각 — 미획득이면 null */
  latestEarnedAt: string | null
}

export interface ItemBookProgress {
  bookId: string
  owned: number
  total: number
  completed: boolean
  rarity: BadgeRarity
}

interface BadgesClientProps {
  badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow | null }>
  itemBooks: ItemBookRow[]
  itemBookProgress: ItemBookProgress[]
  poiBadges: PoiBadgeItem[]
}


function tabLabel(label: string, count: number) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count > 0 && <span className="text-[length:var(--text-body-sm)] tabular-nums font-bold text-[color:var(--color-primary)]">{count}</span>}
    </span>
  )
}

type PoiSortOrder = 'latest' | 'name'

export default function BadgesClient({ badges, itemBooks, itemBookProgress, poiBadges }: BadgesClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1)
      if (VALID_TABS.has(hash)) return hash as TabKey
    }
    return 'activity'
  })
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [rarityFilter, setRarityFilter] = useState<BadgeRarity | 'all'>('all')
  const [poiCategoryFilter, setPoiCategoryFilter] = useState<string>('all')
  const [poiSortOrder, setPoiSortOrder] = useState<PoiSortOrder>('latest')
  const progressMap = new Map(itemBookProgress.map((p) => [p.bookId, p]))

  // 브라우저 뒤로/앞으로 탐색 시 hash 변화를 탭에 반영
  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.slice(1)
      if (VALID_TABS.has(hash)) setActiveTab(hash as TabKey)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key)
    window.history.replaceState(null, '', `#${key}`)
  }

  const earnedCount = badges.filter((b) => b.earned).length
  const poiEarnedCount = poiBadges.filter((p) => p.earnCount > 0).length

  // 슬라이딩 탭 — 라벨 옆에 보유/전체 카운트를 함께 노출
  const tabs: SlidingTabItem<TabKey>[] = [
    { key: 'activity', label: tabLabel(d.badges.tabActivity, earnedCount), ariaLabel: d.badges.tabActivity },
    { key: 'poi', label: tabLabel(d.badges.tabPoi, poiEarnedCount), ariaLabel: d.badges.tabPoi },
    { key: 'itembook', label: tabLabel(d.badges.tabItembook, itemBooks.length), ariaLabel: d.badges.tabItembook },
  ]

  // 획득한 것만 보여준다 — 미획득 배지는 노출하지 않음(전국 산/지하철역 배지가
  // 워낙 많아 미획득까지 보여주면 도감이 아니라 노이즈가 됨). 반복 발급 횟수는
  // 여기서 세지 않고 배지 상세화면의 발급 이력에서 확인.
  const earnedPoiBadges = useMemo(() => poiBadges.filter((p) => p.earnCount > 0), [poiBadges])

  // 카테고리 드롭다운 옵션 — 실제로 획득한 배지에 존재하는 카테고리만, 라벨 가나다순
  const poiCategoryOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of earnedPoiBadges) {
      if (!seen.has(item.category)) seen.set(item.category, item.categoryLabel)
    }
    return Array.from(seen.entries()).sort(([, a], [, b]) => a.localeCompare(b, 'ko'))
  }, [earnedPoiBadges])

  // 액티비티 배지 탭과 동일한 패턴 — 드롭다운 2개(카테고리, 정렬)로 필터링한
  // 평평한 그리드. 최신순은 가장 최근에 획득한 것부터, 이름순은 가나다순.
  const filteredPoiBadges = useMemo(() => {
    const filtered = earnedPoiBadges.filter(
      (item) => poiCategoryFilter === 'all' || item.category === poiCategoryFilter
    )
    const sorted = [...filtered]
    if (poiSortOrder === 'latest') {
      sorted.sort((a, b) => new Date(b.latestEarnedAt!).getTime() - new Date(a.latestEarnedAt!).getTime())
    } else {
      sorted.sort((a, b) => a.badge.name.localeCompare(b.badge.name, 'ko'))
    }
    return sorted
  }, [earnedPoiBadges, poiCategoryFilter, poiSortOrder])

  // 획득한 것부터(획득 최신순), 미획득은 같은 액티비티끼리 모아 이름순 → 등급 낮은순.
  // 화면에 별도 구간 헤더로 나누진 않고 정렬 순서로만 배치한다.
  const sortedActivityBadges = useMemo(() => {
    const earned = badges.filter((b) => b.earned)
    const unearned = badges.filter((b) => !b.earned)

    earned.sort((a, b) => new Date(b.earned!.earned_at).getTime() - new Date(a.earned!.earned_at).getTime())
    unearned.sort((a, b) => {
      const activityDiff = activitySortIndex(a.badge.activity_types) - activitySortIndex(b.badge.activity_types)
      if (activityDiff !== 0) return activityDiff
      const nameDiff = a.badge.name.localeCompare(b.badge.name, 'ko')
      if (nameDiff !== 0) return nameDiff
      return RARITY_RANK[a.badge.rarity] - RARITY_RANK[b.badge.rarity]
    })

    return [...earned, ...unearned]
  }, [badges])

  const filteredActivityBadges = sortedActivityBadges.filter(({ badge }) => {
    if (activityFilter !== 'all' && !badge.activity_types.includes(activityFilter)) return false
    if (rarityFilter !== 'all' && badge.rarity !== rarityFilter) return false
    return true
  })

  return (
    <div className="min-h-full bg-surface text-text">
      {/* 헤더 — 인벤토리/미션과 동일한 크기의 타이틀 */}
      <div className="px-[var(--spacing-16)] pt-[calc(env(safe-area-inset-top)+var(--spacing-24))]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.badges.title}</h1>
      </div>

      {/* 탭 헤더 — Tabs sliding (16-tabs-sliding.md) */}
      <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
        <SlidingTabs
          items={tabs}
          value={activeTab}
          onChange={handleTabChange}
          outlined={false}
          aria-label={d.badges.title}
        />
      </div>

      <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)]">
        {/* 액티비티 배지 탭 */}
        {activeTab === 'activity' && (
          badges.length > 0 ? (
            <>
              {/* 필터 드롭다운 */}
              <div className="flex gap-2 mb-[var(--spacing-16)]">
                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value as ActivityType | 'all')}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="all">{d.badges.filterActivityAll}</option>
                  {ACTIVITY_TYPE_ORDER.map((tp) => (
                    <option key={tp} value={tp}>{ACTIVITY_TYPE_LABELS[tp] ?? tp}</option>
                  ))}
                </select>
                <select
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value as BadgeRarity | 'all')}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="all">{d.badges.filterRarityAll}</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>{RARITY_LABEL[r]}</option>
                  ))}
                </select>
              </div>

              {filteredActivityBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {filteredActivityBadges.map(({ badge, earned }) => (
                    <BadgeGridCard
                      key={badge.id}
                      href={`/badges/${badge.id}`}
                      name={badge.name}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                      earned={!!earned}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<MedalIcon className="w-8 h-8" />} title={d.badges.emptyActivityTitle} description={d.badges.emptyActivityBody} />
              )}
            </>
          ) : (
            <EmptyState icon={<MedalIcon className="w-8 h-8" />} title={d.badges.emptyActivityTitle} description={d.badges.emptyActivityBody} />
          )
        )}

        {/* 장소(POI) 배지 탭 — 획득한 배지만 노출. 반복 발급 이력은 배지 상세화면에서 확인 */}
        {activeTab === 'poi' && (
          earnedPoiBadges.length > 0 ? (
            <>
              {/* 필터 드롭다운 — 액티비티 탭과 동일한 패턴 */}
              <div className="flex gap-2 mb-[var(--spacing-16)]">
                <select
                  value={poiCategoryFilter}
                  onChange={(e) => setPoiCategoryFilter(e.target.value)}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="all">{d.badges.filterPoiCategoryAll}</option>
                  {poiCategoryOptions.map(([slug, label]) => (
                    <option key={slug} value={slug}>{label}</option>
                  ))}
                </select>
                <select
                  value={poiSortOrder}
                  onChange={(e) => setPoiSortOrder(e.target.value as PoiSortOrder)}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="latest">{d.badges.sortPoiLatest}</option>
                  <option value="name">{d.badges.sortPoiName}</option>
                </select>
              </div>

              {filteredPoiBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {filteredPoiBadges.map(({ badge }) => (
                    <BadgeGridCard
                      key={badge.id}
                      href={`/badges/${badge.id}`}
                      name={badge.name}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<PinIcon className="w-8 h-8" />} title={d.badges.emptyPoiTitle} description={d.badges.emptyPoiBody} />
              )}
            </>
          ) : (
            <EmptyState icon={<PinIcon className="w-8 h-8" />} title={d.badges.emptyPoiTitle} description={d.badges.emptyPoiBody} />
          )
        )}

        {/* 컬렉션 탭 */}
        {activeTab === 'itembook' && (
          itemBooks.length > 0 ? (
            <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
              {itemBooks.map((book) => {
                const progress = progressMap.get(book.id) ?? { owned: 0, total: 1, completed: false, rarity: 'common' as BadgeRarity }
                return (
                  <CollectionGridCard
                    key={book.id}
                    href={`/collections/${book.id}?from=badges`}
                    name={book.name}
                    imageUrl={book.image_url ?? null}
                    collected={progress.owned}
                    total={progress.total}
                    completed={progress.completed}
                    rarity={progress.rarity}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState icon={<BookIcon className="w-8 h-8" />} title={d.badges.emptyItembookTitle} description={d.badges.emptyItembookBody} />
          )
        )}
      </div>
    </div>
  )
}
