/**
 * 챕터 점수를 «세지 못한 채» 남기는 기록 (티켓 20261019_1315 3회)
 *
 * 믹스·컬렉션은 서비스 활동 잼 지급을 부르기 **전에** 원천 id를 알 수 없는 경우가 있다
 * (믹스 성공 기록 RPC가 오류를 내거나 계약 밖 응답을 돌려줌, 컬렉션 완성 여부를 읽지 못함). 그때는 지급하지 않고 이 함수로 기록만 남긴다
 * (`console.error` + `engine_decision_log`의 `points` 엔진, 이벤트 `chapter_score_failed`). `sourceId`를 모르면 null이다.
 *
 * 던지지 않는다 — 기록하다 본 동작을 바꾸면 안 된다.
 *
 * 서버 전용이다.
 */
import { logEngineDecision } from '@/lib/engine-log'
import type { ChapterCollectionKind } from './kinds'

/** 이 기록을 남기는 두 곳(믹스 성공, 컬렉션 완성)의 종류 */
export type ChapterScoreFailureKind = 'mix_success' | ChapterCollectionKind

export interface ChapterScoreFailure {
  userId: string
  kind: ChapterScoreFailureKind
  /** 알 수 없으면 null(원천 id를 만들기 전의 실패) */
  sourceId: string | null
  /** 사람이 읽는 원인 */
  error: string
}

export async function recordChapterScoreFailure(failure: ChapterScoreFailure): Promise<void> {
  try {
    console.error(
      `[chapter-score] 점수 미반영 — userId: ${failure.userId}, kind: ${failure.kind}, sourceId: ${failure.sourceId ?? '미정'}: ${failure.error}`
    )
    await logEngineDecision('points', 'chapter_score_failed', failure.userId, {
      kind: failure.kind,
      sourceId: failure.sourceId,
      amount: 1,
      occurredOn: null,
      error: failure.error,
    })
  } catch (e) {
    // logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    console.error('[chapter-score] 실패 기록 중 예외:', e)
  }
}
