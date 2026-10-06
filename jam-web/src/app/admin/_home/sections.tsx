import Link from 'next/link'
import type { ComponentProps } from 'react'
import { IconAward, IconMapPin, IconBook, IconUsers } from '@tabler/icons-react'
import { createServiceClient } from '@/lib/supabase/server'
import { OpsRecentDecisions } from '@/components/admin/ops/OpsRecentDecisions'
import { OpsSampleSwitch } from '@/components/admin/ops/OpsSampleSwitch'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { OpsSignalPanel } from '@/components/admin/ops/OpsSignalPanel'
import { OpsWeekStatus } from '@/components/admin/ops/OpsWeekStatus'
import { logQueryError } from '@/lib/admin/queryError'
import { fetchContentGaps, type ContentGapSource, type MissionGapResult } from '@/lib/admin/contentGaps'
import { listRecentOpsDecisions, type OpsRecentDecisionRecord } from '@/lib/admin/opsDecisions/read'
import { computeWeekStatus, showsNextWeekRow, weekStartOf, type WeekStatus } from '@/lib/admin/opsHome/homeView'
import { loadDayCompositions, loadOpsSignals, type LoadedOpsSignals } from '@/lib/admin/opsSignals/load'
import { loadSignalOverrides } from '@/lib/admin/opsSignals/overrides'
import { resolveThresholdValues } from '@/lib/admin/opsSignals/thresholds'
import { computeKpiWeeklyMetrics, resolveKpiWeeklyRange, DEFAULT_KPI_WEEKLY_DAYS, type KpiWeeklyMetrics } from '@/lib/admin/kpiWeekly'
import { normalizeWeekParam } from '@/lib/admin/cronSchedule'
import { shiftDateStr, kstDayBoundsIso, todayKstDateString } from '@/lib/admin/today-calendar'
import {
  trendDates,
  bucketDailyCounts,
  fetchBadgeIssuanceDaily,
  fetchAmbientDropDaily,
  TREND_LONG_DAYS,
  TREND_SHORT_DAYS,
} from '@/lib/admin/economyTrend'
import {
  ServiceCheckRow,
  WeeklyKpiCards,
  type DashboardSignalMetric,
  type ServiceCheckProps,
  type WeeklyKpiProps,
} from '../DashboardSignals'
import EconomyTrend, { type TrendSeries } from '../EconomyTrend'

/**
 * 운영 홈(`/admin`)의 구역들 (티켓 20261006_1341 ②-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 「구역 상태」).
 *
 * 구역마다 따로 읽는 **서버 컴포넌트**다. 페이지가 구역마다 `Suspense` + 스켈레톤으로 감싸서, 느린 구역이 다른 구역을 막지 않는다(승인 #18).
 * 한 구역을 읽지 못하면 그 구역만 `OpsSectionNotice`(안내 카드 + [새로 고치기])가 되고 나머지는 그대로다. `unstable_cache`·`revalidate`·React `cache`는 쓰지 않는다
 * (운영 홈은 지금 상태를 보는 화면이라 캐시하지 않는다 — `__tests__/home-sections.test.tsx`가 소스를 지킨다).
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다 — 렌더 오류는 `try/catch`로 잡히지 않기 때문이다).
 *
 * 구역 안의 출처가 여럿이면 일부만 못 읽은 것은 그 칸·그래프의 기존 오류 표시를 그대로 둔다(「나머지 수치는 표시된다」, 티켓 20260924_0909·0911).
 * 구역이 읽는 것을 **전부** 못 읽었을 때 구역 안내 카드가 된다. 실패를 0이나 빈 상태로 보이지 않는다.
 *
 * 주간 캘린더 구역은 `CalendarSection.tsx`다(그대로 옮긴 것).
 */

/** 구역별 조회 실패 제목. 받침에 따라 조사가 달라 문장으로 적는다. */
export const SECTION_NOTICE_TITLES = {
  week: '이번 주 상태를 불러오지 못했어요',
  signal: '신호를 불러오지 못했어요',
  history: '최근 이력을 불러오지 못했어요',
  service: '서비스 점검을 불러오지 못했어요',
  kpi: '주간 핵심 지표를 불러오지 못했어요',
  trend: '배지 경제 흐름을 불러오지 못했어요',
  stats: '통계를 불러오지 못했어요',
} as const

const STATS_LOAD_FAILED_DESCRIPTION =
  '서비스 키가 설정되지 않았을 수 있어요. Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY를 설정한 뒤 새로 고쳐 주세요'

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

// ── 이번 주 상태 ─────────────────────────────────────────────────────────────────────────────────

/**
 * 이번 주 상태. 다음 주 줄을 보일 수 있어 이번 주와 다음 주 14일치를 한 번에 읽는다(`computeWeekStatus`에 넘길 날짜 구성은 그 주 7일을 모두 담아야 한다).
 * 재료(카드·미션·묶음) 가운데 하나라도 못 읽으면 숫자가 틀려지므로 구역 전체가 안내 카드다.
 */
export async function WeekStatusSection({ includeSample }: { includeSample: boolean }) {
  let view: { status: WeekStatus; nextWeek: WeekStatus | null }
  try {
    const now = new Date()
    const weekStart = weekStartOf(now)
    const [loaded, overrides] = await Promise.all([
      loadDayCompositions({ from: weekStart, to: shiftDateStr(weekStart, 13), includeSample }),
      loadSignalOverrides(createServiceClient()),
    ])
    const failedSources = Object.keys(loaded.sourceErrors)
    if (loaded.bundles === null || failedSources.length > 0) {
      throw new Error(`이번 주 상태의 재료를 읽지 못했어요: ${failedSources.join(', ')}`)
    }
    const input = { bundles: loaded.bundles, compositions: loaded.compositions, includeSample }
    const status = computeWeekStatus({ ...input, weekStart })
    const showNextWeek = showsNextWeekRow({
      now,
      bundles: loaded.bundles,
      nextWeekCheckFromWeekday: resolveThresholdValues(overrides).nextWeekCheckFromWeekday,
      includeSample,
    })
    const nextWeek = showNextWeek ? computeWeekStatus({ ...input, weekStart: shiftDateStr(weekStart, 7) }) : null
    view = { status, nextWeek }
  } catch (error) {
    console.error('[admin/home] 이번 주 상태 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SECTION_NOTICE_TITLES.week} />
  }
  return <OpsWeekStatus status={view.status} nextWeek={view.nextWeek} includeSample={includeSample} />
}

// ── 신호 ─────────────────────────────────────────────────────────────────────────────────────────

/** 신호 13종. 재료 하나를 못 읽은 것은 `loadOpsSignals`가 그 신호만 「확인하지 못했어요」로 돌려준다(패널이 그린다). 던지면 구역 전체가 안내 카드다. */
export async function SignalSection({ includeSample }: { includeSample: boolean }) {
  let signals: LoadedOpsSignals['signals']
  try {
    signals = (await loadOpsSignals({ includeSample })).signals
  } catch (error) {
    console.error('[admin/home] 신호 구역 오류:', error)
    return <OpsSectionNotice icon="signal" title={SECTION_NOTICE_TITLES.signal} />
  }
  return <OpsSignalPanel signals={signals} includeSample={includeSample} />
}

// ── 서비스 점검·주간 핵심 지표 ───────────────────────────────────────────────────────────────────

interface KpiResult {
  metrics: KpiWeeklyMetrics | null
  error: string | null
}

/** 이번 주와 지난주의 주간 지표. 둘 다 던지지 않고 실패 사유를 담는다. */
export interface KpiWeeklyPair {
  thisWeek: KpiResult
  lastWeek: KpiResult
}

/**
 * 주간 지표 두 구간(이번 7일·직전 7일)을 읽기 시작한다. **페이지에서 한 번만** 불러 서비스 점검(Strava 칸)과 주간 핵심 지표 두 구역에 같은 약속을 넘긴다.
 * 약속은 거부되지 않는다 — 실패는 `error`에 담긴다.
 */
export function startKpiWeekly(now: Date = new Date()): Promise<KpiWeeklyPair> {
  const thisWeekRange = resolveKpiWeeklyRange(null, now)
  // 직전 7일 구간 — resolveKpiWeeklyRange(days, now)의 now 자리에 "7일 전 시각"을 넣으면
  // start=14일 전 · end=7일 전인, 이번 주 바로 앞 7일 구간이 그대로 나온다(같은 함수 재사용).
  const lastWeekRange = resolveKpiWeeklyRange(null, new Date(now.getTime() - DEFAULT_KPI_WEEKLY_DAYS * 24 * 60 * 60 * 1000))
  const settle = (range: ReturnType<typeof resolveKpiWeeklyRange>): Promise<KpiResult> =>
    computeKpiWeeklyMetrics(range)
      .then((metrics): KpiResult => ({ metrics, error: null }))
      .catch((error): KpiResult => ({ metrics: null, error: messageOf(error) }))
  return Promise.all([settle(thisWeekRange), settle(lastWeekRange)]).then(([thisWeek, lastWeek]) => ({ thisWeek, lastWeek }))
}

async function readShadowBans(now: Date): Promise<DashboardSignalMetric> {
  try {
    const supabase = createServiceClient()
    // 만료된 제재는 효력이 없으므로(lib/abusing/shadow-ban.ts의 판정과 같은 기준) 유효한 제재만 센다
    const { count, error } = await supabase
      .from('user_shadow_bans')
      .select('id', { count: 'exact', head: true })
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    if (error) throw error
    return { value: count ?? 0, error: null }
  } catch (error) {
    return { value: null, error: messageOf(error) }
  }
}

async function readBlockedPoi(now: Date): Promise<DashboardSignalMetric> {
  try {
    const supabase = createServiceClient()
    const { count, error } = await supabase
      .from('poi_blocks')
      .select('id', { count: 'exact', head: true })
      .gt('blocked_until', now.toISOString())
    if (error) throw error
    return { value: count ?? 0, error: null }
  } catch (error) {
    return { value: null, error: messageOf(error) }
  }
}

/** 20260924_0912: 미션 공백. 캘린더가 보는 주와 무관하게 "지금" 기준으로 따로 읽는다. 카드 편성 공백(승인 #15)은 화면에서 빠졌다. */
async function readMissionGaps(now: Date): Promise<ContentGapSource<MissionGapResult>> {
  try {
    return (await fetchContentGaps(now)).missions
  } catch (error) {
    return { result: null, error: messageOf(error) }
  }
}

/**
 * 서비스 점검 한 줄 4칸(Strava·제재·차단 POI·미션 공백). 칸 하나를 못 읽으면 그 칸만 오류 카드다(옛 이상 신호와 같다).
 * 구역이 직접 읽는 제재·차단 POI·미션 공백 셋을 모두 못 읽으면(서비스 키·DB 문제) 한 줄을 안내 카드로 바꾼다.
 */
export async function ServiceCheckSection({ kpi }: { kpi: Promise<KpiWeeklyPair> }) {
  let props: ServiceCheckProps
  try {
    const now = new Date()
    const [{ thisWeek, lastWeek }, shadowBans, blockedPoi, missionGaps] = await Promise.all([
      kpi,
      readShadowBans(now),
      readBlockedPoi(now),
      readMissionGaps(now),
    ])
    if (shadowBans.error !== null && blockedPoi.error !== null && missionGaps.result === null) {
      throw new Error(`서비스 점검의 재료를 모두 읽지 못했어요: ${shadowBans.error}`)
    }
    props = {
      stravaSyncFailures: {
        value: thisWeek.metrics?.stravaSyncFailures.value ?? null,
        previousValue: lastWeek.metrics?.stravaSyncFailures.value ?? null,
        error: thisWeek.error,
      },
      shadowBans,
      blockedPoi,
      missionGaps,
    }
  } catch (error) {
    console.error('[admin/home] 서비스 점검 구역 오류:', error)
    return <OpsSectionNotice icon="service" title={SECTION_NOTICE_TITLES.service} />
  }
  return <ServiceCheckRow {...props} />
}

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
    console.error('[admin/home] 주간 핵심 지표 구역 오류:', error)
    return <OpsSectionNotice icon="kpi" title={SECTION_NOTICE_TITLES.kpi} />
  }
  return <WeeklyKpiCards {...props} />
}

// ── 최근 이력 ────────────────────────────────────────────────────────────────────────────────────

export async function RecentDecisionsSection({ includeSample }: { includeSample: boolean }) {
  let records: OpsRecentDecisionRecord[]
  try {
    records = await listRecentOpsDecisions(createServiceClient(), { includeSample })
  } catch (error) {
    console.error('[admin/home] 최근 이력 구역 오류:', error)
    return <OpsSectionNotice icon="history" title={SECTION_NOTICE_TITLES.history} />
  }
  return <OpsRecentDecisions records={records} includeSample={includeSample} />
}

// ── 배지 경제 흐름 ───────────────────────────────────────────────────────────────────────────────

interface TrendSectionProps {
  /** `?trend=`. `7`이면 7일, 그 외는 30일이다. */
  trendParam: string | undefined
  /** `?week=`(주간 캘린더가 보는 주). 있으면 기간 전환 링크에서 유지한다. */
  weekParam: string | undefined
  includeSample: boolean
}

/**
 * 20260924_0911: 배지 발급량·앰비언트 드랍량은 30일 범위로 한 번씩만 읽고 7일 보기는 그 결과에서 잘라 쓴다.
 * 두 조회는 서로 독립적으로 실패한다(한쪽 그래프만 오류 카드로 바뀐다). 둘 다 못 읽으면 구역이 안내 카드다.
 */
export async function TrendSection({ trendParam, weekParam, includeSample }: TrendSectionProps) {
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
    console.error('[admin/home] 배지 경제 흐름 구역 오류:', error)
    return <OpsSectionNotice icon="trend" title={SECTION_NOTICE_TITLES.trend} />
  }
  return <EconomyTrend {...view} week={weekParam ? normalizeWeekParam(weekParam) : null} includeSample={includeSample} />
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
      { label: 'POI', value: p.error ? null : (p.count ?? 0), href: '/admin/poi', icon: IconMapPin },
      { label: '컬렉션', value: ib.error ? null : (ib.count ?? 0), href: '/admin/itembooks', icon: IconBook },
      { label: '유저', value: u.error ? null : (u.count ?? 0), href: '/admin/users', icon: IconUsers },
    ]
  } catch (error) {
    console.error('[admin/home] 통계 구역 오류:', error)
    return <OpsSectionNotice icon="stats" title={SECTION_NOTICE_TITLES.stats} description={STATS_LOAD_FAILED_DESCRIPTION} />
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

// ── 시험 스위치 ──────────────────────────────────────────────────────────────────────────────────

/** 시험 묶음 개수. 못 읽으면 null이다(「지금 시험 묶음이 없어요」를 단정하지 않는다). */
async function readSampleBundleCount(): Promise<number | null> {
  try {
    const supabase = createServiceClient()
    const { count, error } = await supabase.from('ops_bundles').select('id', { count: 'exact', head: true }).eq('is_sample', true)
    if (error) throw error
    return count ?? 0
  } catch (error) {
    console.error('[admin/home] 시험 묶음 수 조회 오류:', error)
    return null
  }
}

/** 머리 오른쪽의 시험 묶음 스위치. 시험 묶음이 0개면 스위치 옆에 알리려고 개수를 읽는다. */
export async function SampleSwitchSection({ includeSample }: { includeSample: boolean }) {
  const count = await readSampleBundleCount()
  return <OpsSampleSwitch includeSample={includeSample} sampleBundleCount={count ?? undefined} />
}
