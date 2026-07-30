'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ActivityType, MissionCondition, MissionRow, MissionType } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import Card from '@/components/ui/Card'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import { d, t } from '@/lib/i18n'

export interface MissionListItem extends MissionRow {
  joined: boolean
  done: boolean
}

interface Props {
  ongoing: MissionListItem[] // 종료되지 않은 미션 전체 (시작 전 포함)
  ended: MissionListItem[] // 종료된 미션 중 내가 참여했던 것만
}

type Tab = 'ongoing' | 'joined' | 'ended'
type SortKey = 'newest' | 'oldest' | 'ending_soon'

const NEW_MISSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7일 이내 생성 = 신규

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  distance: d.missions.missionTypeDistance,
  activity_count: d.missions.missionTypeActivityCount,
  poi_visit: d.missions.missionTypePoiVisit,
  item_collect: d.missions.missionTypeItemCollect,
}

const ACTIVITY_TYPES: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const MISSION_TYPES: MissionType[] = ['distance', 'activity_count', 'poi_visit', 'item_collect']

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: d.missions.sortNewest },
  { key: 'oldest', label: d.missions.sortOldest },
  { key: 'ending_soon', label: d.missions.sortEndingSoon },
]

function isNewMission(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= NEW_MISSION_WINDOW_MS
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return d.missions.tagEnded
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`
  return `${h}시간 ${m}분`
}

// Phase13: 보상은 배지 복수 + 포인트 조합 — 목록에서는 간단히 요약
function rewardSummary(m: MissionRow): string {
  const parts: string[] = []
  const badgeCount = m.reward_badge_ids?.length ?? 0
  if (badgeCount > 0) parts.push(t(d.missions.rewardBadgeCount, { count: badgeCount }))
  if (m.reward_points) parts.push(t(d.missions.rewardPoints, { points: m.reward_points }))
  return parts.length > 0 ? parts.join(' + ') : d.missions.rewardNone
}

const TABS: SlidingTabItem<Tab>[] = [
  { key: 'ongoing', label: d.missions.tabOngoing },
  { key: 'joined', label: d.missions.tabJoined },
  { key: 'ended', label: d.missions.tabEnded },
]

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-text-inverse/70">
      {children}
    </span>
  )
}

export default function MissionsListClient({ ongoing, ended }: Props) {
  const [tab, setTab] = useState<Tab>('ongoing')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<MissionType | 'all'>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  const activeFilterCount = (activityFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0)

  const baseList =
    tab === 'ongoing' ? ongoing :
    tab === 'joined' ? ongoing.filter((m) => m.joined) :
    ended

  const list = useMemo(() => {
    let result = baseList.filter((m) => {
      const condition = m.condition_json as MissionCondition
      if (typeFilter !== 'all' && m.mission_type !== typeFilter) return false
      if (activityFilter !== 'all' && condition.activity_type && condition.activity_type !== activityFilter) return false
      // 활동종류 필터가 걸려있는데 미션 자체에 activity_type 조건이 없으면(종목 무관 미션) 제외
      if (activityFilter !== 'all' && !condition.activity_type) return false
      return true
    })

    if (sortKey === 'ending_soon') {
      result = [...result].sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime())
    } else if (sortKey === 'newest') {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sortKey === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return result
  }, [baseList, sortKey, activityFilter, typeFilter])

  const emptyText =
    activeFilterCount > 0 ? d.missions.emptyFiltered :
    tab === 'ongoing' ? d.missions.emptyOngoing :
    tab === 'joined' ? d.missions.emptyJoined :
    d.missions.emptyEnded

  function resetFilters() {
    setActivityFilter('all')
    setTypeFilter('all')
  }

  return (
    <>
      {/*
        필터 패널은 Accordion expand(21-accordion.md)로 높이를 애니메이션한다.
        `.t-acc`가 헤더(필터 버튼)와 패널을 함께 감싸야 data-open 셀렉터가
        패널까지 닿는다. 패딩은 `.t-acc-panel-inner` 안쪽(Card)에만 두고
        `.t-acc-panel`에는 절대 넣지 않는다 — 0fr 트랙에 패딩이 남으면
        패널이 완전히 닫히지 않는다.
      */}
      <div className="t-acc" data-open={filterOpen}>
        {/* 탭 + 필터 버튼 */}
        <div className="flex items-center gap-2 mb-[var(--spacing-16)]">
          {/* Tabs sliding (16-tabs-sliding.md) */}
          <div className="flex-1 min-w-0">
            <SlidingTabs
              items={TABS}
              value={tab}
              onChange={setTab}
              shape="card"
              aria-label={d.missions.filterButton}
            />
          </div>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className={`shrink-0 flex items-center gap-1.5 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[11px] transition-colors duration-100 ${
              filterOpen || activeFilterCount > 0 ? 'bg-surface-inverse text-text-inverse' : 'text-text'
            }`}
          >
            {d.missions.filterButton}
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center shadow-[inset_0_0_0_1px_currentColor]">
                {activeFilterCount}
              </span>
            )}
            <span className="t-acc-chevron">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
                <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {/* 필터 패널 */}
        <div className="t-acc-panel">
          <div className="t-acc-panel-inner">
        <Card className="mb-[var(--spacing-16)] flex flex-col gap-[var(--spacing-16)]">
          <div>
            <p className="text-[10px] uppercase text-text-inverse/50 mb-2">{d.missions.sortLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortKey(s.key)}
                  className={`px-[var(--spacing-16)] py-2 rounded-[var(--radius-nav-buttons)] text-[11px] min-h-11 shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ${
                    sortKey === s.key ? 'bg-surface text-text' : 'text-text-inverse'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-text-inverse/50 mb-2">{d.missions.activityTypeLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActivityFilter('all')}
                className={`px-[var(--spacing-16)] py-2 rounded-[var(--radius-nav-buttons)] text-[11px] min-h-11 shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ${
                  activityFilter === 'all' ? 'bg-surface text-text' : 'text-text-inverse'
                }`}
              >
                {d.missions.activityTypeAll}
              </button>
              {ACTIVITY_TYPES.map((tp) => (
                <button
                  key={tp}
                  onClick={() => setActivityFilter(tp)}
                  className={`px-[var(--spacing-16)] py-2 rounded-[var(--radius-nav-buttons)] text-[11px] min-h-11 shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ${
                    activityFilter === tp ? 'bg-surface text-text' : 'text-text-inverse'
                  }`}
                >
                  {ACTIVITY_TYPE_LABELS[tp] ?? tp}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-text-inverse/50 mb-2">{d.missions.missionTypeLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-[var(--spacing-16)] py-2 rounded-[var(--radius-nav-buttons)] text-[11px] min-h-11 shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ${
                  typeFilter === 'all' ? 'bg-surface text-text' : 'text-text-inverse'
                }`}
              >
                {d.missions.missionTypeAll}
              </button>
              {MISSION_TYPES.map((tp) => (
                <button
                  key={tp}
                  onClick={() => setTypeFilter(tp)}
                  className={`px-[var(--spacing-16)] py-2 rounded-[var(--radius-nav-buttons)] text-[11px] min-h-11 shadow-[inset_0_0_0_1px_var(--color-border-inverse)] ${
                    typeFilter === tp ? 'bg-surface text-text' : 'text-text-inverse'
                  }`}
                >
                  {MISSION_TYPE_LABELS[tp]}
                </button>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="self-start text-[11px] text-text-inverse/50 underline underline-offset-2">
              {d.missions.filterReset}
            </button>
          )}
        </Card>
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-[var(--spacing-40)]">
          <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--spacing-16)]">
          {list.map((m) => {
            const started = new Date(m.starts_at) <= new Date()
            return (
              <Link key={m.id} href={`/missions/${m.id}`}>
                <Card className={`active:scale-[0.98] transition-transform duration-100 ${!started ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{m.title}</h3>
                        {isNewMission(m.created_at) && <Tag>{d.missions.tagNew}</Tag>}
                        {m.done && <Tag>{d.missions.tagDone}</Tag>}
                        {!m.done && m.joined && <Tag>{d.missions.tagJoined}</Tag>}
                        {!started && <Tag>{d.missions.tagUpcoming}</Tag>}
                      </div>
                      {m.description && (
                        <p className="text-text-inverse/60 text-[11px]">{m.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-text-inverse/50">
                        {tab === 'ended' ? d.missions.tagEnded : `${timeLeft(m.ends_at)} ${d.missions.timeLeftSuffix}`}
                      </p>
                      {m.max_completions && (
                        <p className="text-[11px] text-text-inverse/50 mt-0.5">
                          {t(d.missions.limitedSlots, { count: m.max_completions.toLocaleString() })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-inverse/50">
                      {d.missions.rewardLabel}: {rewardSummary(m)}
                    </span>
                    <span className="text-[10px] uppercase text-text-inverse/30">{m.mission_type}</span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
