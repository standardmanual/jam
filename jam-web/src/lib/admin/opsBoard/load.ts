/**
 * 운영 상황판의 서버 읽기 (티켓 20261026_2023 1회차) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * 주간 흐름·내 차례의 입력을 읽는다. **읽기만 한다(select).** 출처 하나가 실패해도 던지지 않고 실패한 출처 이름을
 * `sourceErrors`에 담아 돌려준다 — 호출부가 그 이름으로 안내 카드를 고른다. 실패한 출처의 자료는 빈 배열이다.
 *
 * - `bundles`: 최근 6주(이번 주 월요일 −35일 0시 KST부터) 안에 받은 묶음. 제출 원본(`raw`, 최대 1MB)은 읽지 않는다.
 * - `items`: 위 묶음의 항목. 묶음 읽기가 실패하면 읽지 않는다(출처 이름은 `bundles`만 담는다).
 * - `routine_starts`: 최근 6주분 루틴 시작 기록.
 *
 * ⚠️ PostgREST 기본 페이지 상한(1000행)은 에러 없이 목록을 자르므로 `range`로 끝까지 받는다(`query.ts`와 같은 방식).
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { logQueryError } from '@/lib/admin/queryError'
import { readOpsItemRationales, readOpsRoutineStages } from '@/lib/admin/opsInbox/query'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import type { BoardBundleInput, BoardItemInput, BoardRoutineStartInput } from '@/lib/admin/opsBoard/types'

const FETCH_PAGE_SIZE = 1000
const LOOKBACK_DAYS = 35
const ERROR_LABEL = 'ops-board'

/** 읽다 실패할 수 있는 출처 이름. */
export type BoardSourceName = 'bundles' | 'items' | 'routine_starts'

export interface WeekFlowInputs {
  bundles: BoardBundleInput[]
  starts: BoardRoutineStartInput[]
  /** 읽다 실패한 출처. 모두 읽었으면 빈 배열이다. */
  sourceErrors: BoardSourceName[]
}

export interface LoadWeekFlowParams {
  includeSample: boolean
  now: Date
}

type PageResult = { data: unknown[] | null; error: { message: string } | null }

/** 1000행씩 끝까지 읽는다. 오류가 나거나 던지면 null이다(로그만 남긴다). */
async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[] | null> {
  const rows: T[] = []
  try {
    for (let from = 0; ; from += FETCH_PAGE_SIZE) {
      const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1)
      if (error) {
        logQueryError(error, ERROR_LABEL)
        return null
      }
      const page = (data ?? []) as T[]
      rows.push(...page)
      if (page.length < FETCH_PAGE_SIZE) return rows
    }
  } catch (err) {
    console.error(`[admin/${ERROR_LABEL}] 조회 중 예외:`, err instanceof Error ? err.name : 'unknown')
    return null
  }
}

interface BundleRow {
  id: string
  week: string | null
  is_sample: boolean
  received_at: string
  title: string | null
  routine_run: Json | null
}

interface ItemRow {
  id: string
  bundle_id: string
  status: string
  kind: string | null
  original: Json
  edited: Json | null
}

interface StartRow {
  id: string
  run_key: string
  week: string | null
  author: string
  agents: Json
  started_at: string
  bundle_id: string | null
}

function agentNames(agents: Json): string[] {
  return Array.isArray(agents) ? agents.filter((name): name is string => typeof name === 'string') : []
}

/** 주간 흐름·내 차례의 입력을 읽는다. 던지지 않는다. */
export async function loadWeekFlowInputs(params: LoadWeekFlowParams): Promise<WeekFlowInputs> {
  const sourceErrors: BoardSourceName[] = []
  const cutoffDate = shiftDateStr(mondayOfWeek(todayKstDateString(params.now)), -LOOKBACK_DAYS)
  const cutoff = new Date(`${cutoffDate}T00:00:00+09:00`).toISOString()
  const supabase = createServiceClient()

  const bundleRows = await readAll<BundleRow>((from, to) => {
    const query = supabase
      .from('ops_bundles')
      .select('id, week, is_sample, received_at, title, routine_run')
      .gte('received_at', cutoff)
    return (params.includeSample ? query : query.eq('is_sample', false)).order('received_at', { ascending: false }).order('id').range(from, to)
  })
  if (bundleRows === null) sourceErrors.push('bundles')

  const itemsByBundle = new Map<string, BoardItemInput[]>()
  if (bundleRows !== null && bundleRows.length > 0) {
    const bundleIds = bundleRows.map((row) => row.id)
    const itemRows = await readAll<ItemRow>((from, to) =>
      supabase
        .from('ops_bundle_items')
        .select('id, bundle_id, status, kind, original, edited')
        .in('bundle_id', bundleIds)
        .order('id')
        .range(from, to)
    )
    if (itemRows === null) sourceErrors.push('items')
    for (const row of itemRows ?? []) {
      const item: BoardItemInput = {
        id: row.id,
        bundleId: row.bundle_id,
        status: row.status,
        kind: row.kind,
        // 수정본이 있으면 수정본에서 이유를 읽는다.
        rationales: readOpsItemRationales(row.edited ?? row.original),
      }
      itemsByBundle.set(row.bundle_id, [...(itemsByBundle.get(row.bundle_id) ?? []), item])
    }
  }

  const startRows = await readAll<StartRow>((from, to) =>
    supabase
      .from('ops_routine_starts')
      .select('id, run_key, week, author, agents, started_at, bundle_id')
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .order('id')
      .range(from, to)
  )
  if (startRows === null) sourceErrors.push('routine_starts')

  const bundles: BoardBundleInput[] = (bundleRows ?? []).map((row) => ({
    id: row.id,
    week: row.week,
    isSample: row.is_sample,
    receivedAt: row.received_at,
    title: row.title,
    stages: readOpsRoutineStages(row.routine_run),
    items: itemsByBundle.get(row.id) ?? [],
  }))
  const starts: BoardRoutineStartInput[] = (startRows ?? []).map((row) => ({
    id: row.id,
    runKey: row.run_key,
    week: row.week,
    author: row.author,
    agents: agentNames(row.agents),
    startedAt: row.started_at,
    bundleId: row.bundle_id,
  }))

  return { bundles, starts, sourceErrors }
}
