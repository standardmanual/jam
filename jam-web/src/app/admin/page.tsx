import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  IconAward,
  IconMapPin,
  IconBook,
  IconUsers,
  IconPlus,
  IconMapPinPlus,
  IconNotes,
  IconDeviceGamepad2,
} from '@tabler/icons-react'
import WeeklyCalendar, { type CalendarColumn, type CalendarCellItem } from './WeeklyCalendar'
import DashboardSignals, { type DashboardSignalsProps } from './DashboardSignals'
import { logQueryError } from '@/lib/admin/queryError'
import { fetchContentGaps, type ContentGaps } from '@/lib/admin/contentGaps'
import {
  getWeeklyCronOccurrences,
  formatOccurrenceTime,
  cronOccurrenceId,
  normalizeWeekParam,
  formatWeekRangeLabel,
} from '@/lib/admin/cronSchedule'
import { weeklyRoutineOccurrences, routineOccurrenceId } from '@/lib/admin/scheduledRoutines'
import { shiftDateStr, kstDayBoundsIso, todayKstDateString } from '@/lib/admin/today-calendar'
import { weeklyCards, type WeeklyCardDay, type WeeklyCardInput } from '@/lib/admin/weeklyCards'
import {
  fetchWeeklyCardMetrics,
  fetchFirstEventKstDate,
  formatCardMetricsNote,
  cardMetricKey,
  type CardMetricCounts,
} from '@/lib/admin/weeklyCardMetrics'
import { weeklyMissions, type WeeklyMissionInput, type WeeklyMissionsResult } from '@/lib/admin/weeklyMissions'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import { computeKpiWeeklyMetrics, resolveKpiWeeklyRange, DEFAULT_KPI_WEEKLY_DAYS } from '@/lib/admin/kpiWeekly'
import {
  trendDates,
  bucketDailyCounts,
  fetchBadgeIssuanceDaily,
  fetchAmbientDropDaily,
  TREND_LONG_DAYS,
  TREND_SHORT_DAYS,
} from '@/lib/admin/economyTrend'
import EconomyTrend, { type TrendSeries } from './EconomyTrend'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface AdminDashboardPageProps {
  searchParams: Promise<{ week?: SearchParamValue; trend?: SearchParamValue }>
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  // 20260924_0904: 어드민 메인 주간 캘린더 — 크론 4개의 실행 예정을 요일 칸에 표시한다.
  // 20260924_0905: Claude 예약 루틴 4개(주간·선별·주간 배포 승인·월간)도 같은 칸에 얹는다.
  // 20260924_0906: 홈피드 카드 편성(단기 카드 개별 표시·장기 카드 묶음·미편성 판정)도 같은 칸에 얹는다.
  const resolvedSearchParams = await searchParams
  const weekParam = singleQueryParam(resolvedSearchParams.week)
  // 20260924_0911: 배지 경제 흐름 그래프 기간 — `?trend=7`이면 7일, 그 외는 30일.
  const trendDays = singleQueryParam(resolvedSearchParams.trend) === String(TREND_SHORT_DAYS) ? TREND_SHORT_DAYS : TREND_LONG_DAYS
  const weekStart = normalizeWeekParam(weekParam)
  const occurrences = getWeeklyCronOccurrences()
  const routineOccurrences = weeklyRoutineOccurrences(weekStart)

  // 카드 조회는 보고 있는 주 범위로 한 번만 하고, 요일 배분은 순수 함수(weeklyCards)가 한다.
  // 실패해도 크론·루틴 항목과 나머지 영역은 그대로 표시한다(이 페이지의 출처별 격리 원칙) —
  // 실패 시 weeklyCardDays를 null로 둬 "미편성"을 함부로 단정하지 않는다.
  let weeklyCardDays: WeeklyCardDay[] | null = null
  try {
    const supabase = createServiceClient()
    const weekEndDate = shiftDateStr(weekStart, 6)
    const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
    const { endIso: weekEndIso } = kstDayBoundsIso(weekEndDate)
    const { data, error } = await supabase
      .from('today_cards')
      .select('id, title, content_type_id, template_type, starts_at, ends_at, is_active, sort_order')
      .lte('starts_at', weekEndIso)
      .gte('ends_at', weekStartIso)
    if (error) throw error
    weeklyCardDays = weeklyCards((data ?? []) as WeeklyCardInput[], weekStart)
  } catch {
    weeklyCardDays = null
  }

  // 20260924_0908: 단기 카드의 노출·열람 수. 오늘 이전(포함) 날짜가 있는 주에서만 1번 조회한다 —
  // 미래 주는 조회하지 않는다. 실패하면 null로 두고 카드 항목 아래 수치 줄만 비운다(출처별 격리).
  const todayKst = todayKstDateString()
  let cardMetrics: { counts: Map<string, CardMetricCounts>; firstEventDate: string | null } | null = null
  if (weeklyCardDays && weekStart <= todayKst) {
    try {
      const cardIds = [...new Set(weeklyCardDays.flatMap((d) => d.shortCards.map((c) => c.id)))]
      const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
      const { endIso: weekEndIso } = kstDayBoundsIso(shiftDateStr(weekStart, 6))
      const [counts, firstEventDate] = await Promise.all([
        fetchWeeklyCardMetrics(cardIds, weekStartIso, weekEndIso),
        fetchFirstEventKstDate(),
      ])
      cardMetrics = { counts, firstEventDate }
    } catch {
      cardMetrics = null
    }
  }

  // 20260924_0907: 미션도 보고 있는 주 범위로 한 번만 조회한다(필요한 컬럼만). 실패하면 null로 두고
  // 막대·"상시 미션 N개" 줄만 숨긴다 — 크론·루틴·카드 표시는 그대로다(출처별 격리).
  let missionsWeek: WeeklyMissionsResult | null = null
  try {
    const supabase = createServiceClient()
    const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
    const { endIso: weekEndIso } = kstDayBoundsIso(shiftDateStr(weekStart, 6))
    const { data, error } = await supabase
      .from('missions')
      .select('id, title, starts_at, ends_at, gate_axis')
      .lte('starts_at', weekEndIso)
      .or(`ends_at.is.null,ends_at.gte.${weekStartIso}`)
    if (error) throw error
    missionsWeek = weeklyMissions((data ?? []) as WeeklyMissionInput[], weekStart)
  } catch {
    missionsWeek = null
  }

  // 20260924_0911: 배지 발급량·앰비언트 드랍량은 30일 범위로 한 번씩만 읽고 7일 보기는 그 결과에서 잘라 쓴다.
  // 두 조회는 서로 독립적으로 실패한다(한쪽 그래프만 오류 카드로 바뀐다).
  const longDates = trendDates(TREND_LONG_DAYS, todayKst)
  const trendDateList = longDates.slice(longDates.length - trendDays)
  const { startIso: trendStartIso } = kstDayBoundsIso(longDates[0])
  const { endIso: trendEndIso } = kstDayBoundsIso(todayKst)
  const loadTrendSeries = async (fetcher: (startIso: string, endIso: string) => Promise<string[]>): Promise<TrendSeries> => {
    try {
      const stamps = await fetcher(trendStartIso, trendEndIso)
      return { counts: bucketDailyCounts(stamps, longDates).slice(longDates.length - trendDays), error: null }
    } catch (e) {
      return { counts: null, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const [badgeTrend, dropTrend] = await Promise.all([
    loadTrendSeries(fetchBadgeIssuanceDaily),
    loadTrendSeries(fetchAmbientDropDaily),
  ])

  const columns: CalendarColumn[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateStr(weekStart, i)
    const weekday = (i + 1) % 7 // i=0(월)→1 ... i=6(일)→0, cron 요일 인덱스(0=일..6=토)와 동일
    const cardDay = weeklyCardDays?.[i]

    // 카드 항목 id는 카드 id와 날짜를 함께 써서 같은 날짜 안에서 겹치지 않게 한다(티켓 20260924_0906).
    // 시각 자리에는 유형 ID(없으면 "유형 없음")를, 누르면 TodayCardTable.tsx의 [상세보기]와 같은 경로로 간다.
    const cardItems: CalendarCellItem[] = (cardDay?.shortCards ?? []).map((c) => ({
      id: `card-${c.id}-${date}`,
      time: c.content_type_id ?? '유형 없음',
      label: c.title,
      kind: 'card',
      dim: !c.is_active,
      href: `/admin/today/${c.id}?date=${date}`,
      note: cardMetrics
        ? (formatCardMetricsNote({
            date,
            today: todayKst,
            firstEventDate: cardMetrics.firstEventDate,
            counts: cardMetrics.counts.get(cardMetricKey(c.id, date)),
          }) ?? undefined)
        : undefined,
    }))

    // 그 주에 새로 시작하는 상시 미션은 시작 요일 칸에 "시작" 항목으로 보여 준다(티켓 20260924_0907).
    const missionItems: CalendarCellItem[] = (missionsWeek?.openEndedStarting ?? [])
      .filter((m) => m.date === date)
      .map((m) => ({
        id: `mission-${m.id}`,
        time: '상시',
        label: m.title,
        kind: 'mission',
        href: `/admin/missions/${m.id}`,
      }))

    // 항목 id에는 실행 시각을 포함해 같은 날짜 안에서 겹치지 않게 한다(티켓 20260924_0930).
    const cronItems = occurrences
      .filter((o) => o.weekday === weekday)
      .map((o) => ({
        item: { id: cronOccurrenceId(o, date), time: formatOccurrenceTime(o), label: o.label } satisfies CalendarCellItem,
        sortMinutes: o.hourly ? -1 : o.hour * 60 + o.minute,
      }))
    const routineItems = routineOccurrences
      .filter((r) => r.date === date)
      .map((r) => {
        const [hour, minute] = r.time.split(':').map(Number)
        return {
          item: {
            id: routineOccurrenceId(r),
            time: r.time,
            label: r.label,
            kind: 'routine',
            dim: !r.enabled,
          } satisfies CalendarCellItem,
          sortMinutes: hour * 60 + minute,
        }
      })
    // 카드 항목은 칸 안에서 자동화 항목(크론·루틴)보다 위에 둔다(티켓 20260924_0906).
    const automationItems = [...cronItems, ...routineItems]
      .sort((a, b) => a.sortMinutes - b.sortMinutes)
      .map(({ item }) => item)

    return {
      date,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      dateLabel: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`,
      items: [...cardItems, ...missionItems, ...automationItems],
      longCardsCount: cardDay?.longActiveCount,
      unprogrammed: cardDay?.unprogrammed,
    }
  })

  // 20260924_0909: 이상 신호(Strava 동기화 실패·제재·차단 POI)·주간 핵심 지표. 출처 4개
  // (이번 주/지난주 집계, 밴, POI 차단)는 서로 다른 쿼리라 각자 try/catch로 감싼다 —
  // 하나가 실패해도 나머지 수치는 표시된다(완료 조건).
  const now = new Date()
  const thisWeekRange = resolveKpiWeeklyRange(null, now)
  // 직전 7일 구간 — resolveKpiWeeklyRange(days, now)의 now 자리에 "7일 전 시각"을 넣으면
  // start=14일 전 · end=7일 전인, 이번 주 바로 앞 7일 구간이 그대로 나온다(같은 함수 재사용).
  const lastWeekRange = resolveKpiWeeklyRange(
    null,
    new Date(now.getTime() - DEFAULT_KPI_WEEKLY_DAYS * 24 * 60 * 60 * 1000)
  )

  // 20260924_0912: 컨텐츠 공백 경고. 캘린더가 보는 주와 무관하게 "지금" 기준으로 따로 조회한다.
  // fetchContentGaps가 미션·카드를 독립적으로 잡아 돌려주고, 통째로 실패하면 undefined로 두어 두 카드만 비운다.
  const contentGapsPromise: Promise<ContentGaps | undefined> = fetchContentGaps(now).catch(() => undefined)

  const [thisWeekResult, lastWeekResult, shadowBanResult, blockedPoiResult, contentGaps] = await Promise.all([
    computeKpiWeeklyMetrics(thisWeekRange)
      .then((metrics) => ({ metrics, error: null }))
      .catch((e) => ({ metrics: null, error: e instanceof Error ? e.message : String(e) })),
    computeKpiWeeklyMetrics(lastWeekRange)
      .then((metrics) => ({ metrics, error: null }))
      .catch((e) => ({ metrics: null, error: e instanceof Error ? e.message : String(e) })),
    (async () => {
      try {
        const supabase = createServiceClient()
        // 만료된 제재는 효력이 없으므로(lib/abusing/shadow-ban.ts의 판정과 같은 기준) 유효한 제재만 센다
        const { count, error } = await supabase
          .from('user_shadow_bans')
          .select('id', { count: 'exact', head: true })
          .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
        if (error) throw error
        return { count: count ?? 0, error: null }
      } catch (e) {
        return { count: null, error: e instanceof Error ? e.message : String(e) }
      }
    })(),
    (async () => {
      try {
        const supabase = createServiceClient()
        const { count, error } = await supabase
          .from('poi_blocks')
          .select('id', { count: 'exact', head: true })
          .gt('blocked_until', new Date().toISOString())
        if (error) throw error
        return { count: count ?? 0, error: null }
      } catch (e) {
        return { count: null, error: e instanceof Error ? e.message : String(e) }
      }
    })(),
    contentGapsPromise,
  ])

  const dashboardSignals: DashboardSignalsProps = {
    stravaSyncFailures: {
      value: thisWeekResult.metrics?.stravaSyncFailures.value ?? null,
      previousValue: lastWeekResult.metrics?.stravaSyncFailures.value ?? null,
      error: thisWeekResult.error,
    },
    shadowBans: { value: shadowBanResult.count, error: shadowBanResult.error },
    blockedPoi: { value: blockedPoiResult.count, error: blockedPoiResult.error },
    missionAchievers: {
      value: thisWeekResult.metrics?.missionAchievers.value ?? null,
      previousValue: lastWeekResult.metrics?.missionAchievers.value ?? null,
      error: thisWeekResult.error,
    },
    badgeIssuance: {
      value: thisWeekResult.metrics?.badgeIssuance.issued.value ?? null,
      previousValue: lastWeekResult.metrics?.badgeIssuance.issued.value ?? null,
      error: thisWeekResult.error,
    },
    contentGaps,
  }

  let badgeCount: number | null = null
  let poiCount: number | null = null
  let itemBookCount: number | null = null
  let userCount: number | null = null
  let serviceError: string | null = null

  try {
    const supabase = createServiceClient()
    const [b, p, ib, u] = await Promise.all([
      supabase.from('badges').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('poi').select('*', { count: 'exact', head: true }),
      supabase.from('item_books').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
    ])
    // 통계 한 칸의 조회 실패가 화면 전체를 막지 않도록 던지지 않는다 — 실패한 칸은 null로 두어
    // 「—」로 표시하고(0건과 구분), 원인은 서버 로그에 남긴다(티켓 20260925_2004).
    logQueryError(b.error, 'dashboard/badge-count')
    logQueryError(p.error, 'dashboard/poi-count')
    logQueryError(ib.error, 'dashboard/item-book-count')
    logQueryError(u.error, 'dashboard/user-count')
    badgeCount = b.error ? null : (b.count ?? 0)
    poiCount = p.error ? null : (p.count ?? 0)
    itemBookCount = ib.error ? null : (ib.count ?? 0)
    userCount = u.error ? null : (u.count ?? 0)
  } catch (e) {
    serviceError = e instanceof Error ? e.message : 'Service client initialization failed'
  }

  const stats = [
    { label: '배지', value: badgeCount, href: '/admin/badges', icon: IconAward },
    { label: 'POI', value: poiCount, href: '/admin/poi', icon: IconMapPin },
    { label: '컬렉션', value: itemBookCount, href: '/admin/itembooks', icon: IconBook },
    { label: '유저', value: userCount, href: '/admin/users', icon: IconUsers },
  ]


  const shortcuts = [
    { label: '배지 등록', href: '/admin/badges/new', icon: IconPlus },
    { label: 'POI 등록', href: '/admin/poi/new', icon: IconMapPinPlus },
    { label: '컬렉션 등록', href: '/admin/itembooks/new', icon: IconNotes },
    { label: '시뮬레이터 실행', href: '/admin/simulator', icon: IconDeviceGamepad2 },
  ]

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-8">대시보드</h1>

      <DashboardSignals {...dashboardSignals} />

      {serviceError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          <p className="font-semibold mb-1">서비스 클라이언트 오류</p>
          <p className="text-red-500">Vercel 환경변수에 <code className="bg-muted px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>를 설정해주세요.</p>
          <p className="text-red-600 text-xs mt-1">{serviceError}</p>
        </div>
      )}

      <WeeklyCalendar
        weekStart={weekStart}
        weekRangeLabel={formatWeekRangeLabel(weekStart)}
        columns={columns}
        missionBars={missionsWeek?.bars}
        openEndedMissionCount={missionsWeek?.openEndedCount}
      />

      <EconomyTrend
        dates={trendDateList}
        days={trendDays}
        todayKst={todayKst}
        week={weekParam ? weekStart : null}
        badges={badgeTrend}
        drops={dropTrend}
      />

      <div className="grid grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white border border-border rounded-2xl p-5 hover:border-foreground/30 transition-colors"
          >
            <stat.icon className="mb-2 h-8 w-8 text-muted-foreground" />
            <p
              className="text-3xl font-bold tabular-nums"
              title={stat.value === null ? '불러오지 못했어요' : undefined}
            >
              {stat.value === null ? '—' : stat.value.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-sm mt-1">{stat.label}</p>
            {stat.value === null && <p className="text-red-500 text-xs mt-1">불러오지 못했어요</p>}
          </Link>
        ))}
      </div>

      <h2 className="text-base font-semibold mb-4 text-foreground">빠른 실행</h2>
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-3 bg-white border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <s.icon className="h-6 w-6 text-muted-foreground" />
            <span className="font-medium">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
