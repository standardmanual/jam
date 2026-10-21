/**
 * 어뷰징 일괄 처리(해제·만료 연장)의 순수 판정(티켓 20260924_0952). 서버 라우트
 * (`api/admin/abusing/poi-blocks/bulk`)와 확인창 화면이 같은 계산을 쓰도록 여기 모은다.
 * `next/server`·인증을 가져오지 않아 클라이언트 컴포넌트도 안전하게 불러 쓸 수 있다.
 * 옛 섀도우밴(`user_shadow_bans`)의 해제·연장·등급 전환 판정은 티켓 20261021_1250(6-4 2회)에서 지웠다.
 */
import { chunkIds } from '@/lib/abusing/chunk-ids'
import type { BulkSkip } from './bulk/shared'

/** 만료 연장에서 고를 수 있는 일수 — 확인창 버튼과 서버 검증이 같은 목록을 쓴다 */
export const EXTEND_DAY_OPTIONS = [1, 3, 7, 30] as const
const EXTEND_MAX_DAYS = 365
const DAY_MS = 86_400_000

/** 요청 payload의 `days` — 1~365 정수만 받는다. 아니면 null */
export function parseExtendDays(payload: unknown): number | null {
  const days = (payload as { days?: unknown } | null | undefined)?.days
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > EXTEND_MAX_DAYS) return null
  return days
}

/** 연장한 뒤의 만료 시각 — 각 행의 기존 만료가 아니라 지금부터 N일 뒤로 통일한다 */
export function untilFromDays(days: number, now: Date): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

export interface PoiBlockBulkRow {
  id: string
  blocked_until: string
}

export const SKIP_ALREADY_RELEASED = '이미 해제됐어요'
export const SKIP_ALREADY_LONGER = '이미 더 오래 가요'
export const SKIP_CHANGED_MEANWHILE = '그 사이 상태가 바뀌어 연장하지 못했어요'

function missingSkips(ids: string[], present: Set<string>): BulkSkip[] {
  return ids.filter((id) => !present.has(id)).map((id) => ({ id, reason: SKIP_ALREADY_RELEASED }))
}

function isExpired(iso: string | null, now: Date): boolean {
  return iso !== null && new Date(iso).getTime() <= now.getTime()
}

export interface PoiBlockReleaseSummary {
  existingIds: string[]
  skipped: BulkSkip[]
  impact: { activeCount: number; expiredCount: number }
}

export function summarizePoiBlockRelease(ids: string[], rows: PoiBlockBulkRow[], now: Date): PoiBlockReleaseSummary {
  const expiredCount = rows.filter((r) => isExpired(r.blocked_until, now)).length
  return {
    existingIds: rows.map((r) => r.id),
    skipped: missingSkips(ids, new Set(rows.map((r) => r.id))),
    impact: { activeCount: rows.length - expiredCount, expiredCount },
  }
}

export interface ExtendSummary {
  /** 실제로 연장할 id — 서버가 `.lt(만료, until)` 조건으로 한 번 더 걸러 반영한다 */
  extendableIds: string[]
  skipped: BulkSkip[]
  impact: { reapplyCount: number; permanentCount: number }
}

export function summarizePoiBlockExtend(ids: string[], rows: PoiBlockBulkRow[], until: Date, now: Date): ExtendSummary {
  const extendableIds: string[] = []
  const skipped = missingSkips(ids, new Set(rows.map((r) => r.id)))
  let reapplyCount = 0
  for (const row of rows) {
    if (new Date(row.blocked_until).getTime() >= until.getTime()) {
      skipped.push({ id: row.id, reason: SKIP_ALREADY_LONGER })
    } else {
      extendableIds.push(row.id)
      if (isExpired(row.blocked_until, now)) reapplyCount += 1
    }
  }
  return { extendableIds, skipped, impact: { reapplyCount, permanentCount: 0 } }
}

/** 실행 결과에서 연장 후보였지만 반영되지 않은 id(그 사이 바뀜)를 건너뜀에 더한다 */
export function skipUnappliedExtensions(extendableIds: string[], updatedIds: string[]): BulkSkip[] {
  const updated = new Set(updatedIds)
  return extendableIds.filter((id) => !updated.has(id)).map((id) => ({ id, reason: SKIP_CHANGED_MEANWHILE }))
}

/** `select(columns).in('id', ids)`를 200건씩 읽는 최소 인터페이스 — 라우트가 서비스 클라이언트를 좁혀 넘긴다 */
export interface SanctionRowReader {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
    }
  }
}

export async function readSanctionRows<T>(
  reader: SanctionRowReader,
  table: 'poi_blocks',
  columns: string,
  ids: string[]
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (const idsChunk of chunkIds(ids)) {
    const { data, error } = await reader.from(table).select(columns).in('id', idsChunk)
    if (error) return { rows, error: error.message }
    rows.push(...((data ?? []) as T[]))
  }
  return { rows, error: null }
}
