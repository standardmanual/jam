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
  streak_days: d.missions.missionTypeStreakDays,
  duration_minutes: d.missions.missionTypeDurationMinutes,
  elevation_gain_m: d.missions.missionTypeElevationGainM,
}

const ACTIVITY_TYPES: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']
const MISSION_TYPES: MissionType[] = [
  'distance', 'activity_count', 'poi_visit', 'item_collect',
  'streak_days', 'duration_minutes', 'elevation_gain_m',
]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: d.missions.sortNewest },
  { key: 'oldest', label: d.missions.sortOldest },
  { key: 'ending_soon', label: d.missions.sortEndingSoon },
]

function isNewMission(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= NEW_MISSION_WINDOW_MS
}

function timeLeft(endsAt: string | null): string {
  if (endsAt === null) return d.missions.tagPermanent
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
    <span className="text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-text-inverse/70">
      {children}
    </span>
  )
}

function NewChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] bg-[var(--color-primary)] text-white font-medium">
      {children}
    </span>
  )
}

export default function MissionsListClient({ ongoing, ended }: Props) {
  const [tab, setTab] = useState<Tab>('ongoing')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<MissionType | 'all'>('all')

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
      // 상시 미션(ends_at null)은 종료가 없으므로 항상 맨 뒤로
      const endsAtMs = (m: MissionListItem) => (m.ends_at === null ? Infinity : new Date(m.ends_at).getTime())
      result = [...result].sort((a, b) => endsAtMs(a) - endsAtMs(b))
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

  return (
    <>
      {/* Tabs sliding (16-tabs-sliding.md) */}
      <div className="mb-[var(--spacing-16)]">
        <SlidingTabs
          items={TABS}
          value={tab}
          onChange={setTab}
          aria-label={d.missions.filterButton}
        />
      </div>

      {/* 필터 드롭다운 — 배지 탭과 동일한 방식 */}
      <div className="flex gap-2 mb-[var(--spacing-16)]">
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface text-text"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value as ActivityType | 'all')}
          className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface text-text"
        >
          <option value="all">{d.missions.activityTypeAll}</option>
          {ACTIVITY_TYPES.map((tp) => (
            <option key={tp} value={tp}>{ACTIVITY_TYPE_LABELS[tp] ?? tp}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MissionType | 'all')}
          className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] shadow-[inset_0_0_0_1px_var(--color-border)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface text-text"
        >
          <option value="all">{d.missions.missionTypeAll}</option>
          {MISSION_TYPES.map((tp) => (
            <option key={tp} value={tp}>{MISSION_TYPE_LABELS[tp]}</option>
          ))}
        </select>
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
                        {isNewMission(m.created_at) && tab !== 'ended' && <NewChip>{d.missions.tagNew}</NewChip>}
                        {m.ends_at === null && tab !== 'ended' && <Tag>{d.missions.tagPermanent}</Tag>}
                        {m.done && <Tag>{d.missions.tagDone}</Tag>}
                        {!m.done && m.joined && <Tag>{d.missions.tagJoined}</Tag>}
                        {!started && tab !== 'ended' && <Tag>{d.missions.tagUpcoming}</Tag>}
                      </div>
                      {m.description && (
                        <p className="text-text-inverse/60 text-[length:var(--text-caption)]">{m.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[length:var(--text-caption)] text-text-inverse/50">
                        {tab === 'ended'
                          ? d.missions.tagEnded
                          : m.ends_at === null ? d.missions.tagPermanent : `${timeLeft(m.ends_at)} ${d.missions.timeLeftSuffix}`}
                      </p>
                      {m.max_completions && (
                        <p className="text-[length:var(--text-caption)] text-text-inverse/50 mt-0.5">
                          {t(d.missions.limitedSlots, { count: m.max_completions.toLocaleString() })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[length:var(--text-caption)] text-text-inverse/50">
                      {d.missions.rewardLabel}: {rewardSummary(m)}
                    </span>
                    <span className="text-[length:var(--text-caption)] text-text-inverse/30">{MISSION_TYPE_LABELS[m.mission_type] ?? m.mission_type}</span>
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
