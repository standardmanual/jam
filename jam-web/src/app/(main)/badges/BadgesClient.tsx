'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ActivityType, BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import { MedalIcon, ChevronRightIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

type TabKey = 'activity' | 'itembook'

const ACTIVITY_TYPE_ORDER: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'legendary', 'mythic']
const RARITY_RANK: Record<BadgeRarity, number> = { common: 0, rare: 1, legendary: 2, mythic: 3 }
const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: d.feed.rarityCommon,
  rare: d.feed.rarityRare,
  legendary: d.feed.rarityLegendary,
  mythic: d.feed.rarityMythic,
}

function activitySortIndex(types: ActivityType[]): number {
  const idx = ACTIVITY_TYPE_ORDER.indexOf(types[0])
  return idx === -1 ? ACTIVITY_TYPE_ORDER.length : idx
}

export interface ItemBookProgress {
  bookId: string
  owned: number
  total: number
  completed: boolean
}

interface BadgesClientProps {
  badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow | null }>
  itemBooks: ItemBookRow[]
  itemBookProgress: ItemBookProgress[]
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center py-[var(--spacing-32)]">
      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{title}</p>
      <p className="text-[11px] text-text-inverse/40 mt-1">{body}</p>
    </Card>
  )
}

function tabLabel(label: string, count: number) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count > 0 && <span className="text-[10px] tabular-nums opacity-70">{count}</span>}
    </span>
  )
}

export default function BadgesClient({ badges, itemBooks, itemBookProgress }: BadgesClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('activity')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [rarityFilter, setRarityFilter] = useState<BadgeRarity | 'all'>('all')
  const progressMap = new Map(itemBookProgress.map((p) => [p.bookId, p]))

  const earnedCount = badges.filter((b) => b.earned).length

  // 슬라이딩 탭 — 라벨 옆에 보유/전체 카운트를 함께 노출
  const tabs: SlidingTabItem<TabKey>[] = [
    { key: 'activity', label: tabLabel(d.badges.tabActivity, earnedCount), ariaLabel: d.badges.tabActivity },
    { key: 'itembook', label: tabLabel(d.badges.tabItembook, itemBooks.length), ariaLabel: d.badges.tabItembook },
  ]

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
          onChange={setActiveTab}
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
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface text-text"
                >
                  <option value="all">{d.badges.filterActivityAll}</option>
                  {ACTIVITY_TYPE_ORDER.map((tp) => (
                    <option key={tp} value={tp}>{ACTIVITY_TYPE_LABELS[tp] ?? tp}</option>
                  ))}
                </select>
                <select
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value as BadgeRarity | 'all')}
                  className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface text-text"
                >
                  <option value="all">{d.badges.filterRarityAll}</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>{RARITY_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {filteredActivityBadges.length > 0 ? (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {filteredActivityBadges.map(({ badge, earned }) => (
                    <Link key={badge.id} href={`/badges/${badge.id}`}>
                      <Card className={`flex flex-col items-center gap-1 p-[var(--spacing-8)] active:scale-95 transition-transform duration-100 ${earned ? '' : 'bg-surface-inverse/50'}`}>
                        <div className={`w-[72px] h-[72px] rounded-[var(--radius-cards)] flex items-center justify-center overflow-hidden ${earned ? '' : 'grayscale opacity-40'}`}>
                          {badge.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={badge.image_url}
                              alt={badge.name}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <MedalIcon className="w-9 h-9 text-text-inverse/40" />
                          )}
                        </div>
                        <p className="text-[length:var(--text-body-sm)] leading-tight text-center line-clamp-2 h-10 w-full">{badge.name}</p>
                        <div className="h-6 flex items-center justify-center">
                          <RarityBadge rarity={badge.rarity} />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title={d.badges.emptyActivityTitle} body={d.badges.emptyActivityBody} />
              )}
            </>
          ) : (
            <EmptyState title={d.badges.emptyActivityTitle} body={d.badges.emptyActivityBody} />
          )
        )}

        {/* 아이템북 탭 */}
        {activeTab === 'itembook' && (
          itemBooks.length > 0 ? (
            <div className="flex flex-col gap-[var(--spacing-16)]">
              {itemBooks.map((book) => {
                const progress = progressMap.get(book.id) ?? { owned: 0, total: 1, completed: false }
                const pct = Math.round((progress.owned / progress.total) * 100)
                return (
                  <Link key={book.id} href={`/itembooks/${book.id}`}>
                    <Card className="active:scale-[0.98] transition-transform duration-100">
                      <div className="flex gap-[var(--spacing-16)] mb-[var(--spacing-16)]">
                        {book.image_url && (
                          <div className="w-14 h-14 rounded-[var(--radius-cards)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={book.image_url} alt={book.name} className="w-full h-full object-contain p-1" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <h3 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{book.name}</h3>
                            {progress.completed ? (
                              <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ml-2 shrink-0">
                                {d.badges.itembookCompleted}
                              </span>
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-text-inverse/30 shrink-0 ml-2 mt-0.5" />
                            )}
                          </div>
                          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mt-0.5 line-clamp-2">{book.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-[var(--spacing-16)]">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                          <div className="h-full bg-surface transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-text-inverse/50 tabular-nums shrink-0">
                          {progress.owned} / {progress.total}
                        </span>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <EmptyState title={d.badges.emptyItembookTitle} body={d.badges.emptyItembookBody} />
          )
        )}
      </div>
    </div>
  )
}
