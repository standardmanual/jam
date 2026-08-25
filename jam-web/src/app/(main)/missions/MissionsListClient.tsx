'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ActivityType, BadgeRarity, MissionCondition, MissionRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import { LockIcon, TargetIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { useToast } from '@/components/ui/Toast'
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
// 20260825_028: 잠김 칩 전용 배경. 기본 칩 배경(#1f1f1f)은 캔버스(#1a1a1a) 대비 1.06:1이라
// 칩 형태가 거의 보이지 않는다 — 잠김 칩만 상세 화면 완료 칩과 같은 톤으로 올린다.
const C_LOCKED_BADGE_BG = 'rgba(255,255,255,0.08)'
// 썸네일 자물쇠 오버레이 전용 색. 배경이 배지 아트라 밝기가 유동적이므로 흰색으로 고정한다.
const C_LOCK_GLYPH = '#FFFFFF'
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
// locked=true면 잠금 글리프 + 배경톤을 올린 변형 (20260825_028)
function StatusBadge({ children, locked = false }: { children: React.ReactNode; locked?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        background: locked ? C_LOCKED_BADGE_BG : C_STATUS_BADGE_BG,
        color: C_STATUS_BADGE_TEXT,
        fontSize: '10px',
        lineHeight: 1,
        padding: '3px 6px',
        borderRadius: '999px',
      }}
    >
      {/* icons.tsx의 Svg는 strokeWidth 1.5 / viewBox 24 = 24px 렌더 전제다.
          10px로 축소하면 실효 스트로크가 0.625px, 키홀은 0.83px라 형태가 서브픽셀로 뭉개진다.
          호출부에서 strokeWidth를 보정해 10px에서도 자물쇠로 읽히게 한다. */}
      {locked && <LockIcon className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />}
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

// 잠긴 카드를 눌렀을 때의 토스트 — 참가 API(join)가 403으로 돌려주는 문구를 그대로 쓴다.
// 같은 차단 사유는 어디서 만나든 같은 문장이어야 한다.
function lockedToastText(m: MissionListItem): string {
  if (!m.requiredBadge) return d.missions.joinErrorLockedGeneric
  return t(d.missions.joinErrorLocked, {
    badge: m.requiredBadge.name,
    rarity: RARITY_LABEL[m.requiredBadge.rarity] ?? m.requiredBadge.rarity,
  })
}

export default function MissionsListClient({ ongoing, ended, rewardBadgeNames }: Props) {
  const { toast } = useToast()
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
            // 20260825_028: 잠긴 미션은 상세 진입을 막고, 눌리면 잠금 사유를 토스트로 알린다.
            // 카드 전체 딤(0.6)은 '시작전'과 픽셀 단위로 같아져 상태 구분이 사라지고
            // 정작 읽어야 할 잠금 힌트의 대비까지 8.21:1 → 3.78:1로 떨어뜨린다.
            // 그래서 잠김은 썸네일에만 grayscale+딤을 적용한다 — 미획득 배지를 표현하는
            // 하우스 패턴(BadgeGridCard·BadgeHeroSection·MapView)과 같은 방식이다.
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
                    opacity: !started && !m.locked ? 0.6 : 1,
                  }}
                >
                  {/* thumbnail — 잠김이면 grayscale + 딤 + 자물쇠 오버레이 */}
                  <div
                    style={{
                      position: 'relative',
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
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: m.locked ? 'grayscale(1)' : undefined,
                        opacity: m.locked ? 0.4 : 1,
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
                    {m.locked && (
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          // 오버레이 배경은 배지 아트를 0.4로 합성한 값이라 이미지마다 밝기가 다르다.
                          // #B2B2B2로 두면 밝은 아트 위에서 2.17:1까지 떨어져 WCAG 1.4.11(의미 전달
                          // 그래픽 3:1)에 미달한다 — 흰색이면 최악 배경(#767676)에서도 4.6:1이다.
                          color: C_LOCK_GLYPH,
                        }}
                      >
                        <LockIcon className="w-6 h-6" />
                      </span>
                    )}
                  </div>

                  {/* text-area */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    {/* meta-row */}
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
                      {newMission && <NewBadge />}
                      {/* 20260825_028: 잠김이 '참가중'보다 우선한다. statusLabel의 우선순위와 같은 순서 —
                          게이팅 도입 전에 참가해 둔 미션이 잠기면 두 칩이 모순되어 보인다. */}
                      {m.joined && !m.done && !m.locked ? (
                        <JoinedBadge />
                      ) : sLabel ? (
                        <StatusBadge locked={m.locked && !m.done}>{sLabel}</StatusBadge>
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

                    {/* desc — 잠김이면 설명 대신 잠금 힌트를 제목 바로 아래에 둔다.
                        참가할 수 없는 미션에서 2줄짜리 설명은 실행 불가능한 정보고,
                        보상보다 뒤에 붙은 힌트는 "받을 수 있다"를 먼저 읽히게 만든다. */}
                    {m.locked ? (
                      <span
                        style={{
                          fontSize: 'var(--text-micro)',
                          lineHeight: 1.3,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {lockedHintText(m)}
                      </span>
                    ) : m.description ? (
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
                    ) : null}

                    {/* reward */}
                    <span style={{ fontSize: '11px', color: C_REWARD, lineHeight: 1 }}>
                      {reward}
                    </span>
                  </div>
                </div>
              </>
            )

            return m.locked ? (
              // 무반응은 "잠김"이 아니라 "터치가 씹혔다"로 읽힌다. 눌림 피드백을 주되
              // 열린 카드(active:opacity-70)보다 얕게 잡아 '이동'이 아닌 '저항'으로 읽히게 한다.
              // role 없는 div의 aria-disabled는 보조기술이 무시하므로 button으로 바꿔
              // 포커스·상태 안내도 함께 살린다(실제 참가·진입은 여전히 불가).
              <button
                key={m.id}
                type="button"
                aria-disabled="true"
                onClick={() => toast(lockedToastText(m), 'info')}
                className="w-full text-left transition-transform active:scale-[0.99]"
                style={{ transitionDuration: 'var(--duration-micro)' }}
              >
                {card}
              </button>
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
