/**
 * 챕터 점수 연결 (티켓 20261019_1315, 운영 로직 12.2절)
 *
 * 일이 일어날 때 마이그레이션 221의 DB 함수 `chapter_add_score`를 부른다. 이 함수가 점수 가산의 유일한 경로다.
 *  - 점수 표(활동 종류별 1당 몇 점인지)와 모은 잼 주 300점 상한은 DB 설정 행과 함수가 갖고 있다. 코드에 상수로 두지 않는다.
 *    호출부는 «무슨 일이, 어떤 원천으로, 몇 단위, 언제(KST 날짜)»만 넘긴다.
 *  - (활동 종류, 원천 id)는 전역 유일 키다. 같은 일을 두 번 보내면 DB가 기존 결과를 돌려주고 점수는 한 번만 센다.
 *    다른 유저의 키와 겹치면 DB가 예외를 낸다(원천 id는 전역에서 유일해야 한다).
 *  - `service_role`만 실행할 수 있다. 호출부는 service 클라이언트를 넘긴다. 동기화 안에서는 주입된 클라이언트를 그대로 넘긴다.
 *
 * **절대 던지지 않는다.** 점수 실패가 본 동작(캡슐 열기·드랍·정산 등)과 응답을 바꾸면 안 된다. 실패는 `console.error`와
 * `engine_decision_log`(`points` 엔진, 이벤트 `chapter_score_failed`)에 남기고 `{ ok: false }`를 돌려준다.
 * 같은 원천 id로 다시 보낼 수 있어서 기록만 있으면 나중에 채울 수 있다(자동 보정은 티켓 20261020_1010).
 *
 * 챕터 오름 처리(소식·챕터 배지 판정)는 `rise.ts`의 `processChapterRise`가 한다(티켓 20261019_1316). 점수가 성공하고 오른 챕터가 있으면 여기서 이어서 부른다.
 * 오름 처리가 던지거나 실패해도 점수 결과(`ok`, `scoreAdded`, `reachedChapters`)는 바뀌지 않는다. `rise.ts`는 `jamActionRoute`를 호출 시점에 불러 순환을 피한다.
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEngineDecision } from '@/lib/engine-log'
import type { Database } from '@/types/database.generated'
import type { ChapterScoreKind } from './kinds'
import { processChapterRise } from './rise'

type ChapterAddScoreArgs = Database['public']['Functions']['chapter_add_score']['Args']

export interface AwardChapterScoreInput {
  userId: string
  kind: ChapterScoreKind
  /** 같은 일을 가리키는 전역 유일 id. 같은 (kind, sourceId)는 한 번만 센다 */
  sourceId: string
  /** 단위 수(모은 잼의 양, 열기 1회는 1). 기본 1. 1 미만이면 DB를 부르지 않는다 */
  amount?: number
  /** 활동한 날(KST, `YYYY-MM-DD`). 값이 없으면 `p_occurred_on`을 보내지 않는다(DB가 오늘로 센다). 미래 날짜는 DB가 거절한다 */
  occurredOn?: string | null
  /**
   * 참이면 오름이 있어도 챕터 배지 판정을 하지 않는다(소식은 보낸다). 호출한 동기화의 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)이 이어서 읽는 호출부만 켠다
   * (`lib/jam/settlement.ts`). 기본은 거짓 — 바로 판정한다. 이중 판정을 피하는 규칙의 근거는 `rise.ts` 머리말에 있다
   */
  skipRiseBadgeEvaluation?: boolean
}

export type AwardChapterScoreResult =
  | {
      ok: true
      /** 이번에 센 점수. 같은 일을 다시 보낸 경우에는 이미 센 점수 */
      scoreAdded: number
      /** 지금 챕터. 챕터를 시작하기 전이면 null */
      currentChapter: number | null
      /** 이번 호출로 오른 챕터 번호 목록. 오름 처리는 호출한 쪽이 아니라 이어받는 쪽의 일이다 */
      reachedChapters: number[]
    }
  | { ok: false }

/** `chapter_add_score`와 `chapter_start`가 같은 표 모양을 돌려준다(`start.ts`도 이 읽기를 쓴다) */
export interface ChapterScoreRow {
  score_added: number
  current_chapter: number | null
  reached_chapters: number[]
}

export function toScoreRow(data: unknown): ChapterScoreRow | null {
  const row: unknown = Array.isArray(data) ? data[0] : null
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  if (typeof r.score_added !== 'number') return null
  if (r.current_chapter !== null && typeof r.current_chapter !== 'number') return null
  if (!Array.isArray(r.reached_chapters) || !r.reached_chapters.every((n) => typeof n === 'number')) return null
  return { score_added: r.score_added, current_chapter: r.current_chapter, reached_chapters: r.reached_chapters as number[] }
}

async function recordFailure(input: AwardChapterScoreInput, amount: number, error: string): Promise<void> {
  const occurredOn = input.occurredOn ? input.occurredOn : null
  console.error(
    `[chapter-score] 점수 연결 실패 — userId: ${input.userId}, kind: ${input.kind}, sourceId: ${input.sourceId}, amount: ${amount}, occurredOn: ${occurredOn ?? '생략'}: ${error}`
  )
  await logEngineDecision('points', 'chapter_score_failed', input.userId, {
    kind: input.kind,
    sourceId: input.sourceId,
    amount,
    occurredOn,
    error,
  })
}

/**
 * 오른 챕터가 있으면 오름 처리를 부른다. 점수는 이미 센 뒤라 오름 처리가 어떻게 되든 점수 결과를 바꾸지 않는다 — 던져도 여기서 삼킨다
 * (`processChapterRise`는 스스로 던지지 않지만 이 함수의 약속이 «점수 결과 불변»이다).
 */
async function handleRise(input: AwardChapterScoreInput, reachedChapters: number[]): Promise<void> {
  if (reachedChapters.length === 0) return
  try {
    await processChapterRise(
      { userId: input.userId, reachedChapters },
      { skipBadgeEvaluation: input.skipRiseBadgeEvaluation === true }
    )
  } catch (e) {
    console.error(`[chapter-score] 오름 처리 예외 — userId: ${input.userId}, sourceId: ${input.sourceId}:`, e)
  }
}

/** 챕터 점수를 센다. 던지지 않는다 — 실패하면 기록만 남기고 `{ ok: false }`다. */
export async function awardChapterScore(supabase: SupabaseClient, input: AwardChapterScoreInput): Promise<AwardChapterScoreResult> {
  const amount = input.amount ?? 1
  try {
    // 단위가 없는 일은 점수가 아니다(예: 잼 0). 실패가 아니라서 기록도 남기지 않는다
    if (Number.isInteger(amount) && amount < 1) return { ok: false }
    if (!Number.isInteger(amount)) {
      await recordFailure(input, amount, `amount는 정수여야 합니다 (받은 값: ${amount})`)
      return { ok: false }
    }

    const args: ChapterAddScoreArgs = {
      p_user_id: input.userId,
      p_activity_kind: input.kind,
      p_source_id: input.sourceId,
      p_amount: amount,
      // 생성 타입이 `p_occurred_on?: string`(null 불허)이다. 값이 없으면 키째 생략해야 DB 기본값(오늘, KST)이 쓰인다
      ...(input.occurredOn ? { p_occurred_on: input.occurredOn } : {}),
    }
    const { data, error } = await supabase.rpc('chapter_add_score', args)
    if (error) {
      await recordFailure(input, amount, `chapter_add_score RPC 오류: ${error.message ?? String(error)}`)
      return { ok: false }
    }
    const row = toScoreRow(data)
    if (!row) {
      await recordFailure(input, amount, 'chapter_add_score가 해석할 수 없는 응답을 돌려줬다')
      return { ok: false }
    }
    const result: AwardChapterScoreResult = {
      ok: true,
      scoreAdded: row.score_added,
      currentChapter: row.current_chapter,
      reachedChapters: row.reached_chapters,
    }
    await handleRise(input, result.reachedChapters)
    return result
  } catch (e) {
    // 기록하다 다시 던지는 일이 없도록 한 번 더 감싼다(logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다)
    try {
      await recordFailure(input, amount, `chapter_add_score 예외: ${e instanceof Error ? e.message : String(e)}`)
    } catch (recordError) {
      console.error('[chapter-score] 실패 기록 중 예외:', recordError)
    }
    return { ok: false }
  }
}
