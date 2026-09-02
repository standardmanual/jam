'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ActivityType, BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import CollectionGridCard from '@/components/ui/CollectionGridCard'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import { MedalIcon, PinIcon, BookIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d } from '@/lib/i18n'
import { RARITY_LABEL } from '@/lib/rarity'

type TabKey = 'activity' | 'checkin' | 'collection'
const VALID_TABS = new Set<string>(['activity', 'checkin', 'collection'])

/**
 * 구 탭 식별자 → 신 식별자 (티켓 20260826_004).
 *
 * `?tab=poi`·`#poi`는 이미 발송된 알림 링크와 유저가 공유한 주소에 남아 있다.
 * 브라우저 주소창에 노출·공유되는 값은 공개 URL과 동일하게 취급해 **영구 호환**한다
 * (선례 20260821_002가 해시 식별자를 놓쳐 후속 작업이 발생했다).
 */
const LEGACY_TAB_ALIASES: Record<string, TabKey> = { poi: 'checkin' }

/** 쿼리·해시로 들어온 값을 유효한 탭 키로 정규화한다. 모르는 값이면 null */
function normalizeTab(raw: string | undefined | null): TabKey | null {
  if (!raw) return null
  if (VALID_TABS.has(raw)) return raw as TabKey
  return LEGACY_TAB_ALIASES[raw] ?? null
}

const ACTIVITY_TYPE_ORDER: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 체크인 배지 — 산/지하철역 등 지점을 지나며 획득하는 배지. 반복 획득 가능. */
export interface CheckinBadgeItem {
  badge: BadgeRow
  /** 연결된 지점(POI)의 category slug (예: mountain, transit) */
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
  /** 획득한 액티비티 배지만 전달된다(티켓 20260901_0911) — 미획득분은 /badges/tree가 전담 */
  badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }>
  itemBooks: ItemBookRow[]
  itemBookProgress: ItemBookProgress[]
  checkinBadges: CheckinBadgeItem[]
  /** `?tab=` — 알림함 착지 시 열어둘 탭. hash보다 우선한다 (20260824_021) */
  initialTab?: string
}


function tabLabel(label: string, count: number) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count > 0 && <span className="text-[length:var(--text-body-sm)] tabular-nums font-bold text-[color:var(--color-primary)]">{count}</span>}
    </span>
  )
}

type CheckinSortOrder = 'latest' | 'name'

export default function BadgesClient({
  badges,
  itemBooks,
  itemBookProgress,
  checkinBadges,
  initialTab,
}: BadgesClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // 쿼리(?tab=)가 hash보다 우선한다 — 알림 착지점이 이 쿼리로 탭을 전달하기 때문
    const fromQuery = normalizeTab(initialTab)
    if (fromQuery) return fromQuery
    if (typeof window !== 'undefined') {
      const fromHash = normalizeTab(window.location.hash.slice(1))
      if (fromHash) return fromHash
    }
    return 'activity'
  })
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [rarityFilter, setRarityFilter] = useState<BadgeRarity | 'all'>('all')
  const [checkinCategoryFilter, setCheckinCategoryFilter] = useState<string>('all')
  const [checkinSortOrder, setCheckinSortOrder] = useState<CheckinSortOrder>('latest')
  const progressMap = new Map(itemBookProgress.map((p) => [p.bookId, p]))

  // 브라우저 뒤로/앞으로 탐색 시 hash 변화를 탭에 반영
  useEffect(() => {
    const onPopState = () => {
      const fromHash = normalizeTab(window.location.hash.slice(1))
      if (fromHash) setActiveTab(fromHash)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key)
    window.history.replaceState(null, '', `#${key}`)
  }

  // 탭이 URL 해시로 열린 상태(예: /badges#checkin)에서 배지 상세로 이동하면, Next 클라이언트
  // 라우팅이 pathname만 바꾸고 기존 해시는 지우지 않아 /badges/{id}#checkin이 남는다.
  // 이동 직전에 해시를 제거한다 (20260902_0923, 20260902_0915와 동일 패턴).
  const clearHashOnNavigate = () => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  // badges는 이미 획득분만 전달되므로 개수가 곧 보유 개수
  const earnedCount = badges.length
  const checkinEarnedCount = checkinBadges.filter((p) => p.earnCount > 0).length

  // 슬라이딩 탭 — 라벨 옆에 보유/전체 카운트를 함께 노출
  const tabs: SlidingTabItem<TabKey>[] = [
    { key: 'activity', label: tabLabel(d.badges.tabActivity, earnedCount), ariaLabel: d.badges.tabActivity },
    { key: 'checkin', label: tabLabel(d.badges.tabCheckin, checkinEarnedCount), ariaLabel: d.badges.tabCheckin },
    { key: 'collection', label: tabLabel(d.badges.tabItembook, itemBooks.length), ariaLabel: d.badges.tabItembook },
  ]

  // 획득한 것만 보여준다 — 미획득 배지는 노출하지 않음(전국 산/지하철역 배지가
  // 워낙 많아 미획득까지 보여주면 도감이 아니라 노이즈가 됨). 반복 발급 횟수는
  // 여기서 세지 않고 배지 상세화면의 발급 이력에서 확인.
  const earnedCheckinBadges = useMemo(() => checkinBadges.filter((p) => p.earnCount > 0), [checkinBadges])

  // 카테고리 드롭다운 옵션 — 실제로 획득한 배지에 존재하는 카테고리만, 라벨 가나다순
  const checkinCategoryOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of earnedCheckinBadges) {
      if (!seen.has(item.category)) seen.set(item.category, item.categoryLabel)
    }
    return Array.from(seen.entries()).sort(([, a], [, b]) => a.localeCompare(b, 'ko'))
  }, [earnedCheckinBadges])

  // 액티비티 배지 탭과 동일한 패턴 — 드롭다운 2개(카테고리, 정렬)로 필터링한
  // 평평한 그리드. 최신순은 가장 최근에 획득한 것부터, 이름순은 가나다순.
  const filteredCheckinBadges = useMemo(() => {
    const filtered = earnedCheckinBadges.filter(
      (item) => checkinCategoryFilter === 'all' || item.category === checkinCategoryFilter
    )
    const sorted = [...filtered]
    if (checkinSortOrder === 'latest') {
      sorted.sort((a, b) => new Date(b.latestEarnedAt!).getTime() - new Date(a.latestEarnedAt!).getTime())
    } else {
      sorted.sort((a, b) => a.badge.name.localeCompare(b.badge.name, 'ko'))
    }
    return sorted
  }, [earnedCheckinBadges, checkinCategoryFilter, checkinSortOrder])

  // 이제 badges는 획득분만 들어오며, 서버 쿼리가 이미 earned_at 내림차순으로 정렬해
  // 온다(page.tsx) — 클라이언트에서 다시 정렬할 필요가 없다.
  const filteredActivityBadges = badges.filter(({ badge }) => {
    if (activityFilter !== 'all' && !badge.activity_types.includes(activityFilter)) return false
    if (rarityFilter !== 'all' && badge.rarity !== rarityFilter) return false
    return true
  })

  return (
    <div className="min-h-full bg-surface text-text">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo headerStyle={{ background: 'var(--color-surface)' }} />

      {/* 헤더 — 인벤토리/미션과 동일한 크기의 타이틀. 우측 끝에 배지 트리 진입 버튼(요구사항 9) */}
      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] flex justify-between items-center gap-[var(--spacing-12)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.badges.title}</h1>
        <Link
          href="/badges/tree"
          className="inline-flex items-center justify-center shrink-0 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          {d.badges.treeButton}
        </Link>
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
                      onNavigate={clearHashOnNavigate}
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

        {/* 체크인 배지 탭 — 획득한 배지만 노출. 반복 발급 이력은 배지 상세화면에서 확인 */}
        {activeTab === 'checkin' && (
          earnedCheckinBadges.length > 0 ? (
            <>
              {/* 필터 드롭다운 — 액티비티 탭과 동일한 패턴 */}
              <div className="flex gap-2 mb-[var(--spacing-16)]">
                <select
                  value={checkinCategoryFilter}
                  onChange={(e) => setCheckinCategoryFilter(e.target.value)}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="all">{d.badges.filterCheckinCategoryAll}</option>
                  {checkinCategoryOptions.map(([slug, label]) => (
                    <option key={slug} value={slug}>{label}</option>
                  ))}
                </select>
                <select
                  value={checkinSortOrder}
                  onChange={(e) => setCheckinSortOrder(e.target.value as CheckinSortOrder)}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
                >
                  <option value="latest">{d.badges.sortCheckinLatest}</option>
                  <option value="name">{d.badges.sortCheckinName}</option>
                </select>
              </div>

              {filteredCheckinBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {filteredCheckinBadges.map(({ badge }) => (
                    <BadgeGridCard
                      key={badge.id}
                      href={`/badges/${badge.id}`}
                      onNavigate={clearHashOnNavigate}
                      name={badge.name}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<PinIcon className="w-8 h-8" />} title={d.badges.emptyCheckinTitle} description={d.badges.emptyCheckinBody} />
              )}
            </>
          ) : (
            <EmptyState icon={<PinIcon className="w-8 h-8" />} title={d.badges.emptyCheckinTitle} description={d.badges.emptyCheckinBody} />
          )
        )}

        {/* 컬렉션 탭 */}
        {activeTab === 'collection' && (
          itemBooks.length > 0 ? (
            <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
              {itemBooks.map((book) => {
                const progress = progressMap.get(book.id) ?? { owned: 0, total: 1, completed: false, rarity: 'common' as BadgeRarity }
                return (
                  <CollectionGridCard
                    key={book.id}
                    href={`/collections/${book.id}?from=badges`}
                    onNavigate={clearHashOnNavigate}
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
