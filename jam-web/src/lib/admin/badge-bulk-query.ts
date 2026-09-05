/**
 * 일괄 작업 «대상 배지» 조회 (서버 전용, 티켓 20260905_0034)
 *
 * ⚠️ **PostgREST 기본 페이지 상한(1000행)** — `.limit()`을 아무리 크게 줘도 서버 설정이
 * 우선해 **에러 없이 잘린 목록**이 돌아온다. 「필터 기준 전체 선택」이 잘린 목록을 대상으로
 * 삼으면 «207종을 폐기했다»고 보고하고 실제로는 일부만 처리한 상태가 된다. 그래서 이 파일은
 * 처음부터 `range`로 페이지를 끝까지 넘긴다 (`badge-families-query.ts`·
 * `missions/visibility-server.ts`와 같은 패턴).
 *
 * 순수 판정(계획·토큰·확인 문구)은 `badge-bulk.ts`에 있다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { chunkBadgeIds } from './badge-references'
import type { BulkTargetBadge, BulkTargetFilter } from './badge-bulk'

const PAGE_SIZE = 1000

const TARGET_COLUMNS = 'id, name, type, rarity, level, family_key, deleted_at'

export interface BulkTargetResult {
  targets: BulkTargetBadge[]
  /** 조회 실패 메시지. 값이 있으면 부분 목록이므로 **실행하면 안 된다** */
  error: string | null
}

/** 좁히는 축이 하나도 없는 필터인가 — 카탈로그 전체를 대상으로 삼는 사고를 막는다 */
export function isUnboundedFilter(filter: BulkTargetFilter): boolean {
  return !filter.type && !filter.activityType && !filter.rarity && !filter.q?.trim() && !filter.familyKey
}

/** 필터에 맞는 배지 **전량**을 가져온다 (페이지 경계 무관) */
export async function fetchBulkTargetsByFilter(filter: BulkTargetFilter): Promise<BulkTargetResult> {
  const supabase = createServiceClient()
  const targets: BulkTargetBadge[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('badges').select(TARGET_COLUMNS)

    if (filter.status === 'active') query = query.is('deleted_at', null)
    else if (filter.status === 'inactive') query = query.not('deleted_at', 'is', null)

    if (filter.type) query = query.eq('type', filter.type)
    if (filter.rarity) query = query.eq('rarity', filter.rarity)
    if (filter.activityType) query = query.contains('activity_types', [filter.activityType])
    if (filter.familyKey) query = query.eq('family_key', filter.familyKey)
    const q = filter.q?.trim()
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)

    const { data, error } = await query.order('id').range(from, from + PAGE_SIZE - 1)
    if (error) return { targets, error: error.message }

    const page = (data ?? []) as unknown as BulkTargetBadge[]
    targets.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return { targets, error: null }
}

/**
 * id 목록으로 대상을 가져온다 — 실행 단계는 **화면이 실제로 본 id**만 처리한다.
 * id는 80개씩 나눠 넘긴다(URL 길이 상한).
 */
export async function fetchBulkTargetsByIds(badgeIds: string[]): Promise<BulkTargetResult> {
  if (badgeIds.length === 0) return { targets: [], error: null }
  const supabase = createServiceClient()
  const targets: BulkTargetBadge[] = []

  for (const chunk of chunkBadgeIds(badgeIds)) {
    const { data, error } = await supabase.from('badges').select(TARGET_COLUMNS).in('id', chunk).order('id')
    if (error) return { targets, error: error.message }
    targets.push(...((data ?? []) as unknown as BulkTargetBadge[]))
  }

  return { targets, error: null }
}

// ── 실행 로그 (마이그레이션 136) ─────────────────────────────────────────────

export interface BulkRunLogRow {
  id: string
  admin_email: string | null
  action: string
  target_count: number
  affected_count: number
  detail: Record<string, unknown>
  created_at: string
}

/**
 * 실행 로그를 남긴다. **실패해도 작업을 실패시키지 않는다** — 작업은 이미 끝난 뒤이고,
 * 마이그레이션 136이 아직 실행되지 않았을 수도 있다(테이블 없음). 콘솔에는 반드시 남긴다.
 */
export async function recordBulkRun(entry: {
  adminUserId: string
  adminEmail: string
  action: string
  targetCount: number
  affectedCount: number
  detail: Record<string, unknown>
}): Promise<void> {
  console.info(
    `[badges/bulk] ${entry.action} — 대상 ${entry.targetCount}건 / 처리 ${entry.affectedCount}건 (${entry.adminEmail})`,
    entry.detail
  )
  const supabase = createServiceClient()
  const { error } = await supabase.from('admin_badge_bulk_runs').insert({
    admin_user_id: entry.adminUserId,
    admin_email: entry.adminEmail,
    action: entry.action,
    target_count: entry.targetCount,
    affected_count: entry.affectedCount,
    // 수기 도메인 값(Record<string, unknown>)은 생성 타입의 `Json`에 그대로 대입되지
    // 않는다 — **이 한 컬럼만** 좁혀서 캐스팅한다(jam-web/CLAUDE.md). 나머지 컬럼은
    // 계속 검사된다.
    detail: entry.detail as unknown as Json,
  })
  if (error) {
    console.error('[badges/bulk] 실행 로그 기록 실패(작업 자체는 완료됨):', error.message)
  }
}

/** 최근 실행 로그. 테이블이 아직 없으면(마이그레이션 136 미실행) 에러를 그대로 알린다 */
export async function fetchRecentBulkRuns(limit = 20): Promise<{ runs: BulkRunLogRow[]; error: string | null }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('admin_badge_bulk_runs')
    .select('id, admin_email, action, target_count, affected_count, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { runs: [], error: error.message }
  return { runs: (data ?? []) as unknown as BulkRunLogRow[], error: null }
}
