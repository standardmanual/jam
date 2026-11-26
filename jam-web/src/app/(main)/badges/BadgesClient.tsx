'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import { BADGE_ACTIVITY_FILTER_LABELS } from '@/lib/utils'
import { matchesActivityFilter, type ActivityFilterValue } from './activityFilter'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { FIRST_SCREEN_GRID_COUNT } from '@/lib/imageSrc'
import CollectionGridCard from '@/components/ui/CollectionGridCard'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import { MedalIcon, PinIcon, MagicBookIcon } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { d } from '@/lib/i18n'
import { RARITY_LABEL } from '@/lib/rarity'
import { buildQueryHref, currentQuerySource, readEnumParam, readSingleParam, replaceUrlQuery } from '@/lib/urlQueryState'

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

const ACTIVITY_TYPE_ORDER: ActivityFilterValue[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking', 'common']
const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 체크인 배지 — 산/지하철역 등 지점을 지나며 획득하는 배지. 반복 획득 가능. */
export interface CheckinBadgeItem {
  badge: BadgeRow
  /** 연결된 지점(POI)의 category slug (예: mountain, train_subway) */
  category: string
  /** 어드민이 관리하는 카테고리 한글 라벨 (예: 산, 기차/지하철) */
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
  /** 내가 장착한 배지의 등급(낮은 등급부터, 중복 없음). 카드가 Common은 그리지 않는다(티켓 20261117_1856) */
  rarities: BadgeRarity[]
}

interface BadgesClientProps {
  /** 획득한 액티비티 배지만 전달된다(티켓 20260901_0911). 받지 않은 배지는 상세에서 조건을 본다 */
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
      {count > 0 && <span className="text-base tabular-nums font-bold text-link [[aria-selected=true]_&]:text-inherit">{count}</span>}
    </span>
  )
}

type CheckinSortOrder = 'latest' | 'name'
const DEFAULT_TAB: TabKey = 'activity'
const CHECKIN_SORT_ORDERS: readonly CheckinSortOrder[] = ['latest', 'name']
const ACTIVITY_FILTER_VALUES: readonly (ActivityFilterValue | 'all')[] = ['all', ...ACTIVITY_TYPE_ORDER]
const RARITY_FILTER_VALUES: readonly (BadgeRarity | 'all')[] = ['all', ...RARITY_ORDER]

export default function BadgesClient({
  badges,
  itemBooks,
  itemBookProgress,
  checkinBadges,
  initialTab,
}: BadgesClientProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()

  const queryTab = normalizeTab(readSingleParam(searchParams, 'tab'))
  const queryActivity = readEnumParam(searchParams, 'activity', ACTIVITY_FILTER_VALUES, 'all')
  const queryRarity = readEnumParam(searchParams, 'rarity', RARITY_FILTER_VALUES, 'all')
  const queryCategory = readSingleParam(searchParams, 'category') ?? 'all'
  const querySort = readEnumParam(searchParams, 'sort', CHECKIN_SORT_ORDERS, 'latest')

  const [prevSearchKey, setPrevSearchKey] = useState(searchKey)
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // SSR과 클라이언트 첫 하이드레이션이 동일하도록 쿼리(?tab=)와 initialTab만 읽는다.
    // 구 해시 링크(/badges#collection 등)는 아래 마운트 이펙트에서 쿼리로 정규화한다(티켓 20261125_1136).
    return queryTab ?? normalizeTab(initialTab) ?? DEFAULT_TAB
  })
  const [activityFilter, setActivityFilter] = useState<ActivityFilterValue | 'all'>(() => queryActivity)
  const [rarityFilter, setRarityFilter] = useState<BadgeRarity | 'all'>(() => queryRarity)
  const [checkinCategoryFilter, setCheckinCategoryFilter] = useState<string>(() => queryCategory)
  const [checkinSortOrder, setCheckinSortOrder] = useState<CheckinSortOrder>(() => querySort)
  const progressMap = new Map(itemBookProgress.map((p) => [p.bookId, p]))

  // 뒤로가기·앞으로가기·탭바 재진입으로 searchParams가 바뀌면 탭과 필터를 주소에 맞춰 동기화한다
  if (prevSearchKey !== searchKey) {
    setPrevSearchKey(searchKey)
    setActiveTab(queryTab ?? DEFAULT_TAB)
    setActivityFilter(queryActivity)
    setRarityFilter(queryRarity)
    setCheckinCategoryFilter(queryCategory)
    setCheckinSortOrder(querySort)
  }

  // 구 해시 링크(/badges#collection, /badges#checkin, /badges#poi) 진입 시 쿼리 정본으로 정규화한다.
  // replaceUrlQuery가 useSearchParams()를 갱신하므로 위 searchKey 동기화가 활성 탭을 자동으로 맞춘다.
  useEffect(() => {
    const rawHash = window.location.hash.slice(1)
    const fromHash = normalizeTab(rawHash)
    if (!fromHash) return
    const nextTab = queryTab ?? fromHash
    replaceUrlQuery(
      buildQueryHref(pathname, currentQuerySource(searchParams), { tab: nextTab === DEFAULT_TAB ? null : nextTab }, ''),
    )
    // 마운트 시 구 해시 1회 정규화만 수행한다
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 실행해야 하므로 의존성을 비운다
  }, [])

  const updateUrl = (updates: Record<string, string | null>) => {
    replaceUrlQuery(buildQueryHref(pathname, currentQuerySource(searchParams), updates, ''))
  }

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key)
    // 다른 탭 전용 필터 쿼리는 정리해 주소를 깨끗하게 유지한다
    setActivityFilter('all')
    setRarityFilter('all')
    setCheckinCategoryFilter('all')
    setCheckinSortOrder('latest')
    updateUrl({
      tab: key === DEFAULT_TAB ? null : key,
      activity: null,
      rarity: null,
      category: null,
      sort: null,
    })
  }

  const handleActivityFilterChange = (next: ActivityFilterValue | 'all') => {
    setActivityFilter(next)
    updateUrl({ activity: next === 'all' ? null : next })
  }

  const handleRarityFilterChange = (next: BadgeRarity | 'all') => {
    setRarityFilter(next)
    updateUrl({ rarity: next === 'all' ? null : next })
  }

  const handleCheckinCategoryChange = (next: string) => {
    setCheckinCategoryFilter(next)
    updateUrl({ category: next === 'all' ? null : next })
  }

  const handleCheckinSortChange = (next: CheckinSortOrder) => {
    setCheckinSortOrder(next)
    updateUrl({ sort: next === 'latest' ? null : next })
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

  const validCheckinCategory =
    checkinCategoryFilter === 'all' || checkinCategoryOptions.some(([slug]) => slug === checkinCategoryFilter)
      ? checkinCategoryFilter
      : 'all'

  // 액티비티 배지 탭과 동일한 패턴 — 드롭다운 2개(카테고리, 정렬)로 필터링한
  // 평평한 그리드. 최신순은 가장 최근에 획득한 것부터, 이름순은 가나다순.
  const filteredCheckinBadges = useMemo(() => {
    const filtered = earnedCheckinBadges.filter(
      (item) => validCheckinCategory === 'all' || item.category === validCheckinCategory
    )
    const sorted = [...filtered]
    if (checkinSortOrder === 'latest') {
      sorted.sort((a, b) => new Date(b.latestEarnedAt!).getTime() - new Date(a.latestEarnedAt!).getTime())
    } else {
      sorted.sort((a, b) => a.badge.name.localeCompare(b.badge.name, 'ko'))
    }
    return sorted
  }, [earnedCheckinBadges, validCheckinCategory, checkinSortOrder])

  // 이제 badges는 획득분만 들어오며, 서버 쿼리가 이미 earned_at 내림차순으로 정렬해
  // 온다(page.tsx) — 클라이언트에서 다시 정렬할 필요가 없다.
  const filteredActivityBadges = badges.filter(({ badge }) => {
    // «공통»은 activity_types가 빈 모든 배지다 — 종목 배지와 겹치지 않는다(activityFilter.ts)
    if (!matchesActivityFilter(badge.activity_types, activityFilter)) return false
    if (rarityFilter !== 'all' && badge.rarity !== rarityFilter) return false
    return true
  })

  return (
    <div className="min-h-full text-foreground">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo logoText={d.badges.title} />

      {/* 20261031_1821: 보이는 타이틀은 없애고, 스크린리더용 페이지 제목만 남긴다 */}
      <h1 className="sr-only">{d.badges.title}</h1>

      {/* 탭 헤더 — Tabs sliding (16-tabs-sliding.md) */}
      <div className="px-4 py-4">
        <SlidingTabs
          items={tabs}
          value={activeTab}
          onChange={handleTabChange}
          outlined={false}
          aria-label={d.badges.title}
        />
      </div>

      <div className="px-4 pb-6">
        {/* 액티비티 배지 탭 */}
        {activeTab === 'activity' && (
          badges.length > 0 ? (
            <>
              {/* 필터 드롭다운 */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 min-w-0">
                  <Select
                    value={activityFilter}
                    onChange={(e) => handleActivityFilterChange(e.target.value as ActivityFilterValue | 'all')}
                    options={[
                      { value: 'all', label: d.badges.filterActivityAll },
                      ...ACTIVITY_TYPE_ORDER.map((tp) => ({ value: tp, label: BADGE_ACTIVITY_FILTER_LABELS[tp] ?? tp })),
                    ]}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Select
                    value={rarityFilter}
                    onChange={(e) => handleRarityFilterChange(e.target.value as BadgeRarity | 'all')}
                    options={[
                      { value: 'all', label: d.badges.filterRarityAll },
                      ...RARITY_ORDER.map((r) => ({ value: r, label: RARITY_LABEL[r] })),
                    ]}
                  />
                </div>
              </div>

              {filteredActivityBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {filteredActivityBadges.map(({ badge, earned }, index) => (
                    <BadgeGridCard
                      key={badge.id}
                      href={`/badges/${badge.id}`}
                      name={badge.name}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                      eager={index < FIRST_SCREEN_GRID_COUNT}
                      // 무한레벨형 배지(등급 없음)는 등급 칩 자리에 Lv.N 칩을 그린다(2026-11-09 사용자 지시)
                      level={badge.level}
                      // Common 배지도 칩으로 알린다(2026-11-09 사용자 지시) — 다른 화면의 «Common 칩 없음» 규약은 그대로다
                      showCommonChip
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
              <div className="flex gap-2 mb-4">
                <div className="flex-1 min-w-0">
                  <Select
                    value={validCheckinCategory}
                    onChange={(e) => handleCheckinCategoryChange(e.target.value)}
                    options={[
                      { value: 'all', label: d.badges.filterCheckinCategoryAll },
                      ...checkinCategoryOptions.map(([slug, label]) => ({ value: slug, label })),
                    ]}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Select
                    value={checkinSortOrder}
                    onChange={(e) => handleCheckinSortChange(e.target.value as CheckinSortOrder)}
                    options={[
                      { value: 'latest', label: d.badges.sortCheckinLatest },
                      { value: 'name', label: d.badges.sortCheckinName },
                    ]}
                  />
                </div>
              </div>

              {filteredCheckinBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {filteredCheckinBadges.map(({ badge, earnCount }, index) => (
                    <BadgeGridCard
                      key={badge.id}
                      href={`/badges/${badge.id}`}
                      name={badge.name}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                      eager={index < FIRST_SCREEN_GRID_COUNT}
                      // 이름 아래에 «×방문 횟수» 칩(2026-11-09 사용자 지시)
                      visitCount={earnCount}
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
            <div className="grid grid-cols-2 gap-2">
              {itemBooks.map((book) => {
                const progress = progressMap.get(book.id) ?? { owned: 0, total: 1, completed: false, rarities: [] as BadgeRarity[] }
                return (
                  <CollectionGridCard
                    key={book.id}
                    href={`/collections/${book.id}?from=badges`}
                    name={book.name}
                    imageUrl={book.image_url ?? null}
                    collected={progress.owned}
                    total={progress.total}
                    completed={progress.completed}
                    rarities={progress.rarities}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState icon={<MagicBookIcon className="w-8 h-8" />} title={d.badges.emptyItembookTitle} description={d.badges.emptyItembookBody} />
          )
        )}
      </div>
    </div>
  )
}
