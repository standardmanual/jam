/**
 * 챕터 1 시작 연결 (티켓 20261019_1316, 운영 로직 2.2절·12.1절)
 *
 * 가입 완료(트라이브 선택) 때 챕터 1을 받는다(티켓 20261115_2056, 상위 20261115_2055). 마이그레이션 221의 DB 함수 `chapter_start`를 부른다.
 *  - 챕터가 비어 있을 때만 동작한다. 이미 챕터가 있으면 아무것도 하지 않고 `{ score_added: 0, current_chapter: 지금 챕터, reached_chapters: [] }`를 돌려줘서
 *    중복 호출은 DB가 막는다(멱등). 챕터 1은 점수와 상관없이 시작하고, 챕터를 받기 전에 쌓인 점수로 오를 수 있는 챕터까지 한 번에 올리며 오른 챕터마다 `chapter_ups`에 한 줄을 남긴다.
 *  - 돌려받은 `reached_chapters`(챕터 1 포함)는 오름 처리(`rise.ts`)로 넘긴다: 챕터 배지 판정과 소식은 챕터 1부터 한다(챕터 1 소식은 티켓 20261021_1248부터).
 *  - `service_role`만 실행할 수 있다. 호출부는 service 클라이언트를 넘긴다(가입 완료 라우트가 받는 클라이언트가 그렇다).
 *
 * `ensureChapterStarted`는 재시도 경로다(사용자 결정 4). 호출할 때마다 `user_chapters.chapter_no`를 읽어 **비어 있을 때만** 다시 시작한다 —
 * 이미 챕터가 있으면 RPC를 부르지 않아 불필요한 호출이 없다.
 *
 * **절대 던지지 않는다.** 챕터 시작 실패가 보상·라우트 응답을 바꾸면 안 된다. 실패는 `console.error`와
 * `engine_decision_log`(`points` 엔진, 이벤트 `chapter_start_failed`)에 남기고, 다음 호출의 재시도 경로가 다시 시도한다.
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEngineDecision } from '@/lib/engine-log'
import { processChapterRise } from './rise'

/** `chapter_start`가 돌려주는 표 모양 */
interface ChapterStartRow {
  score_added: number
  current_chapter: number | null
  reached_chapters: number[]
}

function toStartRow(data: unknown): ChapterStartRow | null {
  const row: unknown = Array.isArray(data) ? data[0] : null
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  if (typeof r.score_added !== 'number') return null
  if (r.current_chapter !== null && typeof r.current_chapter !== 'number') return null
  if (!Array.isArray(r.reached_chapters) || !r.reached_chapters.every((n) => typeof n === 'number')) return null
  return { score_added: r.score_added, current_chapter: r.current_chapter, reached_chapters: r.reached_chapters as number[] }
}

export type StartChapterResult =
  | {
      ok: true
      /** 시작한 뒤의 챕터. 이미 챕터가 있던 유저는 그 챕터 */
      currentChapter: number
      /** 이번 호출로 오른 챕터 번호 목록(챕터 1 포함). 이미 챕터가 있었으면 빈 목록 */
      reachedChapters: number[]
    }
  | { ok: false }

async function recordStartFailure(userId: string, error: string): Promise<void> {
  try {
    console.error(`[chapter-start] 챕터 1 시작 실패 — userId: ${userId}: ${error}`)
    await logEngineDecision('points', 'chapter_start_failed', userId, { error })
  } catch (e) {
    // logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    console.error('[chapter-start] 실패 기록 중 예외:', e)
  }
}

/** 챕터 1을 시작한다. 던지지 않는다 — 실패하면 기록만 남기고 `{ ok: false }`다. */
export async function startChapter(supabase: SupabaseClient, userId: string): Promise<StartChapterResult> {
  try {
    const { data, error } = await supabase.rpc('chapter_start', { p_user_id: userId })
    if (error) {
      await recordStartFailure(userId, `chapter_start RPC 오류: ${error.message ?? String(error)}`)
      return { ok: false }
    }
    // 시작한 뒤에는 챕터가 비어 있을 수 없다
    const row = toStartRow(data)
    if (!row || row.current_chapter === null) {
      await recordStartFailure(userId, 'chapter_start가 해석할 수 없는 응답을 돌려줬다')
      return { ok: false }
    }

    const result: StartChapterResult = { ok: true, currentChapter: row.current_chapter, reachedChapters: row.reached_chapters }
    if (row.reached_chapters.length > 0) {
      try {
        await processChapterRise({ userId, reachedChapters: row.reached_chapters })
      } catch (e) {
        // processChapterRise는 스스로 던지지 않지만 시작 결과를 바꾸지 않는 것이 이 함수의 약속이다
        console.error(`[chapter-start] 오름 처리 예외 — userId: ${userId}:`, e)
      }
    }
    return result
  } catch (e) {
    await recordStartFailure(userId, `chapter_start 예외: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false }
  }
}

/**
 * 챕터가 비어 있을 때만 챕터 1을 시작한다(재시도 경로). 던지지 않는다.
 * 조회가 실패하면 시작하지 않고 기록만 남긴다 — 다음 호출이 다시 본다.
 */
export async function ensureChapterStarted(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    const { data, error } = await supabase.from('user_chapters').select('chapter_no').eq('user_id', userId).maybeSingle()
    if (error) {
      await recordStartFailure(userId, `user_chapters 조회 오류: ${error.message ?? String(error)}`)
      return
    }
    // 행이 없거나 chapter_no가 NULL이면 챕터가 비어 있다(퀘스트 전 점수만 쌓인 유저도 NULL)
    if (typeof (data as { chapter_no?: unknown } | null)?.chapter_no === 'number') return
    await startChapter(supabase, userId)
  } catch (e) {
    await recordStartFailure(userId, `챕터 확인 예외: ${e instanceof Error ? e.message : String(e)}`)
  }
}
