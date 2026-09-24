import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { readBulkRequest, bulkJson } from '@/lib/admin/bulk/server'
import { confirmPhraseFor, isPhraseMatch, type BulkSkip } from '@/lib/admin/bulk/shared'
import {
  USER_BULK_HEAVY_MAX_IDS,
  partitionUserTargets,
  readGrantPayload,
  userBulkPhraseAction,
  type UserBulkAction,
} from '@/lib/admin/user-bulk'
import { computeUserBulkImpact, fetchUserTargets } from '@/lib/admin/user-bulk-impact'
import { resetUserData, hardDeleteUser } from '@/lib/admin/user-actions'
import { validateAdminGrantInput, executeAdminGrant, type ValidAdminGrant } from '@/lib/points/admin-grant'

/**
 * 유저 일괄 처리(티켓 20260924_0951, 상위 티켓 §4.4·결정 3) — 포인트 지급·회수, 초기화, 완전
 * 삭제를 한 라우트에서 다룬다. 셋 다 되돌릴 수 없는 등급 3이라 미리보기(`dry_run`)가 영향
 * 수치와 확인 문구를 돌려주고, 실행은 서버가 다시 계산한 확인 문구가 일치해야 한다(409).
 *
 * - 어드민 계정과 실행 어드민 본인은 대상에서 자동으로 뺀다(`partitionUserTargets`).
 * - 유저 단위 작업은 하나로 묶을 수 없어 유저별로 실행하고 `results[{ id, ok, error }]`를 돌려준다.
 *   표준 응답(`processed`·`skipped`)에도 같은 내용을 담아 화면의 공용 토스트가 그대로 쓴다.
 */
export const maxDuration = 60

/** 포인트 지급은 유저당 RPC 한 번 + 알림이라 동시에 5건까지 */
const GRANT_CONCURRENCY = 5
/** 초기화·삭제는 유저당 수십 개 문장이라 동시 2건까지 */
const MUTATE_CONCURRENCY = 2

interface UserActionResult {
  id: string
  ok: boolean
  error?: string
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function safely(id: string, run: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<UserActionResult> {
  try {
    const outcome = await run()
    return outcome.ok ? { id, ok: true } : { id, ok: false, error: outcome.error }
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.' }
  }
}

export async function POST(req: NextRequest) {
  const result = await readBulkRequest(req, {
    actions: {
      grant_points: {},
      reset: { maxIds: USER_BULK_HEAVY_MAX_IDS },
      delete: { maxIds: USER_BULK_HEAVY_MAX_IDS },
    },
    idFormat: 'uuid',
  })
  if (!result.ok) return result.response
  const { admin, body } = result.context
  const { ids, payload, dryRun, confirmPhrase } = body
  const action = body.action as UserBulkAction

  const supabase = createServiceClient()

  let grant: ValidAdminGrant | undefined
  if (action === 'grant_points') {
    const input = readGrantPayload(payload)
    // 미리보기는 고액 확인 없이 영향 수치를 보여 준다 — 확인은 실행 요청(확인 문구 입력 뒤)에서 받는다.
    const validated = validateAdminGrantInput({ ...input, confirmed: dryRun ? true : input.confirmed })
    if (!validated.ok) {
      return NextResponse.json(
        validated.requiresConfirmation
          ? { error: validated.error, requiresConfirmation: true }
          : { error: validated.error },
        { status: validated.status }
      )
    }
    grant = validated.grant
  }

  let partition
  try {
    const targets = await fetchUserTargets(supabase, ids)
    partition = partitionUserTargets(ids, targets, admin.id)
  } catch (error) {
    console.error('[users bulk] 대상 유저 조회 실패:', error)
    return NextResponse.json({ error: '대상 유저를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
  }

  const requiredPhrase = confirmPhraseFor(userBulkPhraseAction(action, grant?.amount), partition.eligible.length)

  if (dryRun) {
    try {
      const impact = await computeUserBulkImpact(supabase, action, partition, grant)
      return bulkJson(
        { processed: partition.eligible, skipped: partition.skipped, dryRun: true, requiredPhrase, impact: { ...impact } },
        { admin, action }
      )
    } catch (error) {
      console.error('[users bulk] 영향 집계 실패:', error)
      return NextResponse.json({ error: '영향 범위를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 })
    }
  }

  if (!confirmPhrase || !isPhraseMatch(confirmPhrase, requiredPhrase)) {
    return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.', requiredPhrase }, { status: 409 })
  }

  const { eligible } = partition
  let results: UserActionResult[]

  if (action === 'grant_points' && grant) {
    const validGrant = grant
    results = await mapWithConcurrency(eligible, GRANT_CONCURRENCY, (id) =>
      safely(id, async () => {
        const executed = await executeAdminGrant(id, validGrant)
        return executed ? { ok: true } : { ok: false, error: '지급/회수 처리에 실패했습니다.' }
      })
    )
  } else if (action === 'reset') {
    results = await mapWithConcurrency(eligible, MUTATE_CONCURRENCY, (id) =>
      safely(id, async () => {
        const outcome = await resetUserData(supabase, id, admin.email)
        return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
      })
    )
  } else {
    results = await mapWithConcurrency(eligible, MUTATE_CONCURRENCY, (id) =>
      safely(id, async () => {
        const outcome = await hardDeleteUser(supabase, id, admin.email)
        return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
      })
    )
  }

  const failed: BulkSkip[] = results.filter((r) => !r.ok).map((r) => ({ id: r.id, reason: r.error ?? '처리하지 못했습니다.' }))
  return bulkJson(
    {
      processed: results.filter((r) => r.ok).map((r) => r.id),
      skipped: [...partition.skipped, ...failed],
      results,
    },
    { admin, action }
  )
}
