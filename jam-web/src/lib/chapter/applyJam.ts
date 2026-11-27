/**
 * 챕터 진행값 적립 래퍼 — `applyChapterJam` (티켓 20261127_1727, 상위 20261127_1720)
 *
 * DB 함수 `chapter_jam_apply`(마이그레이션 365)를 부른다. B4 이중 쓰기 단계라서 호출부는 모두 `promote: false`로 부른다 —
 * 진행값(`user_chapters.chapter_jam`)만 쌓고 챕터 승급은 옛 방식(캡슐)이 한다. C2a에서 `promote`를 `true`로 전환한다.
 * 새 함수가 승급하면 챕터가 이중으로 오르므로, 그 전까지 `true`를 넘기는 호출부를 만들지 않는다.
 *
 * 같은 `eventKey`는 DB(`chapter_jam_events`)가 한 번만 센다. 그래서 같은 일을 다시 보내도 안전하다.
 *
 * 응답 해석 (DB 계약, 365)
 *  - `{ ok: false, error: 'no_chapter' | 'user_suspended' }` — 챕터를 시작하지 않은 옛 유저, 이용 정지. 정상이라 기록 없이 `skipped`로 돌려준다
 *    (이관 C1이 원장 기준으로 진행값을 다시 계산한다)
 *  - `{ ok: false, error: 'invalid_input' | 그 밖 }` — 기록한다(`chapter_jam_apply_failed`)
 *  - `{ ok: true, duplicate: true, applied: 0 }` — 같은 키 재전송. 기록 없음
 *  - `{ ok: true, duplicate: false, applied }` — 적립. `applied`가 보낸 양과 다르면 `chapter_jam_mismatch`로 기록한다(결과는 `ok: true`)
 *
 * **절대 던지지 않는다.** RPC 오류·해석 못 할 응답·예외는 `console.error`와 `engine_decision_log`(`points` 엔진)에 남기고 `{ ok: false }`를 돌려준다.
 * 옛 흐름(정산·서비스 활동 잼 지급)을 막지 않기 위해서다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEngineDecision } from '@/lib/engine-log'

export interface ApplyChapterJamInput {
  userId: string
  /** 쌓을 잼. 1 이상의 정수 */
  amount: number
  /** 멱등 키. 같은 (userId, eventKey)는 DB가 한 번만 센다 */
  eventKey: string
  /** `true`면 쌓은 뒤 승급한다. B4의 호출부는 모두 `false`다(C2a가 `true`로 바꾼다) */
  promote: boolean
}

export type ApplyChapterJamResult =
  | {
      ok: true
      /** 같은 키의 재전송이다(새로 쌓지 않았다) */
      duplicate: boolean
      /** 챕터가 없거나 이용 정지라 쌓지 않고 건너뛰었다(정상) */
      skipped: 'no_chapter' | 'user_suspended' | null
      /** 이번에 쌓인 양 */
      applied: number
      chapterNo: number | null
      chapterJam: number | null
      reachedChapters: number[]
    }
  | { ok: false }

type IssueKind = 'chapter_jam_apply_failed' | 'chapter_jam_mismatch'

/** 어긋남·실패를 남긴다(`console.error` + `engine_decision_log`). 던지지 않는다 */
async function recordChapterJamIssue(
  userId: string,
  kind: IssueKind,
  eventKey: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    console.error(`[chapter-jam] ${kind} — userId: ${userId}, eventKey: ${eventKey}:`, detail)
    await logEngineDecision('points', kind, userId, { eventKey, ...detail })
  } catch (e) {
    // logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    console.error('[chapter-jam] 기록 중 예외:', e)
  }
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []
}

/** 챕터 진행값을 쌓는다. 던지지 않는다 — 실패하면 기록만 남기고 `{ ok: false }`다. */
export async function applyChapterJam(supabase: SupabaseClient, input: ApplyChapterJamInput): Promise<ApplyChapterJamResult> {
  const { userId, amount, eventKey, promote } = input
  try {
    if (!Number.isInteger(amount) || amount < 1 || typeof eventKey !== 'string' || eventKey.trim() === '') {
      await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', String(eventKey), { amount, error: '입력이 맞지 않아 호출하지 않았다' })
      return { ok: false }
    }

    const { data, error } = await supabase.rpc('chapter_jam_apply', {
      p_user_id: userId,
      p_amount: amount,
      p_event_key: eventKey,
      p_promote: promote,
    })
    if (error) {
      await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', eventKey, {
        amount,
        error: `chapter_jam_apply RPC 오류: ${error.message ?? String(error)}`,
      })
      return { ok: false }
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', eventKey, { amount, error: 'chapter_jam_apply가 해석할 수 없는 응답을 돌려줬다' })
      return { ok: false }
    }
    const r = data as Record<string, unknown>
    if (typeof r.ok !== 'boolean') {
      await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', eventKey, { amount, error: 'chapter_jam_apply가 해석할 수 없는 응답을 돌려줬다' })
      return { ok: false }
    }

    if (r.ok === false) {
      if (r.error === 'no_chapter' || r.error === 'user_suspended') {
        return { ok: true, duplicate: false, skipped: r.error, applied: 0, chapterNo: null, chapterJam: null, reachedChapters: [] }
      }
      await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', eventKey, { amount, error: `chapter_jam_apply가 거절했다: ${String(r.error)}` })
      return { ok: false }
    }

    const duplicate = r.duplicate === true
    const applied = asNumberOrNull(r.applied) ?? 0
    if (!duplicate && applied !== amount) {
      await recordChapterJamIssue(userId, 'chapter_jam_mismatch', eventKey, { amount, applied })
    }
    return {
      ok: true,
      duplicate,
      skipped: null,
      applied,
      chapterNo: asNumberOrNull(r.chapterNo),
      chapterJam: asNumberOrNull(r.chapterJam),
      reachedChapters: asNumberArray(r.reachedChapters),
    }
  } catch (e) {
    await recordChapterJamIssue(userId, 'chapter_jam_apply_failed', String(eventKey), {
      amount,
      error: `챕터 진행값 적립 예외: ${e instanceof Error ? e.message : String(e)}`,
    })
    return { ok: false }
  }
}
