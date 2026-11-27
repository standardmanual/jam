/**
 * 챕터 오름 보상 지급 연결 (티켓 20261127_1732 C3b, 상위 20261127_1720)
 *
 * 챕터 K에 올랐다는 것은 챕터 K-1을 마쳤다는 뜻이다. 오른 챕터마다 «마친 챕터(K-1)»의 보상을 (유저, 챕터)당 한 번 준다. K = 1(챕터 시작)은 보상이 없다.
 * 한 챕터의 지급 순서: 이미 지급 기록이 있는지 확인 → 추첨(C3a `drawChapterReward`) → DB 함수 `chapter_reward_issue`(B5) → 후속 처리(포인트, 칸 알림).
 *
 *  - `issueChapterReward`: 한 챕터의 지급. 기록이 있으면 추첨하지 않고 `duplicate`. 보상 없음·나올 개체 없음·소속 트라이브 없음은 기록하지 않고 `skipped`(다음 보충 때 다시 시도).
 *    빈칸이 모자라면 DB가 `pending`으로 남기고 판정 로그만 남긴다(동기화 막힘은 `readCapsuleReceiveBlocked`가 합산한다, Q-c). 지급이 확정된 뒤 후속 처리가 실패해도 되돌리지 않는다.
 *  - `claimPendingChapterRewards`: 칸이 비면 `pending` 행을 오래된 순으로 저장된 결과 그대로 받는다. 칸이 모자라면 거기서 멈춘다(부분 지급 없음).
 *  - `findMissingRewardChapters`: 지급 기록이 없는 «마친 챕터»를 찾는다. (a) 이관(C1b)이 올린 챕터(`chapter_jam_backfill.promoted_chapters`), (b) 새 방식이 올렸지만 오름 처리 전에
 *    프로세스가 죽어 지급이 빠진 챕터(`chapter_ups.reached_at`이 승급이 일어난 적립 기록 `chapter_jam_events.created_at`과 같다 — 승급 함수가 한 트랜잭션에서 둘을 적는다).
 *    옛 방식으로 이미 마친 챕터는 소급하지 않는다.
 *  - `settleChapterRewards`: 대기 받기 → (`scanMissing`이면) 보충 지급. 같은 프로세스에서 한 유저를 동시에 돌리지 않는다.
 *  - `grantRewardsForReachedChapters`: 챕터 오름 처리(`rise.ts`)가 부르는 진입점.
 *
 * 모두 **던지지 않는다.** 실패는 `engine_decision_log`(`points`, `chapter_reward_failed`)에 남긴다. 옛 `lib/capsule/*`를 가져오지 않는다. 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rand } from '@/lib/drop-engine/syncIssue'
import { logEngineDecision } from '@/lib/engine-log'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { createServiceClient } from '@/lib/supabase/server'
import { ChapterRewardError, CHAPTER_REWARD_PATH, drawChapterReward } from './draw'
import { recordChapterRewardItems, type GrantedChapterRewardItem } from './record'
import { rebuildChapterRewardItems, type StoredChapterRewardItem } from './stored'

export type IssueChapterRewardStatus = 'claimed' | 'pending' | 'duplicate' | 'skipped' | 'suspended' | 'failed'

export interface IssueChapterRewardResult {
  status: IssueChapterRewardStatus
}

export interface IssueChapterRewardOptions {
  rand?: Rand
  now?: Date
}

type FailureStep = 'lookup' | 'draw' | 'issue' | 'claim' | 'follow_up' | 'scan'

/** 같은 프로세스에서 지금 정산 중인 유저 */
const settlingUsers = new Set<string>()

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function recordRewardFailure(userId: string, step: FailureStep, chapterNo: number | null, error: string): Promise<void> {
  try {
    console.error(`[chapter-reward] 지급 실패 — userId: ${userId}, step: ${step}, chapterNo: ${chapterNo ?? '-'}: ${error}`)
    await logEngineDecision('points', 'chapter_reward_failed', userId, { step, chapterNo, error })
  } catch (e) {
    console.error('[chapter-reward] 실패 기록 중 예외:', e)
  }
}

async function recordHeld(userId: string, chapterNo: number, free: unknown, needed: unknown): Promise<void> {
  try {
    await logEngineDecision('drop', 'drop_attempt', userId, {
      path: CHAPTER_REWARD_PATH,
      outcome: 'held',
      chapterNo,
      free: typeof free === 'number' ? free : null,
      needed: typeof needed === 'number' ? needed : null,
    })
  } catch (e) {
    console.error(`[chapter-reward] 판정 로그 실패 — 보류는 유지한다 (userId: ${userId}, chapterNo: ${chapterNo}):`, e)
  }
}

/** 오른 챕터 목록 → 보상을 줄 «마친 챕터» 번호(오름차순, 중복 없음). K = 1 이하는 보상이 없다. */
export function finishedChapterNosFor(reachedChapters: readonly number[]): number[] {
  const finished = new Set<number>()
  for (const k of reachedChapters) {
    if (Number.isInteger(k) && k >= 2) finished.add(k - 1)
  }
  return [...finished].sort((a, b) => a - b)
}

interface RpcReply {
  ok?: boolean
  error?: string
  duplicate?: boolean
  status?: string
  items?: unknown
  free?: unknown
  needed?: unknown
}

function asReply(data: unknown): RpcReply | null {
  return typeof data === 'object' && data !== null ? (data as RpcReply) : null
}

/** 지급이 확정된 뒤의 후속 처리 — 포인트(피드 없이)를 주고 칸 알림을 검사한다. 던지지 않고, 실패해도 지급은 되돌리지 않는다. */
async function followUpClaimed(
  supabase: SupabaseClient,
  userId: string,
  chapterNo: number,
  stored: readonly StoredChapterRewardItem[],
  granted: unknown,
  { notify }: { notify: boolean }
): Promise<void> {
  try {
    const rebuilt = await rebuildChapterRewardItems(supabase, stored)
    const dbItems = (Array.isArray(granted) ? granted : []) as GrantedChapterRewardItem[]
    await recordChapterRewardItems(userId, rebuilt.tribes, rebuilt.items, dbItems)
  } catch (e) {
    await recordRewardFailure(userId, 'follow_up', chapterNo, `후속 처리 예외(지급은 유지): ${errorText(e)}`)
  }
  if (!notify) return
  try {
    await notifyInventorySlotsLow(userId, supabase)
  } catch (e) {
    console.error(`[chapter-reward] 칸 알림 실패 — 지급은 유지한다 (userId: ${userId}):`, e)
  }
}

/** 마친 챕터 한 개의 보상을 지급한다. 던지지 않는다. */
export async function issueChapterReward(
  supabase: SupabaseClient,
  userId: string,
  finishedChapterNo: number,
  options: IssueChapterRewardOptions = {}
): Promise<IssueChapterRewardResult> {
  try {
    // ① 이미 지급 기록이 있으면 추첨하지 않는다
    const { data: existing, error: lookupError } = await supabase
      .from('chapter_reward_grants')
      .select('chapter_no')
      .eq('user_id', userId)
      .eq('chapter_no', finishedChapterNo)
      .maybeSingle()
    if (lookupError) {
      await recordRewardFailure(userId, 'lookup', finishedChapterNo, `chapter_reward_grants 조회 실패: ${lookupError.message}`)
      return { status: 'failed' }
    }
    if (existing) return { status: 'duplicate' }

    // ② 추첨
    let draw: Awaited<ReturnType<typeof drawChapterReward>>
    try {
      draw = await drawChapterReward(supabase, userId, { finishedChapterNo, rand: options.rand, now: options.now })
    } catch (e) {
      if (e instanceof ChapterRewardError && e.code === 'no_tribe') return { status: 'skipped' }
      await recordRewardFailure(userId, 'draw', finishedChapterNo, errorText(e))
      return { status: 'failed' }
    }
    if (draw.count === null || draw.items.length === 0) return { status: 'skipped' }

    // ③ 지급(DB 함수 B5)
    const { data, error } = await supabase.rpc('chapter_reward_issue', {
      p_user_id: userId,
      p_chapter_no: finishedChapterNo,
      p_items: draw.items,
    })
    if (error) {
      await recordRewardFailure(userId, 'issue', finishedChapterNo, `chapter_reward_issue 호출 실패: ${error.message}`)
      return { status: 'failed' }
    }
    const reply = asReply(data)
    if (!reply || reply.ok !== true) {
      if (reply?.error === 'user_suspended') return { status: 'suspended' }
      await recordRewardFailure(userId, 'issue', finishedChapterNo, `chapter_reward_issue 거절: ${reply?.error ?? '응답 모양이 올바르지 않다'}`)
      return { status: 'failed' }
    }
    if (reply.duplicate === true) return { status: 'duplicate' }

    // ④ 후속 처리
    if (reply.status === 'claimed') {
      await followUpClaimed(supabase, userId, finishedChapterNo, draw.items, reply.items, { notify: true })
      return { status: 'claimed' }
    }
    if (reply.status === 'pending') {
      await recordHeld(userId, finishedChapterNo, reply.free, reply.needed)
      return { status: 'pending' }
    }
    await recordRewardFailure(userId, 'issue', finishedChapterNo, `chapter_reward_issue가 알 수 없는 상태를 돌려줬다: ${String(reply.status)}`)
    return { status: 'failed' }
  } catch (e) {
    await recordRewardFailure(userId, 'issue', finishedChapterNo, errorText(e))
    return { status: 'failed' }
  }
}

/**
 * 대기(`pending`) 보상을 오래된 순으로 받는다. 빈칸이 모자라면 거기서 멈춘다(부분 지급 없음, 뒤 행도 건너뜀). 던지지 않는다.
 * 돌려주는 값은 이번에 받은 챕터 수다.
 */
export async function claimPendingChapterRewards(supabase: SupabaseClient, userId: string): Promise<number> {
  let claimedCount = 0
  try {
    const { data, error } = await supabase
      .from('chapter_reward_grants')
      .select('chapter_no, drawn_items, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .order('chapter_no', { ascending: true })
    if (error) {
      await recordRewardFailure(userId, 'claim', null, `chapter_reward_grants 대기 조회 실패: ${error.message}`)
      return 0
    }
    const rows = (data ?? []) as { chapter_no: number; drawn_items: unknown }[]

    for (const row of rows) {
      const { data: replyData, error: rpcError } = await supabase.rpc('chapter_reward_claim', {
        p_user_id: userId,
        p_chapter_no: row.chapter_no,
      })
      if (rpcError) {
        await recordRewardFailure(userId, 'claim', row.chapter_no, `chapter_reward_claim 호출 실패: ${rpcError.message}`)
        break
      }
      const reply = asReply(replyData)
      if (!reply || reply.ok !== true) {
        const code = reply?.error
        if (code === 'insufficient_slots' || code === 'user_suspended') break
        await recordRewardFailure(userId, 'claim', row.chapter_no, `chapter_reward_claim 거절: ${code ?? '응답 모양이 올바르지 않다'}`)
        continue
      }
      if (reply.duplicate === true) continue
      claimedCount += 1
      const stored = (Array.isArray(row.drawn_items) ? row.drawn_items : []) as StoredChapterRewardItem[]
      await followUpClaimed(supabase, userId, row.chapter_no, stored, reply.items, { notify: false })
    }
  } catch (e) {
    await recordRewardFailure(userId, 'claim', null, errorText(e))
  }
  if (claimedCount > 0) {
    try {
      await notifyInventorySlotsLow(userId, supabase)
    } catch (e) {
      console.error(`[chapter-reward] 칸 알림 실패 — 지급은 유지한다 (userId: ${userId}):`, e)
    }
  }
  return claimedCount
}

function timeKey(value: string): number {
  return new Date(value).getTime()
}

/** 지급 기록이 없는 «마친 챕터» 번호(오름차순). 읽지 못하면 빈 목록과 실패 기록이다. 던지지 않는다. */
export async function findMissingRewardChapters(supabase: SupabaseClient, userId: string): Promise<number[]> {
  try {
    const finished = new Set<number>()

    // (a) 이관이 새로 올린 챕터
    const { data: backfillRows, error: backfillError } = await supabase
      .from('chapter_jam_backfill')
      .select('promoted_chapters')
      .eq('user_id', userId)
    if (backfillError) throw new Error(`chapter_jam_backfill 조회 실패: ${backfillError.message}`)
    for (const row of (backfillRows ?? []) as { promoted_chapters: number[] | null }[]) {
      for (const k of finishedChapterNosFor(row.promoted_chapters ?? [])) finished.add(k)
    }

    // (b) 새 방식이 올렸지만 지급이 빠졌을 수 있는 챕터 — 도달 시각이 승급 적립 기록의 시각과 같다
    const { data: upRows, error: upError } = await supabase.from('chapter_ups').select('chapter_no, reached_at').eq('user_id', userId)
    if (upError) throw new Error(`chapter_ups 조회 실패: ${upError.message}`)
    const ups = (upRows ?? []) as { chapter_no: number; reached_at: string }[]
    if (ups.length > 0) {
      const { data: eventRows, error: eventError } = await supabase
        .from('chapter_jam_events')
        .select('created_at')
        .eq('user_id', userId)
        .eq('promoted', true)
      if (eventError) throw new Error(`chapter_jam_events 조회 실패: ${eventError.message}`)
      const promotedAt = new Set(((eventRows ?? []) as { created_at: string }[]).map((e) => timeKey(e.created_at)))
      for (const up of ups) {
        if (promotedAt.has(timeKey(up.reached_at))) {
          for (const k of finishedChapterNosFor([up.chapter_no])) finished.add(k)
        }
      }
    }

    if (finished.size === 0) return []

    const { data: grantRows, error: grantError } = await supabase.from('chapter_reward_grants').select('chapter_no').eq('user_id', userId)
    if (grantError) throw new Error(`chapter_reward_grants 조회 실패: ${grantError.message}`)
    const granted = new Set(((grantRows ?? []) as { chapter_no: number }[]).map((g) => g.chapter_no))

    return [...finished].filter((k) => !granted.has(k)).sort((a, b) => a - b)
  } catch (e) {
    await recordRewardFailure(userId, 'scan', null, errorText(e))
    return []
  }
}

/**
 * 대기 보상을 먼저 받고, `scanMissing`이면 이관·누락으로 지급되지 않은 챕터를 오래된 순으로 지급한다. 던지지 않는다.
 * 같은 프로세스에서 한 유저의 호출이 이미 돌고 있으면 아무 일도 하지 않는다.
 */
export async function settleChapterRewards(
  supabase: SupabaseClient,
  userId: string,
  options: { scanMissing: boolean } & IssueChapterRewardOptions
): Promise<void> {
  if (settlingUsers.has(userId)) return
  settlingUsers.add(userId)
  try {
    await claimPendingChapterRewards(supabase, userId)
    if (options.scanMissing) {
      const missing = await findMissingRewardChapters(supabase, userId)
      for (const chapterNo of missing) {
        await issueChapterReward(supabase, userId, chapterNo, { rand: options.rand, now: options.now })
      }
    }
  } catch (e) {
    await recordRewardFailure(userId, 'scan', null, errorText(e))
  } finally {
    settlingUsers.delete(userId)
  }
}

/** 챕터 오름 처리가 부르는 진입점 — 오른 챕터마다 마친 챕터(K-1)의 보상을 준다. 던지지 않는다. */
export async function grantRewardsForReachedChapters(
  userId: string,
  reachedChapters: readonly number[],
  options: IssueChapterRewardOptions = {}
): Promise<void> {
  try {
    const finished = finishedChapterNosFor(reachedChapters)
    if (finished.length === 0) return
    const supabase = createServiceClient()
    for (const chapterNo of finished) {
      await issueChapterReward(supabase, userId, chapterNo, options)
    }
  } catch (e) {
    await recordRewardFailure(userId, 'issue', null, errorText(e))
  }
}
