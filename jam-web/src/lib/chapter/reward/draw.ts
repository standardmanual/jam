/**
 * 챕터 오름 보상 추첨 실행 — 읽기 + 추첨 (티켓 20261127_1731 C3a)
 *
 * 순서: 개수(`chapter_definitions.reward_count`) → 소속 트라이브·후보·카운터 → 정책 두 곳 → 추첨(`roll.ts`) → 후보 없는 개체 로그.
 * **추첨만 한다.** `chapter_reward_grants`에 기록하거나 인벤토리에 넣는 일은 하지 않는다(DB 함수 B5와 C3b가 한다). 결과는 저장 모양(`StoredChapterRewardItem`)으로 돌려준다.
 *
 * 규칙
 *  - 소속 트라이브(`users.tribe_id`)가 없으면 `ChapterRewardError('no_tribe')`를 던진다. 추첨 난수를 쓰기 전이다.
 *  - 마친 챕터의 `reward_count`가 NULL이면(보상 없음) 아무것도 읽지 않고 `count: null`과 빈 목록을 돌려준다.
 *  - 모든 등급에 후보가 없어 나올 개체가 하나도 없으면 던지지 않고 빈 목록을 돌려준다 — 호출부(C3b)가 기록 없이 다음 기회로 미룬다.
 *  - 읽기 오류와 설정 누락은 던진다 — 틀린 값으로 추첨하지 않는다.
 * 옛 캡슐의 `loadRollData`·`rollCapsuleItems`에서 복사해 왔다. 이 파일은 `lib/capsule/*`를 가져오지 않는다. 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import type { IssueBook, Rand } from '@/lib/drop-engine/syncIssue'
import { logEngineDecision } from '@/lib/engine-log'
import { getJamPolicy } from '@/lib/jam/policy'
import { getChapterRewardCount, getChapterRewardPolicy } from './policy'
import { rollChapterReward, tribesWithCandidates } from './roll'
import { toStoredItems, type ChapterRewardBadge, type StoredChapterRewardItem } from './stored'

/** 판정 로그(`engine_decision_log`)의 경로 값 */
export const CHAPTER_REWARD_PATH = 'chapter_reward'

export type ChapterRewardErrorCode = 'no_tribe'

/** 호출부가 가려 처리할 수 있는 보상 추첨 거절. 모르는 오류는 일반 `Error`다. */
export class ChapterRewardError extends Error {
  readonly code: ChapterRewardErrorCode

  constructor(code: ChapterRewardErrorCode) {
    super(code)
    this.name = 'ChapterRewardError'
    this.code = code
  }
}

export interface DrawChapterRewardOptions {
  /** 마친 챕터 번호(`chapter_definitions.chapter_no`) */
  finishedChapterNo: number
  rand?: Rand
  now?: Date
}

export interface ChapterRewardDraw {
  /** 저장 모양의 추첨 결과. 나올 개체가 없으면 빈 목록 */
  items: StoredChapterRewardItem[]
  /** 이름표용 트라이브 목록(`record.ts`가 받는다). 보상 없음이면 빈 목록 */
  tribes: { id: string; name: string }[]
  /** 정해진 개수(`reward_count`). 보상 없음이면 `null` */
  count: number | null
  /** 모든 등급에 후보가 없어 건너뛴 개체 수 */
  skippedCount: number
}

/**
 * 추첨에 쓸 데이터(트라이브·후보·카운터)를 읽는다. 읽지 못하면 던진다 — 틀린 값으로 추첨하지 않는다.
 * 소속 트라이브가 없으면 `ChapterRewardError('no_tribe')`.
 */
export async function loadChapterRewardRollData(supabase: SupabaseClient, userId: string) {
  const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (userError) throw new Error(`users 조회 실패: ${userError.message}`)
  const tribeId = (userRow as { tribe_id?: string | null } | null)?.tribe_id ?? null
  if (!tribeId) throw new ChapterRewardError('no_tribe')

  const { data: tribeRows, error: tribeError } = await supabase.from('tribes').select('id, name')
  if (tribeError) throw new Error(`tribes 조회 실패: ${tribeError.message}`)
  const tribes = (tribeRows ?? []) as { id: string; name: string }[]

  const { data: bookRows, error: bookError } = await supabase
    .from('item_books')
    .select('id, tribe_id, is_active, drop_excluded, valid_from, valid_until')
    .eq('is_active', true)
    .eq('drop_excluded', false)
  if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
  const books = (bookRows ?? []) as IssueBook[]

  const badges = await fetchAllRowsIn<ChapterRewardBadge, string>(
    'chapter-reward:item-badges',
    'id',
    books.map((b) => b.id),
    (chunk) =>
      supabase
        .from('badges')
        .select(
          'id, name, image_url, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, point_reward, always_locked, unlock_required'
        )
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', chunk)
  )

  // 읽지 못한 값을 0으로 보고 추첨하면 보정이 틀어진다 — 던진다. 행이 없으면 둘 다 0이다.
  const { data: stateRow, error: stateError } = await supabase
    .from('user_drop_state')
    .select('common_streak, capsule_epic_miss')
    .eq('user_id', userId)
    .maybeSingle()
  if (stateError) throw new Error(`user_drop_state 조회 실패: ${stateError.message}`)
  const state = stateRow as { common_streak?: number | null; capsule_epic_miss?: number | null } | null

  return {
    tribeId,
    tribes,
    books,
    badges,
    commonStreak: Number(state?.common_streak ?? 0) || 0,
    epicMiss: Number(state?.capsule_epic_miss ?? 0) || 0,
  }
}

/**
 * 마친 챕터의 보상을 추첨한다. 저장·지급은 하지 않는다.
 * 던지는 것: `ChapterRewardError`(`no_tribe`), 읽기 오류·설정 누락(일반 오류).
 */
export async function drawChapterReward(
  supabase: SupabaseClient,
  userId: string,
  options: DrawChapterRewardOptions
): Promise<ChapterRewardDraw> {
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  const count = await getChapterRewardCount(supabase, options.finishedChapterNo)
  if (count === null) return { items: [], tribes: [], count: null, skippedCount: 0 }

  const data = await loadChapterRewardRollData(supabase, userId)
  const chapterPolicy = await getChapterRewardPolicy(supabase)
  const jamPolicy = await getJamPolicy(supabase)

  const rolled = rollChapterReward<ChapterRewardBadge>(
    {
      policy: { ...jamPolicy, ...chapterPolicy },
      count,
      tribeId: data.tribeId,
      tribeIds: tribesWithCandidates(data.tribes.map((t) => t.id), data.tribeId, data.books, data.badges, now),
      books: data.books,
      badges: data.badges,
      commonStreak: data.commonStreak,
      epicMiss: data.epicMiss,
      now,
    },
    rand
  )

  for (const skip of rolled.skipped) {
    console.warn(
      `[chapter-reward] 후보 없음 — 개체 건너뜀 (userId: ${userId}, 챕터: ${options.finishedChapterNo}, tribe: ${skip.tribeId}, 뽑힌 등급: ${skip.rolledRarity})`
    )
    await logEngineDecision('drop', 'drop_attempt', userId, {
      path: CHAPTER_REWARD_PATH,
      outcome: 'no_candidate',
      tribeId: skip.tribeId,
      rolledRarity: skip.rolledRarity,
    })
  }

  return { items: toStoredItems(rolled), tribes: data.tribes, count, skippedCount: rolled.skipped.length }
}
