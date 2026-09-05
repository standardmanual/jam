/**
 * 확장 필드 백필 — 대상 유저 현황과 종목별 커버리지 집계 (티켓 20260905_1242)
 *
 * ## 왜 «집계»가 이 작업의 목적인가
 * 백필 자체는 `backfill.ts`가 이미 한다. 이 모듈이 하는 일은 **그 결과를 눈으로 확인할 수 있게
 * 세는 것**이다. 티켓 `20260905_0039`가 유저를 전원 삭제하면 지금의 실데이터는 사라지고,
 * 임계값 설계(`20260905_0035`)가 기댈 실측 근거는 **백필 직후 한 번의 측정**뿐이다.
 *
 * 특히 `avgCadence`는 러닝에서 원값이 **90대(한쪽 발 기준)** 인지 **180대(spm)** 인지가
 * 갈린다. 컨텐츠에 이미 「180 황금 케이던스」 계열이 있어, 여기서 잘못 읽으면 영원히 발급되지
 * 않는 배지가 만들어진다. 그래서 중앙값만이 아니라 최소·최대까지 함께 노출한다.
 *
 * ## 이 모듈이 하지 않는 것
 * 읽기 전용이다. 배지·드랍·미션·소식 엔진을 import하지 않고, 어떤 테이블에도 쓰지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { EXTENDED_ACTIVITY_FIELD_KEYS } from '@/types/strava'

/** 한 번에 읽어올 활동 행 페이지 크기 (PostgREST 기본 상한 회피) */
const DB_PAGE_SIZE = 1_000

/**
 * 집계를 위해 읽어들일 활동 행 상한. 실측 2026-09-05 기준 873행이라 한참 여유가 있다.
 * 상한에 걸리면 `truncated`로 알린다 — 조용히 잘린 숫자를 근거로 임계값을 정하면 안 된다.
 */
const MAX_ROWS = 20_000

/** 종목 미분류(`jam_activity_type`이 NULL) 행을 묶는 라벨 */
export const UNCLASSIFIED_SPORT = '미분류'

/** 집계에 필요한 최소 컬럼만 담은 활동 행 */
export interface ActivityStatRow {
  user_id: string
  jam_activity_type: string | null
  normalized: unknown
}

export interface SportCoverage {
  /** `jam_activity_type` 값. NULL은 `UNCLASSIFIED_SPORT`로 묶는다 */
  sport: string
  activityCount: number
  /** 확장 9필드 중 **하나라도** 들어 있는 행 수 = 백필이 닿은 행 수 */
  extendedCount: number
  avgHeartrateBpmCount: number
  avgWattsCount: number
  avgCadenceCount: number
  /** `deviceWatts === true`인 행 수 — 파워가 추정이 아니라 실측인 활동 */
  deviceWattsTrueCount: number
  avgCadenceMedian: number | null
  avgCadenceMin: number | null
  avgCadenceMax: number | null
}

export interface BackfillTargetUser {
  userId: string
  email: string | null
  username: string | null
  /** `strava_activities`에 저장된 활동 수 */
  activityCount: number
  /** 그중 확장 필드가 하나라도 있는 행 수 */
  extendedCount: number
  /** `normalized.extendedBackfilledAt`의 최댓값 (ISO). 백필한 적이 없으면 null */
  lastBackfilledAt: string | null
}

export interface BackfillOverview {
  users: BackfillTargetUser[]
  coverage: SportCoverage[]
  totals: { activityCount: number; extendedCount: number }
  /** 활동 행이 `MAX_ROWS`를 넘어 일부만 세었는지 */
  truncated: boolean
  /** 집계 시각 (ISO) */
  measuredAt: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 정렬된 숫자 배열의 중앙값. 짝수 개면 가운데 둘의 평균(소수점 1자리) */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(raw * 10) / 10
}

/** 확장 9필드 중 하나라도 들어 있으면 «백필이 닿은 행»으로 센다 */
export function hasAnyExtendedField(normalized: unknown): boolean {
  const record = asRecord(normalized)
  if (!record) return false
  return EXTENDED_ACTIVITY_FIELD_KEYS.some((key) => record[key] !== undefined)
}

/**
 * 종목별 커버리지·분포 집계. **순수 함수** — 테스트가 이 함수를 직접 본다.
 *
 * 종목 순서는 활동 수 내림차순이다. 러닝·자전거처럼 표본이 많은 종목이 위로 오게 해서
 * 임계값 판단에 쓸 줄을 먼저 보게 한다.
 */
export function summarizeCoverage(rows: ActivityStatRow[]): SportCoverage[] {
  const bySport = new Map<string, { coverage: SportCoverage; cadences: number[] }>()

  for (const row of rows) {
    const sport = row.jam_activity_type ?? UNCLASSIFIED_SPORT
    let entry = bySport.get(sport)
    if (!entry) {
      entry = {
        coverage: {
          sport,
          activityCount: 0,
          extendedCount: 0,
          avgHeartrateBpmCount: 0,
          avgWattsCount: 0,
          avgCadenceCount: 0,
          deviceWattsTrueCount: 0,
          avgCadenceMedian: null,
          avgCadenceMin: null,
          avgCadenceMax: null,
        },
        cadences: [],
      }
      bySport.set(sport, entry)
    }

    entry.coverage.activityCount++
    const normalized = asRecord(row.normalized)
    if (!normalized) continue
    if (hasAnyExtendedField(normalized)) entry.coverage.extendedCount++
    if (numberOrNull(normalized.avgHeartrateBpm) !== null) entry.coverage.avgHeartrateBpmCount++
    if (numberOrNull(normalized.avgWatts) !== null) entry.coverage.avgWattsCount++
    if (normalized.deviceWatts === true) entry.coverage.deviceWattsTrueCount++

    const cadence = numberOrNull(normalized.avgCadence)
    if (cadence !== null) {
      entry.coverage.avgCadenceCount++
      entry.cadences.push(cadence)
    }
  }

  return [...bySport.values()]
    .map(({ coverage, cadences }) => ({
      ...coverage,
      avgCadenceMedian: median(cadences),
      avgCadenceMin: cadences.length > 0 ? Math.min(...cadences) : null,
      avgCadenceMax: cadences.length > 0 ? Math.max(...cadences) : null,
    }))
    .sort((a, b) => b.activityCount - a.activityCount || a.sport.localeCompare(b.sport))
}

/** 유저별 저장 활동 수 · 확장 필드 보유 수 · 마지막 백필 시각. **순수 함수** */
export function summarizeUsers(
  connections: { user_id: string }[],
  profiles: { id: string; email: string | null; username: string | null }[],
  rows: ActivityStatRow[]
): BackfillTargetUser[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const stats = new Map<string, { activityCount: number; extendedCount: number; lastBackfilledAt: string | null }>()

  for (const row of rows) {
    let stat = stats.get(row.user_id)
    if (!stat) {
      stat = { activityCount: 0, extendedCount: 0, lastBackfilledAt: null }
      stats.set(row.user_id, stat)
    }
    stat.activityCount++
    const normalized = asRecord(row.normalized)
    if (!normalized) continue
    if (hasAnyExtendedField(normalized)) stat.extendedCount++
    const markedAt = normalized.extendedBackfilledAt
    // ISO 문자열끼리는 사전순 비교가 곧 시간순 비교다 (백필이 남기는 값은 toISOString 고정)
    if (typeof markedAt === 'string' && (stat.lastBackfilledAt === null || markedAt > stat.lastBackfilledAt)) {
      stat.lastBackfilledAt = markedAt
    }
  }

  return connections
    .map((connection) => {
      const stat = stats.get(connection.user_id)
      const profile = profileById.get(connection.user_id)
      return {
        userId: connection.user_id,
        email: profile?.email ?? null,
        username: profile?.username ?? null,
        activityCount: stat?.activityCount ?? 0,
        extendedCount: stat?.extendedCount ?? 0,
        lastBackfilledAt: stat?.lastBackfilledAt ?? null,
      }
    })
    .sort((a, b) => b.activityCount - a.activityCount)
}

/** 집계에 필요한 활동 행을 페이지 단위로 모두 읽는다 (읽기 전용) */
async function fetchActivityStatRows(
  supabase: SupabaseClient
): Promise<{ rows: ActivityStatRow[]; truncated: boolean }> {
  const rows: ActivityStatRow[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('strava_activities')
      .select('user_id, jam_activity_type, normalized')
      .order('start_date', { ascending: true })
      .range(offset, offset + DB_PAGE_SIZE - 1)
    if (error) throw new Error(`strava_activities 집계 조회 실패: ${error.message}`)
    const page = (data ?? []) as ActivityStatRow[]
    rows.push(...page)
    if (page.length < DB_PAGE_SIZE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/**
 * 백필 어드민 화면이 쓰는 현황 한 벌 — 대상 유저 목록 + 종목별 커버리지.
 *
 * 화면 최초 렌더와 백필 실행 직후가 **같은 함수**를 쓴다. 두 숫자가 서로 다른 방식으로
 * 계산되면 「실행했는데 숫자가 안 맞는다」를 판단할 수 없기 때문이다.
 */
export async function loadBackfillOverview(supabase: SupabaseClient): Promise<BackfillOverview> {
  const { data: connectionData, error: connectionError } = await supabase
    .from('strava_connections')
    .select('user_id')
  if (connectionError) throw new Error(`strava_connections 조회 실패: ${connectionError.message}`)
  const connections = (connectionData ?? []) as { user_id: string }[]

  const userIds = connections.map((c) => c.user_id)
  const { data: profileData } = userIds.length
    ? await supabase.from('users').select('id, email, username').in('id', userIds)
    : { data: [] }
  const profiles = (profileData ?? []) as { id: string; email: string | null; username: string | null }[]

  const { rows, truncated } = await fetchActivityStatRows(supabase)

  const users = summarizeUsers(connections, profiles, rows)
  const coverage = summarizeCoverage(rows)

  return {
    users,
    coverage,
    totals: {
      activityCount: rows.length,
      extendedCount: coverage.reduce((sum, c) => sum + c.extendedCount, 0),
    },
    truncated,
    measuredAt: new Date().toISOString(),
  }
}
