/**
 * 어뷰징 일괄 처리(해제·만료 연장)와 등급 전환의 순수 판정(티켓 20260924_0952). 서버 라우트
 * (`api/admin/abusing/{bans,poi-blocks}/bulk`)와 확인창 화면이 같은 계산을 쓰도록 여기 모은다.
 * `next/server`·인증을 가져오지 않아 클라이언트 컴포넌트도 안전하게 불러 쓸 수 있다.
 */
import type { AbusingPolicy } from '@/lib/abusing/policy'
import { BAN_RATE_KEY } from '@/lib/abusing/rate-keys'
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

export interface BanBulkRow {
  id: string
  ban_level: string
  expires_at: string | null
}

export interface PoiBlockBulkRow {
  id: string
  blocked_until: string
}

export const SKIP_ALREADY_RELEASED = '이미 해제됐어요'
export const SKIP_PERMANENT = '영구 제재라 연장할 수 없어요'
export const SKIP_ALREADY_LONGER = '이미 더 오래 가요'
export const SKIP_CHANGED_MEANWHILE = '그 사이 상태가 바뀌어 연장하지 못했어요'

function missingSkips(ids: string[], present: Set<string>): BulkSkip[] {
  return ids.filter((id) => !present.has(id)).map((id) => ({ id, reason: SKIP_ALREADY_RELEASED }))
}

function isExpired(iso: string | null, now: Date): boolean {
  return iso !== null && new Date(iso).getTime() <= now.getTime()
}

export interface BanReleaseSummary {
  existingIds: string[]
  skipped: BulkSkip[]
  impact: { hardCount: number; softCount: number; expiredCount: number }
}

/** 해제 미리보기: 활성 hard·soft 수와 이미 만료된 수. 이미 없는 id는 건너뜀 */
export function summarizeBanRelease(ids: string[], rows: BanBulkRow[], now: Date): BanReleaseSummary {
  let hardCount = 0
  let softCount = 0
  let expiredCount = 0
  for (const row of rows) {
    if (isExpired(row.expires_at, now)) expiredCount += 1
    else if (row.ban_level === 'hard') hardCount += 1
    else softCount += 1
  }
  return {
    existingIds: rows.map((r) => r.id),
    skipped: missingSkips(ids, new Set(rows.map((r) => r.id))),
    impact: { hardCount, softCount, expiredCount },
  }
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

/**
 * 연장 미리보기: 다시 적용될(이미 만료된) 수와 건너뛸 영구 제재 수. 영구 제재와 이미 `until`
 * 이후까지 가는 행, 이미 없는 id는 건너뜀 — `extendBans`의 `.lt('expires_at', until)` 조건과
 * 같은 판정이다(영구는 null이라 비교가 거짓).
 */
export function summarizeBanExtend(ids: string[], rows: BanBulkRow[], until: Date, now: Date): ExtendSummary {
  const extendableIds: string[] = []
  const skipped = missingSkips(ids, new Set(rows.map((r) => r.id)))
  let reapplyCount = 0
  let permanentCount = 0
  for (const row of rows) {
    if (row.expires_at === null) {
      permanentCount += 1
      skipped.push({ id: row.id, reason: SKIP_PERMANENT })
    } else if (new Date(row.expires_at).getTime() >= until.getTime()) {
      skipped.push({ id: row.id, reason: SKIP_ALREADY_LONGER })
    } else {
      extendableIds.push(row.id)
      if (isExpired(row.expires_at, now)) reapplyCount += 1
    }
  }
  return { extendableIds, skipped, impact: { reapplyCount, permanentCount } }
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
  table: 'user_shadow_bans' | 'poi_blocks',
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

const LEVEL_LABEL = { soft: 'Soft-ban', hard: 'Hard-ban' } as const
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' } as const

function formatRate(rate: number): string {
  if (rate <= 0) return '차단'
  if (rate >= 1) return '정상'
  return `${Math.round(rate * 100)}%`
}

/**
 * 등급 전환 확인창의 영향 문장(티켓 20260924_0952). 정책의 등급별 드랍 배율이 어떻게 바뀌는지
 * 값이 달라지는 등급만 나열한다. 배율은 `BAN_RATE_KEY`가 가리키는 정책 키에서 읽는다.
 */
export function describeBanLevelChange(from: 'soft' | 'hard', to: 'soft' | 'hard', policy: AbusingPolicy): string {
  const rarities = Object.keys(RARITY_LABEL) as (keyof typeof RARITY_LABEL)[]
  const changes = rarities
    .map((rarity) => {
      const before = policy[BAN_RATE_KEY[from][rarity]] as number
      const after = policy[BAN_RATE_KEY[to][rarity]] as number
      return before === after ? null : `${RARITY_LABEL[rarity]} ${formatRate(before)} → ${formatRate(after)}`
    })
    .filter((line): line is string => line !== null)

  const head = `${LEVEL_LABEL[from]}에서 ${LEVEL_LABEL[to]}으로 바뀌면 이 유저의 드랍 배율이 달라져요.`
  return changes.length > 0 ? `${head} ${changes.join(', ')}` : `${head} 현재 정책에서는 등급별 배율이 같아요.`
}
