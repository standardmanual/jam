/**
 * 어드민 일괄 처리 서버 틀(티켓 20260924_0941, 상위 티켓 §2) — 모든 `POST
 * /api/admin/<메뉴>/bulk` 라우트가 공유하는 인증·파싱·200건 청크 갱신/삭제·표준 응답을
 * 한 곳에 모은다. 순수 판정(`parseBulkBody`·`confirmPhraseFor` 등)은 `./shared.ts`가 갖고,
 * 이 파일은 실제 DB 왕복과 `getAdminUser()` 세션 확인처럼 서버에서만 도는 부분만 담는다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '../auth'
import {
  parseBulkBody,
  type BulkResult,
  type BulkSkip,
  type ParseBulkBodyConfig,
  type ParsedBulkBody,
} from './shared'

export interface BulkAdmin {
  id: string
  email: string
}

export interface BulkRequestContext {
  admin: BulkAdmin
  body: ParsedBulkBody
}

export type ReadBulkRequestResult =
  | { ok: true; context: BulkRequestContext }
  | { ok: false; response: NextResponse }

/**
 * `POST /api/admin/<메뉴>/bulk` 공통 진입부: `getAdminUser()`로 어드민 확인(아니면 403) →
 * JSON 파싱 → `parseBulkBody`로 형식 검사. 실행 어드민 정보를 함께 돌려준다 — 감사 로그
 * (`bulkJson`)와 후속 티켓의 "본인 계정 제외"가 이 값을 쓴다.
 */
export async function readBulkRequest(
  req: Request,
  config: ParseBulkBodyConfig
): Promise<ReadBulkRequestResult> {
  const admin = await getAdminUser()
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 }) }
  }

  const json = await req.json().catch(() => null)
  const parsed = parseBulkBody(json, config)
  if (!parsed.ok) {
    return { ok: false, response: NextResponse.json({ error: parsed.error }, { status: 400 }) }
  }

  return { ok: true, context: { admin, body: parsed.body } }
}

// ─────────────────────────────────────────────────────────────────────────────
// 200건 청크 갱신/삭제 — Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스.
// 테이블마다 다른 컬럼을 다루는 범용 틀이라 생성 타입(Database)의 특정 테이블에 묶지 않는다
// (호출부에서 `createServiceClient()`를 `as unknown as BulkServiceClient`로 좁혀 쓴다 —
// `poi/[id]/route.ts`의 `PoiUpdateWithReviewColumn` 캐스팅과 동일한 관례).
// ─────────────────────────────────────────────────────────────────────────────

interface BulkQueryResult {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}

export interface BulkTableClient {
  update(patch: Record<string, unknown>): {
    in(column: string, values: string[]): { select(columns: string): PromiseLike<BulkQueryResult> }
    eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
  }
  select(columns: string): {
    in(column: string, values: string[]): PromiseLike<BulkQueryResult>
  }
  delete(): {
    in(column: string, values: string[]): { select(columns: string): PromiseLike<BulkQueryResult> }
    eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
  }
}

export interface BulkServiceClient {
  from(table: string): BulkTableClient
}

const UPDATE_CHUNK_SIZE = 200

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const UPDATE_ERROR_MESSAGE = '변경 내용을 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const READ_ERROR_MESSAGE = '현재 값을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const PARTIAL_ERROR_MESSAGE =
  '일부만 반영됐습니다. 되돌리는 중에도 오류가 났어요. 서버에서 저장 중 오류가 났어요. 반영된 항목을 확인한 뒤 다시 시도해 주세요.'
const DELETE_CHUNK_SIZE = 200

export interface UpdateAllOrNothingResult {
  ok: boolean
  /** 최종적으로 patch가 반영된 채 남은 id — 성공하면 전체, 롤백 실패로 일부만 남았으면 그 일부 */
  updatedIds: string[]
  /** 롤백까지 실패해 일부 묶음만 반영된 채 남았는지 — true면 "일부만 반영"으로 보고해야 한다 */
  partiallyApplied: boolean
  error: string | null
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function omitId(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row }
  delete rest.id
  return rest
}

async function rollback(
  client: BulkServiceClient,
  table: string,
  ids: string[],
  savedById: Map<string, Record<string, unknown>>
): Promise<string | null> {
  const errors: string[] = []
  for (const id of ids) {
    const saved = savedById.get(id)
    if (!saved) continue
    const { error } = await client.from(table).update(omitId(saved)).eq('id', id)
    if (error) errors.push(`${id}: ${error.message}`)
  }
  if (errors.length > 0) console.error(`[bulk ${table} 되돌리기 오류]`, errors.join(' / '))
  return errors.length > 0 ? errors.join(' / ') : null
}

/**
 * 모두 반영되거나 모두 취소되는 일괄 갱신(상위 티켓 §2).
 *
 * - 200건 이하: `.update(patch).in('id', ids)` 한 문장.
 * - 200건 초과: 바꾸기 전 값을 먼저 저장 → 200건씩 반영 → 한 묶음이 실패하면 그 시점까지
 *   반영한 묶음을 저장해 둔 값으로 되돌리고, 아직 시도하지 않은 나머지 묶음은 실행하지
 *   않는다. 되돌리기까지 실패하면 `partiallyApplied: true`로 "일부만 반영"을 알린다.
 */
export async function updateByIdsAllOrNothing(
  client: BulkServiceClient,
  table: string,
  ids: string[],
  patch: Record<string, unknown>
): Promise<UpdateAllOrNothingResult> {
  if (ids.length === 0) return { ok: true, updatedIds: [], partiallyApplied: false, error: null }

  if (ids.length <= UPDATE_CHUNK_SIZE) {
    const { data, error } = await client.from(table).update(patch).in('id', ids).select('id')
    if (error) {
      console.error(`[bulk ${table} 갱신 오류]`, error.message)
      return { ok: false, updatedIds: [], partiallyApplied: false, error: UPDATE_ERROR_MESSAGE }
    }
    return {
      ok: true,
      updatedIds: (data ?? []).map((row) => row.id as string),
      partiallyApplied: false,
      error: null,
    }
  }

  const patchColumns = Object.keys(patch)
  const { data: beforeRows, error: readError } = await client
    .from(table)
    .select(['id', ...patchColumns].join(', '))
    .in('id', ids)
  if (readError) {
    console.error(`[bulk ${table} 기존 값 조회 오류]`, readError.message)
    return { ok: false, updatedIds: [], partiallyApplied: false, error: READ_ERROR_MESSAGE }
  }

  const savedById = new Map<string, Record<string, unknown>>()
  for (const row of beforeRows ?? []) savedById.set(row.id as string, row)

  const chunks = chunk(ids, UPDATE_CHUNK_SIZE)
  const appliedChunks: string[][] = []

  for (const idsChunk of chunks) {
    const { error } = await client.from(table).update(patch).in('id', idsChunk).select('id')
    if (!error) {
      appliedChunks.push(idsChunk)
      continue
    }

    console.error(`[bulk ${table} 묶음 갱신 오류]`, error.message)
    const appliedIds = appliedChunks.flat()
    if (appliedIds.length === 0) {
      return { ok: false, updatedIds: [], partiallyApplied: false, error: UPDATE_ERROR_MESSAGE }
    }

    const rollbackError = await rollback(client, table, appliedIds, savedById)
    if (rollbackError) {
      return {
        ok: false,
        updatedIds: appliedIds,
        partiallyApplied: true,
        error: PARTIAL_ERROR_MESSAGE,
      }
    }
    return { ok: false, updatedIds: [], partiallyApplied: false, error: UPDATE_ERROR_MESSAGE }
  }

  return { ok: true, updatedIds: ids, partiallyApplied: false, error: null }
}

/**
 * 200건씩 삭제한다. 한 묶음이 참조 보호(FK 위반) 등으로 실패하면 그 묶음만 한 건씩 다시
 * 시도해 어느 id가 문제인지 가려내고, 실패한 id는 건너뜀으로 보고한다.
 */
export async function deleteByIds(
  client: BulkServiceClient,
  table: string,
  ids: string[],
  reasonFor?: (id: string, message: string) => string
): Promise<BulkResult> {
  const processed: string[] = []
  const skipped: BulkSkip[] = []

  for (const idsChunk of chunk(ids, DELETE_CHUNK_SIZE)) {
    const { data, error } = await client.from(table).delete().in('id', idsChunk).select('id')
    if (!error) {
      processed.push(...(data ?? []).map((row) => row.id as string))
      continue
    }

    for (const id of idsChunk) {
      const { error: singleError } = await client.from(table).delete().eq('id', id)
      if (singleError) {
        skipped.push({ id, reason: reasonFor ? reasonFor(id, singleError.message) : singleError.message })
      } else {
        processed.push(id)
      }
    }
  }

  return { processed, skipped }
}

/** 표준 응답 + 감사 기록(실행 어드민·동작·처리/건너뜀 수를 `console.info` 한 줄로 남긴다) */
export function bulkJson<T extends BulkResult & { dryRun?: boolean }>(
  result: T,
  context: { admin: BulkAdmin; action: string }
): NextResponse {
  const { admin, action } = context
  console.info(
    `[admin bulk] admin=${admin.email} action=${action}${result.dryRun ? ' dryRun=true' : ''} processed=${result.processed.length} skipped=${result.skipped.length}`
  )
  return NextResponse.json(result)
}
