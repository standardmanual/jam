'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ActivityType, BadgeRarity, MissionCondition, MissionRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import { TargetIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d, t } from '@/lib/i18n'

export interface MissionListItem extends MissionRow {
  joined: boolean
  done: boolean
  /** 완료 시각 (user_mission_completions.completed_at). 미완료면 null */
  completedAt: string | null
  /** 20260825_028: 아직 열리지 않은 레벨업 미션 — 회색 잠금 카드로만 노출하고 진입/참가 불가 */
  locked: boolean
  /** 잠금 해제에 필요한 본 배지 (locked일 때만 값이 있음) */
  requiredBadge: { name: string; rarity: BadgeRarity } | null
}

interface Props {
  // 종료되지 않은 미션 중 노출 대상(open/locked)만. 완료·미해금 상위 단계는 서버에서 제외됨
  ongoing: MissionListItem[]
  // '완료/지난' 탭 — 내가 완료한 미션 + 내가 참여했던 종료 미션
  ended: MissionListItem[]
  rewardBadgeNames: Record<string, string> // badge_id → 배지 이름 맵
}

type Tab = 'ongoing' | 'joined' | 'ended'
type SortKey = 'newest' | 'oldest' | 'ending_soon'

const NEW_MISSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7일 이내 생성 = 신규

// Figma mission-item-1 색상 토큰
const C_THUMBNAIL_BG = '#1A1A1A'
const C_THUMBNAIL_RADIUS = '12px'
// 20260816_012: 보더 제거 — 페이지 캔버스(bg-surface)와 같은 색이라 배경톤을 한 단계 올림
const C_STATUS_BADGE_BG = 'var(--color-surface-elevated)'
const C_STATUS_BADGE_TEXT = '#B2B2B2'
const C_NEW_BADGE_BG = '#E8461F'
const C_TITLE = '#FFFFFF'
const C_META_TEXT = '#B2B2B2'
const C_REWARD = '#E8461F'

const ACTIVITY_TYPES: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: d.missions.sortNewest },
  { key: 'oldest', label: d.missions.sortOldest },
  { key: 'ending_soon', label: d.missions.sortEndingSoon },
]

function isNewMission(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= NEW_MISSION_WINDOW_MS
}

// Phase13: 보상은 배지 복수 + 포인트 조합 — 배지는 "배지명 배지" 형식으로 표시
function rewardSummary(m: MissionRow, badgeNames: Record<string, string>): string {
  const parts: string[] = []
  const ids = m.reward_badge_ids ?? []
  for (const id of ids) {
    const name = badgeNames[id]
    parts.push(name ? `${name} 배지` : t(d.missions.rewardBadgeCount, { count: 1 }))
  }
  if (m.reward_points) parts.push(t(d.missions.rewardPoints, { points: m.reward_points }))
  return parts.length > 0 ? parts.join(' + ') : d.missions.rewardNone
}

const TABS: SlidingTabItem<Tab>[] = [
  { key: 'ongoing', label: d.missions.tabOngoing },
  { key: 'joined', label: d.missions.tabJoined },
  { key: 'ended', label: d.missions.tabEnded },
]

// Figma mission-item-1: badge/new
function NewBadge() {
  return (
    <span
      style={{
        background: C_NEW_BADGE_BG,
        color: '#FFFFFF',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1,
        padding: '3px 6px',
        borderRadius: '999px',
      }}
    >
      {d.missions.tagNew}
    </span>
  )
}

// Figma mission-item-1: badge/status
function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: C_STATUS_BADGE_BG,
        color: C_STATUS_BADGE_TEXT,
        fontSize: '10px',
        lineHeight: 1,
        padding: '3px 6px',
        borderRadius: '999px',
      }}
    >
      {children}
    </span>
  )
}

// 참가중 태그 — 강조 스타일
function JoinedBadge() {
  return (
    <span
      style={{
        background: C_REWARD,
        color: '#FFFFFF',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1,
        padding: '3px 6px',
        borderRadius: '999px',
      }}
    >
      {d.missions.tagJoined}
    </span>
  )
}

// 기간 텍스트 — 완료 건은 완료일, ended 탭이면 tagEnded, 상시면 tagPermanent, 그 외 N일 N시간 남음
function periodText(m: MissionListItem, tab: Tab): string {
  // 20260825_028: 완료한 상시 미션은 "종료됨"이 아니라 언제 완료했는지를 보여준다
  // (상태 뱃지가 이미 '완료'를 표시하므로 여기선 날짜만 — 날짜는 직관적인 한국어 형태로)
  if (m.done) {
    return m.completedAt
      ? new Date(m.completedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      : d.missions.tagDone
  }
  if (tab === 'ended') return d.missions.tagEnded
  if (m.ends_at === null) return d.missions.tagPermanent
  const diff = new Date(m.ends_at).getTime() - Date.now()
  if (diff <= 0) return d.missions.tagEnded
  const h = Math.floor(diff / 3_600_000)
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 ${d.missions.timeLeftSuffix}`
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  return `${h}시간 ${mins}분 ${d.missions.timeLeftSuffix}`
}

// 상태 뱃지 텍스트 — 없으면 null (노출 안 함)
function statusLabel(m: MissionListItem, started: boolean): string | null {
  if (m.done) return d.missions.tagDone
  if (m.locked) return d.missions.tagLocked
  if (m.joined) return d.missions.tagJoined
  if (!started) return d.missions.tagUpcoming
  return null
}

// 잠금 카드 안내 문구 — "무엇을 하면 열리는지"를 알려준다 (20260825_028)
function lockedHintText(m: MissionListItem): string {
  if (!m.requiredBadge) return d.missions.lockedBodyGeneric
  return t(d.missions.lockedHint, {
    badge: m.requiredBadge.name,
    rarity: RARITY_LABEL[m.requiredBadge.rarity] ?? m.requiredBadge.rarity,
  })
}

export default function MissionsListClient({ ongoing, ended, rewardBadgeNames }: Props) {
  const [tab, setTab] = useState<Tab>('ongoing')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')

  const activeFilterCount = activityFilter !== 'all' ? 1 : 0

  const baseList =
    tab === 'ongoing' ? ongoing :
    tab === 'joined' ? ongoing.filter((m) => m.joined) :
    ended

  const list = useMemo(() => {
    let result = baseList.filter((m) => {
      const condition = m.condition_json as MissionCondition
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
  }, [baseList, sortKey, activityFilter])

  const emptyText =
    activeFilterCount > 0 ? d.missions.emptyFiltered :
    tab === 'ongoing' ? d.missions.emptyOngoing :
    tab === 'joined' ? d.missions.emptyJoined :
    d.missions.emptyEnded
  const emptyBody =
    activeFilterCount > 0 ? d.missions.emptyFilteredBody :
    tab === 'ongoing' ? d.missions.emptyOngoingBody :
    tab === 'joined' ? d.missions.emptyJoinedBody :
    d.missions.emptyEndedBody

  return (
    <div className="min-h-full bg-surface text-text">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo headerStyle={{ background: 'var(--color-surface)' }} />

      {/* 헤더 — 배지 메뉴와 동일한 구조 */}
      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.missions.title}</h1>
      </div>

      {/* 탭 헤더 — 배지 메뉴와 동일한 구조 */}
      <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
        <SlidingTabs
          items={TABS}
          value={tab}
          onChange={setTab}
          outlined={false}
          aria-label={d.missions.title}
        />
      </div>

      <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)]">
      {/* 필터 드롭다운 — 배지 탭과 동일한 스타일 */}
      <div className="flex gap-2 mb-[var(--spacing-16)]">
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value as ActivityType | 'all')}
          className="flex-1 min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-white/10 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text"
        >
          <option value="all">{d.missions.activityTypeAll}</option>
          {ACTIVITY_TYPES.map((tp) => (
            <option key={tp} value={tp}>{ACTIVITY_TYPE_LABELS[tp] ?? tp}</option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<TargetIcon className="w-8 h-8" />}
          title={emptyText}
          description={emptyBody}
        />
      ) : (
        <div className="flex flex-col gap-[var(--spacing-8)]">
          {list.map((m) => {
            const started = new Date(m.starts_at) <= new Date()
            const newMission = isNewMission(m.created_at)
            const sLabel = statusLabel(m, started)
            const period = periodText(m, tab)
            const reward = rewardSummary(m, rewardBadgeNames)
            // 20260825_028: 잠긴 미션은 회색 처리 + 링크로 감싸지 않아 상세 진입 자체를 막는다
            // (미시작 미션의 opacity 0.6 선례를 그대로 사용)
            const card = (
              <>
                {/* Figma mission-item-1 카드 */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    padding: '12px 0',
                    gap: '16px',
                    opacity: !started || m.locked ? 0.6 : 1,
                  }}
                >
                  {/* thumbnail */}
                  <div
                    style={{
                      width: '90px',
                      height: '90px',
                      minWidth: '90px',
                      background: C_THUMBNAIL_BG,
                      borderRadius: C_THUMBNAIL_RADIUS,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {m.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image_url}
                        alt={m.title}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ display: 'block', width: '32px', height: '32px', background: '#FFFFFF', borderRadius: '4px', opacity: 0.2 }} />
                    )}
                  </div>

                  {/* text-area */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    {/* meta-row */}
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
                      {newMission && <NewBadge />}
                      {m.joined && !m.done ? (
                        <JoinedBadge />
                      ) : sLabel ? (
                        <StatusBadge>{sLabel}</StatusBadge>
                      ) : null}
                      {period === d.missions.tagPermanent || period === d.missions.tagEnded ? (
                        <StatusBadge>{period}</StatusBadge>
                      ) : (
                        <span style={{ fontSize: '11px', color: C_META_TEXT, lineHeight: 1 }}>{period}</span>
                      )}
                    </div>

                    {/* title */}
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: C_TITLE, margin: 0, lineHeight: '1.25' }}>
                      {m.title}
                    </h3>

                    {/* desc */}
                    {m.description && (
                      <p
                        style={{
                          fontSize: '12px',
                          lineHeight: '17px',
                          color: C_META_TEXT,
                          margin: 0,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {m.description}
                      </p>
                    )}

                    {/* reward */}
                    <span style={{ fontSize: '11px', color: C_REWARD, lineHeight: 1 }}>
                      {reward}
                    </span>

                    {/* 잠금 안내 — 무엇을 획득하면 열리는지 */}
                    {m.locked && (
                      <span style={{ fontSize: '11px', color: C_META_TEXT, lineHeight: 1.3 }}>
                        {lockedHintText(m)}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )

            return m.locked ? (
              <div key={m.id} aria-disabled="true">{card}</div>
            ) : (
              <Link key={m.id} href={`/missions/${m.id}`} className="active:opacity-70 transition-opacity duration-100">
                {card}
              </Link>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
