/**
 * 트렌드 출처 저장소 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4). 서버에서만 쓴다.
 *
 * - `listTrendSources`: 행을 `no` 순으로 읽고 `lastReadAt`을 계산해 붙인다. 칸을 따로 두지 않고, 최근 60일 묶음의
 *   `trends[].source_ids`에 그 출처 번호(`no`)가 든 묶음 중 가장 늦은 `received_at`을 쓴다(시험 묶음 `is_sample` 제외).
 * - `createTrendSource`·`updateTrendSource`: 이름 중복(`23505`)은 `duplicate`, 없는 행은 `not_found`로 돌려준다(던지지 않는다).
 *   종류가 직접 올린 자료가 아닌 출처의 위치를 비우려는 수정은 `location_required`다(패치에는 종류가 없어 여기서 확인한다).
 * - 읽기·쓰기 실패는 호출부가 500으로 바꾸도록 던진다. 돌려주는 값에 `created_by`는 없다.
 * - 삭제는 없다. 묶음의 `source_ids`가 번호로 남아 있어서 끄기(`enabled=false`)로 대신한다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { OpsTrendSourceKind } from '@/lib/admin/opsTrends/constants'
import type { TrendSourceCreateInput, TrendSourcePatchInput } from '@/lib/admin/opsTrends/sources'

type ServiceClient = ReturnType<typeof createServiceClient>

const UNIQUE_VIOLATION = '23505'
const SOURCE_COLUMNS = 'id, no, name, kind, location, enabled, created_at'
/** 「마지막으로 읽은 시각」을 찾는 묶음 범위(일). */
const LAST_READ_WINDOW_DAYS = 60
const LAST_READ_BUNDLE_LIMIT = 500

interface SourceRow {
  id: string
  no: number
  name: string
  kind: string
  location: string
  enabled: boolean
  created_at: string
}

export interface TrendSource {
  id: string
  no: number
  name: string
  kind: OpsTrendSourceKind
  location: string
  enabled: boolean
  createdAt: string
}

export interface TrendSourceWithLastRead extends TrendSource {
  /** 이 출처를 인용한 가장 늦은 묶음의 받은 시각. 인용한 묶음이 없으면 null. */
  lastReadAt: string | null
}

export type TrendSourceWriteResult =
  | { ok: true; source: TrendSource }
  | { ok: false; code: 'duplicate' | 'not_found' | 'location_required' }

function toSource(row: SourceRow): TrendSource {
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    kind: row.kind as OpsTrendSourceKind,
    location: row.location,
    enabled: row.enabled,
    createdAt: row.created_at,
  }
}

/** 묶음들의 `trends[].source_ids`를 훑어 출처 번호별로 가장 늦은 받은 시각을 모은다. */
function collectLastReadByNo(bundles: Array<{ received_at: string; trends: unknown }>): Map<string, string> {
  const latest = new Map<string, string>()
  for (const bundle of bundles) {
    if (!Array.isArray(bundle.trends)) continue
    const receivedMs = Date.parse(bundle.received_at)
    if (Number.isNaN(receivedMs)) continue
    for (const trend of bundle.trends as unknown[]) {
      const ids = (trend as { source_ids?: unknown } | null)?.source_ids
      if (!Array.isArray(ids)) continue
      for (const id of ids) {
        if (typeof id !== 'string' && typeof id !== 'number') continue
        const key = String(id).trim()
        const current = latest.get(key)
        if (current === undefined || receivedMs > Date.parse(current)) latest.set(key, bundle.received_at)
      }
    }
  }
  return latest
}

export async function listTrendSources(
  service: ServiceClient,
  options: { includeDisabled: boolean; withLastReadAt?: boolean }
): Promise<TrendSourceWithLastRead[]> {
  let query = service.from('ops_trend_sources').select(SOURCE_COLUMNS)
  if (!options.includeDisabled) query = query.eq('enabled', true)
  const { data, error } = await query.order('no', { ascending: true })
  if (error) throw new Error(`트렌드 출처 조회 실패: ${error.message}`)
  const rows = (data ?? []) as SourceRow[]

  let latest = new Map<string, string>()
  if (options.withLastReadAt !== false && rows.length > 0) {
    const since = new Date(Date.now() - LAST_READ_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: bundles, error: bundleError } = await service
      .from('ops_bundles')
      .select('received_at, trends')
      .eq('is_sample', false)
      .gte('received_at', since)
      .not('trends', 'is', null)
      .order('received_at', { ascending: false })
      .limit(LAST_READ_BUNDLE_LIMIT)
    if (bundleError) throw new Error(`트렌드 출처의 마지막 읽은 시각 조회 실패: ${bundleError.message}`)
    latest = collectLastReadByNo((bundles ?? []) as Array<{ received_at: string; trends: unknown }>)
  }

  return rows.map((row) => ({ ...toSource(row), lastReadAt: latest.get(String(row.no)) ?? null }))
}

export async function createTrendSource(
  service: ServiceClient,
  input: TrendSourceCreateInput,
  adminId: string
): Promise<TrendSourceWriteResult> {
  const { data, error } = await service
    .from('ops_trend_sources')
    .insert({ name: input.name, kind: input.kind, location: input.location, created_by: adminId })
    .select(SOURCE_COLUMNS)
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, code: 'duplicate' }
    throw new Error(`트렌드 출처 등록 실패: ${error.message}`)
  }
  return { ok: true, source: toSource(data as SourceRow) }
}

export async function updateTrendSource(
  service: ServiceClient,
  id: string,
  patch: TrendSourcePatchInput
): Promise<TrendSourceWriteResult> {
  // 위치를 비우는 수정만 현재 종류를 확인해야 한다(직접 올린 자료가 아니면 위치가 있어야 한다).
  if (patch.location === '') {
    const { data: current, error: readError } = await service
      .from('ops_trend_sources')
      .select('kind')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw new Error(`트렌드 출처 조회 실패: ${readError.message}`)
    if (!current) return { ok: false, code: 'not_found' }
    if ((current as { kind: string }).kind !== 'manual_upload') return { ok: false, code: 'location_required' }
  }

  const { data, error } = await service
    .from('ops_trend_sources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SOURCE_COLUMNS)
    .maybeSingle()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, code: 'duplicate' }
    throw new Error(`트렌드 출처 수정 실패: ${error.message}`)
  }
  if (!data) return { ok: false, code: 'not_found' }
  return { ok: true, source: toSource(data as SourceRow) }
}
