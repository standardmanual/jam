import { createServiceClient } from '@/lib/supabase/server'
import { OpsRecentDecisions } from '@/components/admin/ops/OpsRecentDecisions'
import { OpsSampleSwitch } from '@/components/admin/ops/OpsSampleSwitch'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { OpsSignalPanel } from '@/components/admin/ops/OpsSignalPanel'
import { OpsAgentRows } from '@/components/admin/ops/board/OpsAgentRows'
import { OpsMyTurn } from '@/components/admin/ops/board/OpsMyTurn'
import { OpsWeekFlowMap } from '@/components/admin/ops/board/OpsWeekFlowMap'
import { fetchContentGaps, type ContentGapSource, type MissionGapResult } from '@/lib/admin/contentGaps'
import { listRecentOpsDecisions, type OpsRecentDecisionRecord } from '@/lib/admin/opsDecisions/read'
import { agentRowsOf, weekStripOf } from '@/lib/admin/opsBoard/agentRows'
import { loadWeekFlowInputs } from '@/lib/admin/opsBoard/load'
import { computeMyTurn } from '@/lib/admin/opsBoard/myTurn'
import { flowRowHrefs } from '@/lib/admin/opsBoard/rowLinks'
import { computeWeekFlow } from '@/lib/admin/opsBoard/weekFlow'
import { loadOpsSignals, type LoadedOpsSignals } from '@/lib/admin/opsSignals/load'
import { messageOf, type KpiWeeklyPair } from '@/lib/admin/kpiWeeklyPair'
import { ServiceCheckRow, type DashboardSignalMetric, type ServiceCheckProps } from '../DashboardSignals'

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
 */

/** 구역별 조회 실패 제목. 받침에 따라 조사가 달라 문장으로 적는다. */
export const SECTION_NOTICE_TITLES = {
  board: '운영 상황판을 불러오지 못했어요',
  signal: '신호를 불러오지 못했어요',
  history: '최근 이력을 불러오지 못했어요',
  service: '서비스 점검을 불러오지 못했어요',
} as const

// ── 운영 상황판 ──────────────────────────────────────────────────────────────────────────────────

/**
 * 운영 상황판(티켓 20261026_2023 2회차, 어드민 상황판 PRD §6): 내 차례 카드 줄 → 주간 흐름 지도 → 에이전트 줄·일정 띠를 한 구역으로 묶는다.
 * 읽기는 `loadWeekFlowInputs`(1회차)가 하고, 계산은 `computeMyTurn`·`computeWeekFlow`·`agentRowsOf`가 한다.
 * 출처 하나라도 못 읽으면 숫자가 틀려지므로 구역 전체가 안내 카드다(실패를 0이나 빈 상태로 보이지 않는다).
 */
export async function BoardSection({ includeSample }: { includeSample: boolean }) {
  let view: {
    now: Date
    cards: ReturnType<typeof computeMyTurn>
    rows: ReturnType<typeof computeWeekFlow>
    rowHrefs: ReturnType<typeof flowRowHrefs>
    agents: ReturnType<typeof agentRowsOf>
    strip: ReturnType<typeof weekStripOf>
  }
  try {
    const now = new Date()
    const loaded = await loadWeekFlowInputs({ includeSample, now })
    if (loaded.sourceErrors.length > 0) {
      throw new Error(`운영 상황판의 재료를 읽지 못했어요: ${loaded.sourceErrors.join(', ')}`)
    }
    const input = { bundles: loaded.bundles, starts: loaded.starts, now, includeSample }
    const rows = computeWeekFlow(input)
    view = {
      now,
      cards: computeMyTurn(input),
      rows,
      rowHrefs: flowRowHrefs({ bundles: loaded.bundles, includeSample }),
      agents: agentRowsOf({ thisWeek: rows[0], now }),
      strip: weekStripOf(now),
    }
  } catch (error) {
    console.error('[admin/home] 운영 상황판 구역 오류:', error)
    return <OpsSectionNotice icon="week" title={SECTION_NOTICE_TITLES.board} />
  }
  return (
    <div className="space-y-8">
      <OpsMyTurn cards={view.cards} now={view.now} includeSample={includeSample} />
      <OpsWeekFlowMap rows={view.rows} rowHrefs={view.rowHrefs} includeSample={includeSample} />
      <OpsAgentRows agents={view.agents} strip={view.strip} />
    </div>
  )
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

// ── 서비스 점검 ───────────────────────────────────────────────────────────────────

/** 진행 중인 이용 정지 건수(`lifted_at IS NULL`). 옛 섀도우밴(`user_shadow_bans`)은 읽지 않는다(티켓 20261017_1426). */
async function readSuspensions(): Promise<DashboardSignalMetric> {
  try {
    const supabase = createServiceClient()
    const { count, error } = await supabase
      .from('user_suspensions')
      .select('id', { count: 'exact', head: true })
      .is('lifted_at', null)
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
    const [{ thisWeek, lastWeek }, suspensions, blockedPoi, missionGaps] = await Promise.all([
      kpi,
      readSuspensions(),
      readBlockedPoi(now),
      readMissionGaps(now),
    ])
    if (suspensions.error !== null && blockedPoi.error !== null && missionGaps.result === null) {
      throw new Error(`서비스 점검의 재료를 모두 읽지 못했어요: ${suspensions.error}`)
    }
    props = {
      stravaSyncFailures: {
        value: thisWeek.metrics?.stravaSyncFailures.value ?? null,
        previousValue: lastWeek.metrics?.stravaSyncFailures.value ?? null,
        error: thisWeek.error,
      },
      suspensions,
      blockedPoi,
      missionGaps,
    }
  } catch (error) {
    console.error('[admin/home] 서비스 점검 구역 오류:', error)
    return <OpsSectionNotice icon="service" title={SECTION_NOTICE_TITLES.service} />
  }
  return <ServiceCheckRow {...props} />
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
