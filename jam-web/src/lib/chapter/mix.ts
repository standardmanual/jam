/**
 * 챕터 점수 «믹스 성공» (티켓 20261019_1315 3회, 운영 로직 12.2절)
 *
 * 믹스가 성공하면 성공 기록(`user_combine_success_logs`)을 남기는 DB 함수 `record_combine_success_with_id`(마이그레이션 254)가 방금 넣은 행의 id를
 * 돌려준다. 그 id가 이 점수의 원천 id다 — 믹스 한 번에 성공 행이 하나라 같은 성공을 다시 보내도 같은 키다.
 *
 * 응답은 `{ id: uuid, is_recipe_first: boolean }` 모양이어야 한다. 이 모양이 아니면(id가 UUID 문자열이 아니거나 `is_recipe_first`가 boolean이 아님)
 * 점수를 세지 않고 기록만 남긴다 — 계약 밖 id를 원천 id로 쓰면 다른 일과 키가 겹칠 수 있다. 기록 RPC 자체가 오류를 낸 경우도 같다(`recordMixScoreFailure`).
 *
 * 시험 믹스(`testMix`)는 성공 기록을 남기지 않으므로 이 함수가 불리지 않는다. 빈손 성공(결과 배지가 비어도 성공)은 성공 행이 있으니 센다.
 *
 * **절대 던지지 않는다.** 점수 쪽이 어떻게 되든 믹스 응답·재료 소각·보상 지급·후속 처리는 그대로다.
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/admin/uuid'
import { recordChapterScoreFailure } from './failure'
import { awardChapterScore } from './score'

export interface MixSuccessRecord {
  id: string
  isRecipeFirst: boolean
}

/** `record_combine_success_with_id`의 응답을 계약대로 읽는다. 알려진 모양이 아니면 null */
export function parseMixSuccessRecord(data: unknown): MixSuccessRecord | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' || !isUuid(row.id)) return null
  if (typeof row.is_recipe_first !== 'boolean') return null
  return { id: row.id, isRecipeFirst: row.is_recipe_first }
}

/** 성공 기록 RPC가 오류를 냈거나 응답이 계약 밖이어서 점수를 세지 못했음을 남긴다(sourceId는 알 수 없어 null). 던지지 않는다. */
export async function recordMixScoreFailure(userId: string, error: string): Promise<void> {
  await recordChapterScoreFailure({ userId, kind: 'mix_success', sourceId: null, error })
}

/**
 * 성공 기록 RPC의 응답(`data`)으로 «믹스 성공» 점수를 센다. 응답이 계약 밖이면 세지 않고 기록한다. 던지지 않는다.
 * 호출부는 RPC가 오류 없이 돌아온 경우에만 부른다(오류는 `recordMixScoreFailure`).
 */
export async function awardMixSuccessScore(supabase: SupabaseClient, userId: string, data: unknown): Promise<void> {
  try {
    const record = parseMixSuccessRecord(data)
    if (!record) {
      await recordMixScoreFailure(userId, 'record_combine_success_with_id가 알려진 모양이 아닌 응답을 돌려줬다 (id가 UUID 문자열, is_recipe_first가 boolean이어야 한다)')
      return
    }
    await awardChapterScore(supabase, { userId, kind: 'mix_success', sourceId: record.id })
  } catch (e) {
    // 위 호출은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    await recordMixScoreFailure(userId, `믹스 성공 점수 처리 예외: ${e instanceof Error ? e.message : String(e)}`)
  }
}
