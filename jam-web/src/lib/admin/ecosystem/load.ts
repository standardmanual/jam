/**
 * 생태계 상황판의 읽기 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * 마디 10개의 지표를 읽고 계산한다. 저장하지 않고, 서비스 클라이언트를 인자로 받는다(테스트는 가짜를 넘긴다).
 * 밸런스 마디(캡슐·아이템 배지·인벤토리·컬렉션)와 목표 대비 행은 `loadBalanceDashboard`를 그대로 불러 재사용한다.
 *
 * ## 이 회차의 새 읽기
 *
 * | 표 | 범위 | 쓰는 마디 |
 * |---|---|---|
 * | `users` | 어드민이 아닌 유저의 `id`, `is_admin` | 활동 동기화, 유저 드랍, 픽업 |
 * | `strava_activities` | `created_at`이 기간 시작 이후 | 활동 동기화 |
 * | `strava_sync_failures` | `occurred_at`이 기간 시작 이후 | 활동 동기화(보조) |
 * | `jam_transactions` | `created_at`이 기간 시작 이후 | 잼 |
 * | `poi_drops` | `dropped_at` 또는 `picked_up_at`이 기간 시작 이후 | 시스템 드랍, 유저 드랍, 픽업 |
 * | `poi` | 개수만(`count: 'exact', head: true`) | 지점 |
 *
 * 기간은 `gte` 한쪽 경계 한 번에 읽는다(추정: 유저 수백 명까지 충분하다. 위로 가면 읽기 전용 함수로 바꾸는 후속이다).
 * 읽기 하나가 실패해도 그 읽기를 쓰는 마디만 `error`로 두고 나머지는 계산한다(`balanceDashboard/load.ts`의 `settle` 방식).
 * 원인은 서버 로그에만 남기고 마디에는 고정 문장을 쓴다. 던지지 않고, 마디 10개를 항상 돌려준다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { loadBalanceDashboard } from '@/lib/admin/balanceDashboard/load'
import { METRIC_SPECS, partSpec } from '@/lib/admin/balanceDashboard/targets'
import type { BalanceDashboardData, BalanceMetricKey, MetricPartSpec, MetricPart } from '@/lib/admin/balanceDashboard/types'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import {
  countDrops,
  countedUserIdsOf,
  countPickups,
  countSyncedActivities,
  countSyncFailures,
  rollingWindow,
  sumJam,
  type ActivityRow,
  type CountedUserRow,
  type DropRow,
  type JamRow,
  type SyncFailureRow,
} from './fieldMetrics'
import { BALANCE_NODE_METRICS, ECOSYSTEM_NODES, FIELD_WINDOW_DAYS, NODE_PERIOD_TEXT } from './nodes'
import { goalRowsOf } from './policyLinks'
import { attentionCount, errorCount, pickHeadlinePart, statusOfPart, worstStatus } from './status'
import type {
  EcosystemNodeId,
  EcosystemSnapshot,
  NodeHeadline,
  NodeIndicator,
  NodeStatus,
  NodeSubValue,
} from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

export const ECOSYSTEM_LOAD_FAILED_MESSAGE = '지표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

const USER_COLUMNS = 'id, is_admin'
const ACTIVITY_COLUMNS = 'user_id, created_at, processed_via'
const FAILURE_COLUMNS = 'occurred_at, failure_type'
const JAM_COLUMNS = 'amount, admin_user_id, created_at'
const DROP_COLUMNS = 'source, dropper_user_id, picked_up_by, dropped_at, picked_up_at'

type Settled<T> = { ok: true; value: T } | { ok: false }

/** 읽기 하나가 던져도 다른 읽기가 이어지게 한다. 원인은 서버 로그에만 남긴다 */
async function settle<T>(task: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await task() }
  } catch (error) {
    console.error('[ecosystem] 읽기 실패', error)
    return { ok: false }
  }
}

/** `count: 'exact', head: true` 읽기 결과에서 개수를 꺼낸다. 오류가 있으면 던진다 */
function countOf(result: { count: number | null; error: { message: string } | null }, label: string): number {
  if (result.error) throw new Error(`[ecosystem] ${label} 개수 조회 실패: ${result.error.message}`)
  return result.count ?? 0
}

function readUsers(supabase: ServiceClient): Promise<CountedUserRow[]> {
  return fetchAllRows<CountedUserRow>('ecosystem:users', 'id', () =>
    supabase.from('users').select(USER_COLUMNS).eq('is_admin', false)
  )
}

function readActivities(supabase: ServiceClient, sinceIso: string): Promise<ActivityRow[]> {
  return fetchAllRows<ActivityRow>('ecosystem:strava-activities', 'id', () =>
    supabase.from('strava_activities').select(ACTIVITY_COLUMNS).gte('created_at', sinceIso)
  )
}

function readSyncFailures(supabase: ServiceClient, sinceIso: string): Promise<SyncFailureRow[]> {
  return fetchAllRows<SyncFailureRow>('ecosystem:sync-failures', 'id', () =>
    supabase.from('strava_sync_failures').select(FAILURE_COLUMNS).gte('occurred_at', sinceIso)
  )
}

function readJam(supabase: ServiceClient, sinceIso: string): Promise<JamRow[]> {
  return fetchAllRows<JamRow>('ecosystem:jam-transactions', 'id', () =>
    supabase.from('jam_transactions').select(JAM_COLUMNS).gte('created_at', sinceIso)
  )
}

function readDrops(supabase: ServiceClient, sinceIso: string): Promise<DropRow[]> {
  return fetchAllRows<DropRow>('ecosystem:poi-drops', 'id', () =>
    supabase.from('poi_drops').select(DROP_COLUMNS).or(`dropped_at.gte.${sinceIso},picked_up_at.gte.${sinceIso}`)
  )
}

async function readPoints(supabase: ServiceClient): Promise<{ active: number; linked: number }> {
  const [active, linked] = await Promise.all([
    supabase.from('poi').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('pending_review', false),
    supabase
      .from('poi')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('pending_review', false)
      .not('linked_badge_id', 'is', null),
  ])
  return { active: countOf(active, 'poi'), linked: countOf(linked, 'poi 연결 배지') }
}

interface NodeBase {
  id: EcosystemNodeId
  label: string
  loop: NodeIndicator['loop']
  periodText: string
  policyIds: readonly string[]
}

function errorNode(base: NodeBase, label: string, unit: NodeHeadline['unit']): NodeIndicator {
  return {
    ...base,
    statusKind: 'error',
    headline: { label, value: null, unit },
    message: ECOSYSTEM_LOAD_FAILED_MESSAGE,
  }
}

/** 목표가 없는 필드 마디: 읽었으면 값만 보인다(`no_target`) */
function valueNode(
  base: NodeBase,
  headline: NodeHeadline,
  sub?: NodeSubValue
): NodeIndicator {
  return { ...base, statusKind: 'no_target', headline, ...(sub ? { sub } : {}) }
}

interface BalancePartItem {
  key: BalanceMetricKey
  spec: MetricPartSpec
  part: MetricPart
}

/** 밸런스 지표를 대표 지표로 쓰는 마디. 가장 상태가 나쁜 칸이 대표다 */
function balanceNode(base: NodeBase, keys: readonly BalanceMetricKey[], balance: BalanceDashboardData): NodeIndicator {
  const statuses: NodeStatus[] = []
  const items: { item: BalancePartItem; status: NodeStatus }[] = []
  for (const key of keys) {
    const result = balance.metrics.find((metric) => metric.key === key)
    if (result === undefined || result.status === 'error') {
      statuses.push('error')
      continue
    }
    for (const part of result.parts) {
      const spec = partSpec(key, part.id)
      const status = statusOfPart(part, spec)
      statuses.push(status)
      items.push({ item: { key, spec, part }, status })
    }
  }
  const statusKind = worstStatus(statuses)
  const picked = pickHeadlinePart(items)
  const fallbackLabel = METRIC_SPECS[keys[0]].title
  if (picked === null) {
    return { ...base, statusKind: 'error', headline: { label: fallbackLabel, value: null, unit: 'ratio' }, message: ECOSYSTEM_LOAD_FAILED_MESSAGE }
  }
  const { key, spec, part } = picked.item
  const measurement = part.measurement
  const ready = measurement.status === 'ready'
  return {
    ...base,
    statusKind,
    headline: { label: `${METRIC_SPECS[key].title} (${spec.label})`, value: ready ? measurement.value : null, unit: spec.unit },
    ...(ready ? { sample: { value: measurement.sample, unit: measurement.sampleUnit } } : {}),
    ...(statuses.includes('error') ? { message: ECOSYSTEM_LOAD_FAILED_MESSAGE } : {}),
  }
}

/**
 * 마디 10개와 목표 대비 행을 읽고 계산한다. `now`는 모든 기간의 기준 시각이다(읽기 범위와 계산이 어긋나지 않게 같은 값을 쓴다).
 * 던지지 않는다. 읽지 못한 마디는 `statusKind: 'error'`로 돌려준다. `policies`는 시험에서 바꿔 넣는다
 */
export async function loadEcosystemSnapshot(
  supabase: ServiceClient,
  now: Date,
  policies: readonly PolicyItem[] = POLICIES_DATA
): Promise<EcosystemSnapshot> {
  const window = rollingWindow(now, FIELD_WINDOW_DAYS)
  const sinceIso = new Date(window.start).toISOString()

  const [balanceRead, users, activities, failures, jam, drops, points] = await Promise.all([
    settle(() => loadBalanceDashboard(supabase, now)),
    settle(() => readUsers(supabase)),
    settle(() => readActivities(supabase, sinceIso)),
    settle(() => readSyncFailures(supabase, sinceIso)),
    settle(() => readJam(supabase, sinceIso)),
    settle(() => readDrops(supabase, sinceIso)),
    settle(() => readPoints(supabase)),
  ])

  // 밸런스 읽기 전체가 던지면(이 함수는 던지지 않게 만들어져 있어 방어일 뿐이다) 모든 밸런스 마디를 읽지 못함으로 둔다
  const balance: BalanceDashboardData = balanceRead.ok
    ? balanceRead.value
    : { generatedAt: now.toISOString(), metrics: [] }
  const counted = users.ok ? countedUserIdsOf(users.value) : null

  const nodes: NodeIndicator[] = ECOSYSTEM_NODES.map((def) => {
    const base: NodeBase = {
      id: def.id,
      label: def.label,
      loop: def.loop,
      periodText: NODE_PERIOD_TEXT[def.id],
      policyIds: policies.filter((policy) => policy.nodes?.includes(def.id) === true).map((policy) => policy.id),
    }
    const balanceKeys = BALANCE_NODE_METRICS[def.id]
    if (balanceKeys !== undefined) return balanceNode(base, balanceKeys, balance)

    switch (def.id) {
      case 'sync':
        if (!counted || !activities.ok || !failures.ok) return errorNode(base, '동기화된 활동 건수', 'count')
        return valueNode(
          base,
          { label: '동기화된 활동 건수', value: countSyncedActivities(activities.value, counted, window), unit: 'count' },
          { label: '동기화 실패 건수', value: countSyncFailures(failures.value, window), unit: 'count' }
        )
      case 'jam': {
        if (!jam.ok) return errorNode(base, '지급된 잼 합계', 'jam')
        const sums = sumJam(jam.value, window)
        return valueNode(
          base,
          { label: '지급된 잼 합계', value: sums.granted, unit: 'jam' },
          { label: '쓴 잼 합계', value: sums.spent, unit: 'jam' }
        )
      }
      case 'system_drop':
        // 시스템 드랍은 놓은 유저가 없어 유저 표를 읽지 못해도 계산된다
        if (!drops.ok) return errorNode(base, '놓인 시스템 드랍 건수', 'count')
        return valueNode(base, {
          label: '놓인 시스템 드랍 건수',
          value: countDrops(drops.value, 'system', window, counted ?? new Set<string>()),
          unit: 'count',
        })
      case 'user_drop':
        if (!drops.ok || !counted) return errorNode(base, '놓인 유저 드랍 건수', 'count')
        return valueNode(base, {
          label: '놓인 유저 드랍 건수',
          value: countDrops(drops.value, 'user', window, counted),
          unit: 'count',
        })
      case 'checkin_point':
        if (!points.ok) return errorNode(base, '켜진 지점 수', 'count')
        return valueNode(
          base,
          { label: '켜진 지점 수', value: points.value.active, unit: 'count' },
          { label: '배지가 연결된 지점 수', value: points.value.linked, unit: 'count' }
        )
      case 'pickup':
        if (!drops.ok || !counted) return errorNode(base, '주워 간 드랍 건수', 'count')
        return valueNode(base, {
          label: '주워 간 드랍 건수',
          value: countPickups(drops.value, window, counted),
          unit: 'count',
        })
      default:
        // 밸런스 마디는 위에서 처리했고 나머지 키는 위 case가 모두 덮는다
        return errorNode(base, def.label, 'count')
    }
  })

  const goalRows = goalRowsOf(balance, policies)
  const fieldNodes = nodes.filter((node) => BALANCE_NODE_METRICS[node.id] === undefined)

  return {
    generatedAt: now.toISOString(),
    nodes,
    goalRows,
    attentionCount: attentionCount(goalRows.map((row) => row.status)),
    errorCount: errorCount([...goalRows.map((row) => row.status), ...fieldNodes.map((node) => node.statusKind)]),
  }
}
