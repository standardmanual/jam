'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ActivityType, BadgeRarity, MissionCondition, MissionRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import { LockIcon, TargetIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { Select } from '@ds/components/forms/Select'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
import { ListRow, ListRowChip } from '@/components/ui/ListRow'
import { useToast } from '@/components/ui/Toast'
import { d, t } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'
import { missionStatusKind } from './missionStatusKind'
import { buildQueryHref, readEnumParam } from '@/lib/urlQueryState'

export interface MissionListItem extends MissionRow {
  joined: boolean
  done: boolean
  /** 완료 시각 (user_mission_completions.completed_at). 미완료면 null */
  completedAt: string | null
  /** 20260825_028: 아직 열리지 않은 레벨업 미션 — 회색 잠금 카드로만 노출하고 진입/참가 불가 */
  locked: boolean
  /** 잠금 해제에 필요한 본 배지 (locked일 때만 값이 있음) */
  requiredBadge: { name: string; rarity: BadgeRarity } | null
  /**
   * 보상 중 잠긴 아이템 배지의 등급 목록(티켓 20261019_1317 2회, 운영 로직 7.3절). 이름·그림·id는 내려오지 않는다 —
   * 등급이 없는 배지는 null이다. 보상 줄에서 열린 배지 뒤에 «등급 칩 + 잠긴 아이템 배지»로 잇는다.
   */
  lockedRewardRarities: (BadgeRarity | null)[]
}

/** 보상 배지 요약에 필요한 최소 정보 — 20260907_0014: 등급칩/레벨칩 분기를 위해 이름만으로는 부족 */
export interface RewardBadgeInfo {
  name: string
  rarity: BadgeRarity | null
  level: number | null
}

interface Props {
  // 종료되지 않은 미션 중 노출 대상(open/locked)만. 완료·미해금 상위 단계는 서버에서 제외됨
  ongoing: MissionListItem[]
  // '완료/지난' 탭 — 내가 완료한 미션 + 내가 참여했던 종료 미션
  ended: MissionListItem[]
  rewardBadgeNames: Record<string, RewardBadgeInfo> // badge_id → 보상 배지 정보 맵
}

type Tab = 'ongoing' | 'joined' | 'ended'
const MISSIONS_TAB_QUERY_KEY = 'tab'
const TAB_KEYS: readonly Tab[] = ['ongoing', 'joined', 'ended']
const DEFAULT_TAB: Tab = 'ongoing'
type SortKey = 'newest' | 'oldest' | 'ending_soon'

const NEW_MISSION_WINDOW_MS = 2 * 24 * 60 * 60 * 1000 // 생성 후 2일 이내 = 신규 (2026-11-04 사용자 결정, 이전 7일)

// 썸네일 자물쇠 오버레이 전용 색. lead 바탕(--background-secondary)이 밝아 --foreground다(14:1).
const C_LOCK_GLYPH = 'var(--foreground)'

const ACTIVITY_TYPES: ActivityType[] = ['running', 'cycling', 'trail_running', 'hiking', 'walking']

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: d.missions.sortNewest },
  { key: 'oldest', label: d.missions.sortOldest },
  { key: 'ending_soon', label: d.missions.sortEndingSoon },
]

function isNewMission(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= NEW_MISSION_WINDOW_MS
}

// Phase13: 보상은 배지 복수 + 포인트 조합. 배지는 "칩 + 배지명 배지" 형식으로 표시한다
// (20260907_0014). 등급형/레벨형은 상호배타이므로(마이그레이션 130) level 유무로 분기하고,
// 둘 다 값이 없으면(common·미조회) 컴포넌트 스스로 칩을 그리지 않는다.
function rewardBadgeNode(id: string, badgeNames: Record<string, RewardBadgeInfo>): React.ReactNode {
  const info = badgeNames[id]
  if (!info) return t(d.missions.rewardBadgeCount, { count: 1 })
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {info.level != null ? <BadgeLevelChip level={info.level} size="row" /> : <RarityBadge rarity={info.rarity ?? undefined} size="row" />}
      {t(d.missions.rewardBadgeName, { name: info.name })}
    </span>
  )
}

// 잠긴 아이템 배지 보상 — 이름·그림 없이 «등급 칩 + 잠긴 아이템 배지»만 보인다(운영 로직 7.3절).
// 어떤 배지인지 알 수 있는 값은 이 화면에 내려오지 않는다. 등급이 없으면 칩 없이 문구만 남는다.
function lockedRewardNode(rarity: BadgeRarity | null): React.ReactNode {
  return (
    <span className="break-keep wrap-break-word" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <RarityBadge rarity={rarity} size="row" />
      {d.lockedItem.card.name}
    </span>
  )
}

// 텍스트 전용(포인트)과 배지 보상(칩+이름)을 한 줄에 " + "로 이어 붙인다. 열린 배지 뒤에 잠긴 보상, 그 뒤에 포인트다.
function rewardNodes(m: MissionListItem, badgeNames: Record<string, RewardBadgeInfo>): React.ReactNode[] {
  const ids = m.reward_badge_ids ?? []
  const nodes: React.ReactNode[] = []
  ids.forEach((id) => {
    if (nodes.length > 0) nodes.push(<span key={`sep-${id}`}> + </span>)
    nodes.push(<span key={id}>{rewardBadgeNode(id, badgeNames)}</span>)
  })
  m.lockedRewardRarities.forEach((rarity, index) => {
    if (nodes.length > 0) nodes.push(<span key={`sep-locked-${index}`}> + </span>)
    nodes.push(<span key={`locked-${index}`}>{lockedRewardNode(rarity)}</span>)
  })
  if (m.reward_points) {
    if (nodes.length > 0) nodes.push(<span key="sep-points"> + </span>)
    nodes.push(<span key="points">{tPoint(d.missions.rewardPoints, { points: m.reward_points.toLocaleString('ko-KR') })}</span>)
  }
  if (nodes.length === 0) nodes.push(<span key="none">{d.missions.rewardNone}</span>)
  return nodes
}

const TABS: SlidingTabItem<Tab>[] = [
  { key: 'ongoing', label: d.missions.tabOngoing },
  { key: 'joined', label: d.missions.tabJoined },
  { key: 'ended', label: d.missions.tabEnded },
]

// 기간 텍스트 — 완료 건은 완료일, ended 탭이면 tagEnded, 상시면 tagPermanent, 그 외 N일 N시간 남음
function periodText(m: MissionListItem, tab: Tab): string {
  // 20260825_028: 완료한 상시 미션은 "종료"가 아니라 언제 완료했는지를 보여준다
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

// 카드 상단 상태 라벨 — 20260923_1353: 잠김·상시 등 여러 칩이 섞여 있던 meta-row를
// 우선순위 하나로 합친다(우선순위 판정은 missionStatusKind.ts). 잠긴 이유
// 안내는 이 라벨이 아니라 아래 "조건" 행(lockedHintText 포함)이 맡는다.
function topStatusLabel(m: MissionListItem, tab: Tab, started: boolean): React.ReactNode {
  switch (missionStatusKind(m, started, tab === 'ended')) {
    case 'joinedEnded':
      return <ListRowChip>{d.missions.tagJoinedEnded}</ListRowChip>
    case 'joined':
      // 참가중 칩은 강조색 --jam-red 면이다(2026-11-11 사용자 지시, 티켓 20261111_2143). 12px 글자라 대비 4.5:1이 필요해 글자는 --snow(약 3.7:1)가 아니라 --foreground(약 4.6:1)다
      return <ListRowChip style={{ background: 'var(--jam-red)', color: 'var(--foreground)' }}>{d.missions.tagJoined}</ListRowChip>
    case 'done':
      return <ListRowChip>{d.missions.tagDone}</ListRowChip>
    case 'locked':
      return (
        <ListRowChip style={{ gap: 'var(--spacing-4)' }}>
          {/* icons.tsx의 Svg는 strokeWidth 1.5 / viewBox 24 = 24px 렌더 전제다.
              12px로 축소하면 실효 스트로크가 0.75px라 자물쇠 형태가 뭉개지므로 strokeWidth를 보정한다. */}
          <LockIcon className="w-3 h-3 shrink-0" strokeWidth={2.25} />
          {d.missions.tagLocked}
        </ListRowChip>
      )
    case 'upcoming':
      return <ListRowChip>{d.missions.tagUpcoming}</ListRowChip>
    default:
      return <ListRowChip>{periodText(m, tab)}</ListRowChip>
  }
}

// "조건" 행 전용 — requiredBadge에는 level이 없으므로 등급칩만 재사용한다(BadgeLevelChip 미사용)
function conditionBadgeNode(badge: { name: string; rarity: BadgeRarity }): React.ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <RarityBadge rarity={badge.rarity} size="row" />
      {t(d.missions.rewardBadgeName, { name: badge.name })}
    </span>
  )
}

// requiredBadge가 없는 잠김 미션(v5 게이트 미션 등)의 "조건" 행 대체 문구 — 이 경우 잠긴
// 이유를 알려줄 정보가 이 문구뿐이므로 삭제하지 않는다(20260923_1353 재작업, 게이트 FAIL 사유).
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 탭은 ?tab=에서 읽어 시작하고(알 수 없는 값은 진행중), 바꿀 때 같은 키로 주소에 쓴다 (티켓 20261110_1217)
  const [tab, setTab] = useState<Tab>(() => readEnumParam(searchParams, MISSIONS_TAB_QUERY_KEY, TAB_KEYS, DEFAULT_TAB))
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')

  // 탭 전환은 history를 쌓지 않는다(replace). 기본 탭(진행중)은 쿼리에서 뺀다.
  const handleTabChange = (next: Tab) => {
    setTab(next)
    router.replace(
      buildQueryHref(pathname, searchParams, { [MISSIONS_TAB_QUERY_KEY]: next === DEFAULT_TAB ? null : next }, window.location.hash),
      { scroll: false },
    )
  }

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
    <div className="min-h-full text-foreground">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo logoText={d.missions.title} />

      {/* 20261031_1821: 보이는 타이틀은 없애고, 스크린리더용 페이지 제목만 남긴다 */}
      <h1 className="sr-only">{d.missions.title}</h1>

      {/* 탭 헤더 — 배지 메뉴와 동일한 구조 */}
      <div className="px-4 py-4">
        <SlidingTabs
          items={TABS}
          value={tab}
          onChange={handleTabChange}
          outlined={false}
          aria-label={d.missions.title}
        />
      </div>

      <div className="px-4 pb-6">
      {/* 필터 드롭다운 — 배지 탭과 동일한 스타일 */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <Select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            options={SORT_OPTIONS.map((s) => ({ value: s.key, label: s.label }))}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value as ActivityType | 'all')}
            options={[
              { value: 'all', label: d.missions.activityTypeAll },
              ...ACTIVITY_TYPES.map((tp) => ({ value: tp, label: ACTIVITY_TYPE_LABELS[tp] ?? tp })),
            ]}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<TargetIcon className="w-8 h-8" />}
          title={emptyText}
          description={emptyBody}
        />
      ) : (
        <div>
          {list.map((m) => {
            const started = new Date(m.starts_at) <= new Date()
            const newMission = isNewMission(m.created_at)
            const reward = rewardNodes(m, rewardBadgeNames)
            // 20260825_028: 잠긴 미션은 상세 진입을 막고, 눌리면 잠금 사유를 토스트로 알린다.
            // 딤(잠김 0.4·시작 전 0.6)은 글자에 걸면 --muted가 2.46:1로 떨어지고 잠금 힌트 대비도 깎이므로
            // lead 안 이미지 래퍼에만 건다 — 미획득 배지를 표현하는 하우스 패턴과 같은 방식이다.
            const lead = (
              <>
                <span
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    filter: m.locked ? 'grayscale(1)' : undefined,
                    opacity: m.locked ? 0.4 : !started ? 0.6 : 1,
                  }}
                >
                  {m.image_url ? (
                    // 미션 그림은 조건 문구가 든 합성 이미지라 잘리면 안 된다 — 인라인 contain이 ListRow의 cover 규칙을 이긴다
                    // eslint-disable-next-line @next/next/no-img-element -- 외부 미션 그림 주소를 그대로 쓰는 48px 장식 썸네일이라 next/image 최적화 대상이 아니다
                    <img src={m.image_url} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />
                  ) : (
                    <span style={{ display: 'block', width: '24px', height: '24px', background: 'var(--surface)', borderRadius: '4px' }} />
                  )}
                </span>
                {m.locked && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: C_LOCK_GLYPH,
                    }}
                  >
                    <LockIcon className="w-5 h-5" />
                  </span>
                )}
              </>
            )

            // 상태 칩은 항상 나오므로 eyebrow가 비는 경우는 없다. NEW는 생성 후 2일 이내에만 앞에 붙는다.
            const eyebrow = (
              <>
                {newMission && <ListRowChip tone="done">{d.missions.tagNew}</ListRowChip>}
                {topStatusLabel(m, tab, started)}
              </>
            )

            // 잠긴 미션은 «조건» 줄 + 보상 줄, 열린 미션은 보상 줄만. 보상 줄 글자는 굵게(티켓 20261104_2318)이고 색은 행에서 상속한다.
            // «조건» 줄: requiredBadge가 있으면 등급칩+배지명, 없으면(v5 게이트 미션 등) lockedHintText()의
            // 범용 안내 문구 — 잠긴 이유를 알려주는 유일한 정보라 생략하면 안 된다.
            const footer = (
              <>
                {m.locked && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 'var(--text-xs--line-height)' }}>
                    <span style={{ marginRight: 'var(--spacing-4)' }}>{d.missions.cardConditionLabel}</span>
                    {m.requiredBadge ? conditionBadgeNode(m.requiredBadge) : lockedHintText(m)}
                  </span>
                )}
                <span
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    lineHeight: 'var(--text-xs--line-height)',
                    marginTop: m.locked ? 'var(--spacing-4)' : undefined,
                  }}
                >
                  {reward}
                </span>
              </>
            )

            // 잠긴 행은 disabled 없이 onClick + aria-disabled다 — disabled는 행 전체 불투명도 0.4와 키보드 차단을 함께 걸어
            // «썸네일만 흐림, 글자 대비 유지» 규칙과 토스트를 깬다. aria-disabled는 ListRow가 클릭 영역(button)으로 넘긴다.
            return (
              <ListRow
                key={m.id}
                variant="media"
                tone="flat"
                separator
                lead={lead}
                eyebrow={eyebrow}
                title={m.title}
                meta={m.description || undefined}
                metaLines={2}
                footer={footer}
                {...(m.locked
                  ? { onClick: () => toast(lockedToastText(m), 'info'), 'aria-disabled': 'true' as const }
                  : { href: `/missions/${m.id}` })}
              />
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
