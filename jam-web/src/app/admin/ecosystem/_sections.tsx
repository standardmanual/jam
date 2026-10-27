/**
 * 생태계 상황판의 구역 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 구역마다 따로 읽고(`page.tsx`의 `Suspense`), 한 구역이 실패하면 그 구역만 안내 카드(`OpsSectionNotice`)가 된다. 원인은 서버 로그에만 남긴다.
 * 스냅샷(`loadEcosystemSnapshot`)은 던지지 않지만 방어로 감싸고, 한 번만 읽어 요약·목표 대비·지도 세 구역에 같이 넘긴다.
 * 정책 패널은 마디가 선택됐을 때만 설정값과 열린 개발 요청을 읽는다.
 *
 * 티켓 20261026_2027 3-2: 운영 홈에서 주간 핵심 지표(`KpiSection`)·배지 경제 흐름(`TrendSection`)·통계(`StatsSection`)를 옮겨 왔다.
 * 내용과 계산은 운영 홈에서 쓰던 그대로이고, 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`).
 * 구역 안의 출처가 여럿이면 일부만 못 읽은 것은 그 칸·그래프의 기존 오류 표시를 두고, 전부 못 읽었을 때 구역 안내 카드가 된다.
 */
import Link from 'next/link'
import type { ComponentProps } from 'react'
import { IconAward, IconBook, IconMapPin, IconUsers } from '@tabler/icons-react'
import { EcosystemGoalRows } from '@/components/admin/ecosystem/EcosystemGoalRows'
import { EcosystemLoopMap } from '@/components/admin/ecosystem/EcosystemLoopMap'
import { EcosystemPolicyPanel } from '@/components/admin/ecosystem/EcosystemPolicyPanel'
import { EcosystemSummary } from '@/components/admin/ecosystem/EcosystemSummary'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { WeeklyKpiCards, type WeeklyKpiProps } from '@/app/admin/DashboardSignals'
import EconomyTrend, { type TrendSeries } from '@/app/admin/EconomyTrend'
import { listDevRequests } from '@/lib/admin/devRequests/store'
import { trendDates, bucketDailyCounts, fetchBadgeIssuanceDaily, fetchAmbientDropDaily, TREND_LONG_DAYS, TREND_SHORT_DAYS } from '@/lib/admin/economyTrend'
import { loadEcosystemSnapshot } from '@/lib/admin/ecosystem/load'
import type { EcosystemNodeId, EcosystemSnapshot } from '@/lib/admin/ecosystem/types'
import { openRequestByPolicy, summaryOf } from '@/lib/admin/ecosystem/view'
import { messageOf, type KpiWeeklyPair } from '@/lib/admin/kpiWeeklyPair'
import { loadPolicyLiveValues } from '@/lib/admin/policyDashboard/liveValues'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { logQueryError } from '@/lib/admin/queryError'
import { kstDayBoundsIso, todayKstDateString } from '@/lib/admin/today-calendar'
import { createServiceClient } from '@/lib/supabase/server'

/** 구역별 조회 실패 제목. 받침에 따라 조사가 달라 문장으로 적는다 */
export const ECOSYSTEM_NOTICE_TITLES = {
  goal: '목표 대비를 불러오지 못했어요',
  map: '순환 지도를 불러오지 못했어요',
  policy: '정책을 불러오지 못했어요',
  kpi: '주간 핵심 지표를 불러오지 못했어요',
  trend: '배지 경제 흐름을 불러오지 못했어요',
  stats: '통계를 불러오지 못했어요',
} as const

const STATS_LOAD_FAILED_DESCRIPTION =
  '서비스 키가 설정되지 않았을 수 있어요. Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY를 설정한 뒤 새로 고쳐 주세요'

export type SnapshotRead = { ok: true; snapshot: EcosystemSnapshot } | { ok: false }

/** 스냅샷을 읽기 시작한다. 거절되지 않는다(실패는 `{ ok: false }`로 담는다) */
export async function startSnapshot(): Promise<SnapshotRead> {
  try {
    return { ok: true, snapshot: await loadEcosystemSnapshot(createServiceClient(), new Date()) }
  } catch (error) {
    console.error('[admin/ecosystem] 스냅샷 읽기 오류:', error)
    return { ok: false }
  }
}

/** 요약 줄. 스냅샷을 못 읽으면 목표 대비·지도 구역이 안내 카드를 보이므로 여기서는 아무것도 그리지 않는다 */
export async function SummarySection({ read }: { read: Promise<SnapshotRead> }) {
  const result = await read
  if (!result.ok) return null
  const { attention, errors } = summaryOf(result.snapshot)
  return <EcosystemSummary attention={attention} errors={errors} generatedAt={result.snapshot.generatedAt} />
}

export async function GoalSection({ read }: { read: Promise<SnapshotRead> }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.goal} />
  return <EcosystemGoalRows rows={result.snapshot.goalRows} />
}

export async function MapSection({ read, selected }: { read: Promise<SnapshotRead>; selected: EcosystemNodeId | null }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.map} />
  return <EcosystemLoopMap nodes={result.snapshot.nodes} selected={selected} />
}

export async function PolicySection({ node }: { node: EcosystemNodeId | null }) {
  let liveValues: Record<string, unknown> = {}
  let openRequests = openRequestByPolicy([])
  if (node !== null) {
    try {
      const [values, requests] = await Promise.all([
        loadPolicyLiveValues(),
        listDevRequests(createServiceClient(), { status: 'requested' }),
      ])
      liveValues = values
      openRequests = openRequestByPolicy(requests)
    } catch (error) {
      console.error('[admin/ecosystem] 정책 패널 읽기 오류:', error)
      return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.policy} />
    }
  }
  return <EcosystemPolicyPanel nodeId={node} policies={POLICIES_DATA} liveValues={liveValues} openRequests={openRequests} />
}

// ── 주간 핵심 지표 ───────────────────────────────────────────────────────────────────────────────

/** 주간 핵심 지표 두 장. 이번 주 값을 못 읽으면(두 장이 모두 기대는 값이다) 구역이 안내 카드다. 지난주만 못 읽으면 「비교 불가」로 둔다. */
export async function KpiSection({ kpi }: { kpi: Promise<KpiWeeklyPair> }) {
  let props: WeeklyKpiProps
  try {
    const { thisWeek, lastWeek } = await kpi
    if (thisWeek.metrics === null) throw new Error(thisWeek.error ?? '주간 지표를 읽지 못했어요')
    props = {
      missionAchievers: {
        value: thisWeek.metrics.missionAchievers.value,
        previousValue: lastWeek.metrics?.missionAchievers.value ?? null,
        error: null,
      },
      badgeIssuance: {
        value: thisWeek.metrics.badgeIssuance.issued.value,
        previousValue: lastWeek.metrics?.badgeIssuance.issued.value ?? null,
        error: null,
      },
    }
  } catch (error) {
    console.error('[admin/ecosystem] 주간 핵심 지표 구역 오류:', error)
    return <OpsSectionNotice icon="kpi" title={ECOSYSTEM_NOTICE_TITLES.kpi} />
  }
  return <WeeklyKpiCards {...props} />
}

// ── 배지 경제 흐름 ───────────────────────────────────────────────────────────────────────────────

interface TrendSectionProps {
  /** `?trend=`. `7`이면 7일, 그 외는 30일이다. */
  trendParam: string | undefined
  /** 선택한 마디. 기간 전환 링크가 유지한다. */
  node: EcosystemNodeId | null
}

/**
 * 20260924_0911: 배지 발급량·앰비언트 드랍량은 30일 범위로 한 번씩만 읽고 7일 보기는 그 결과에서 잘라 쓴다.
 * 두 조회는 서로 독립적으로 실패한다(한쪽 그래프만 오류 카드로 바뀐다). 둘 다 못 읽으면 구역이 안내 카드다.
 */
export async function TrendSection({ trendParam, node }: TrendSectionProps) {
  let view: Pick<ComponentProps<typeof EconomyTrend>, 'dates' | 'days' | 'todayKst' | 'badges' | 'drops'>
  try {
    const trendDays = trendParam === String(TREND_SHORT_DAYS) ? TREND_SHORT_DAYS : TREND_LONG_DAYS
    const todayKst = todayKstDateString()
    const longDates = trendDates(TREND_LONG_DAYS, todayKst)
    const trendDateList = longDates.slice(longDates.length - trendDays)
    const { startIso: trendStartIso } = kstDayBoundsIso(longDates[0])
    const { endIso: trendEndIso } = kstDayBoundsIso(todayKst)
    const loadTrendSeries = async (fetcher: (startIso: string, endIso: string) => Promise<string[]>): Promise<TrendSeries> => {
      try {
        const stamps = await fetcher(trendStartIso, trendEndIso)
        return { counts: bucketDailyCounts(stamps, longDates).slice(longDates.length - trendDays), error: null }
      } catch (error) {
        return { counts: null, error: messageOf(error) }
      }
    }
    const [badgeTrend, dropTrend] = await Promise.all([
      loadTrendSeries(fetchBadgeIssuanceDaily),
      loadTrendSeries(fetchAmbientDropDaily),
    ])
    if (badgeTrend.counts === null && dropTrend.counts === null) {
      throw new Error(`배지 경제 흐름을 모두 읽지 못했어요: ${badgeTrend.error ?? ''}`)
    }
    view = { dates: trendDateList, days: trendDays, todayKst, badges: badgeTrend, drops: dropTrend }
  } catch (error) {
    console.error('[admin/ecosystem] 배지 경제 흐름 구역 오류:', error)
    return <OpsSectionNotice icon="trend" title={ECOSYSTEM_NOTICE_TITLES.trend} />
  }
  return <EconomyTrend {...view} node={node} />
}

// ── 통계 ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * 통계 4칸. 한 칸의 조회 실패가 화면 전체를 막지 않도록 던지지 않는다 — 실패한 칸은 null로 두어 「—」로 표시하고(0건과 구분), 원인은 서버 로그에 남긴다(티켓 20260925_2004).
 * 서비스 클라이언트를 만들지 못하는 경우(서비스 키 없음)는 구역 안내 카드다(옛 「서비스 클라이언트 오류」 배너를 대신한다).
 */
export async function StatsSection() {
  let stats: Array<{ label: string; value: number | null; href: string; icon: typeof IconAward }>
  try {
    const supabase = createServiceClient()
    const [b, p, ib, u] = await Promise.all([
      supabase.from('badges').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('poi').select('*', { count: 'exact', head: true }),
      supabase.from('item_books').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
    ])
    logQueryError(b.error, 'dashboard/badge-count')
    logQueryError(p.error, 'dashboard/poi-count')
    logQueryError(ib.error, 'dashboard/item-book-count')
    logQueryError(u.error, 'dashboard/user-count')
    stats = [
      { label: '배지', value: b.error ? null : (b.count ?? 0), href: '/admin/badges', icon: IconAward },
      { label: '장소', value: p.error ? null : (p.count ?? 0), href: '/admin/poi', icon: IconMapPin },
      { label: '컬렉션', value: ib.error ? null : (ib.count ?? 0), href: '/admin/itembooks', icon: IconBook },
      { label: '유저', value: u.error ? null : (u.count ?? 0), href: '/admin/users', icon: IconUsers },
    ]
  } catch (error) {
    console.error('[admin/ecosystem] 통계 구역 오류:', error)
    return <OpsSectionNotice icon="stats" title={ECOSYSTEM_NOTICE_TITLES.stats} description={STATS_LOAD_FAILED_DESCRIPTION} />
  }
  return (
    <section aria-label="통계" className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="bg-white border border-border rounded-2xl p-5 hover:border-foreground/30 transition-colors"
        >
          <stat.icon className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-3xl font-bold tabular-nums" title={stat.value === null ? '불러오지 못했어요' : undefined}>
            {stat.value === null ? '—' : stat.value.toLocaleString()}
          </p>
          <p className="text-muted-foreground text-sm mt-1">{stat.label}</p>
          {stat.value === null && <p className="text-red-700 text-xs mt-1">불러오지 못했어요</p>}
        </Link>
      ))}
    </section>
  )
}
