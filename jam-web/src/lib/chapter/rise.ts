/**
 * 챕터 오름 처리 (티켓 20261019_1316, 운영 로직 12.1~12.3절)
 *
 * 챕터가 오른 순간(`chapter_add_score`·`chapter_start`가 `reachedChapters`를 돌려줄 때) 할 일을 한 곳에 둔다.
 *  1) `reachedChapters`가 비어 있으면 아무것도 하지 않는다.
 *  2) 소식: 오른 챕터 가운데 **가장 높은 챕터**로 `chapter_up` 한 건만 보낸다. 한 번에 여러 챕터를 넘어도 한 건이다. 챕터 1을 받은 것(챕터 1만 오른 경우)도 보낸다 —
 *     챕터 1은 퀘스트 완료와 시점이 갈라져(실제 3단계를 마친 순간 시작하고, 완료 배지는 연출까지 끝난 뒤에 나가며 건너뛴 유저는 배지가 없다) 완료 보상이 알려 주지 못한다.
 *     그래서 챕터 1은 연출 카드를 띄우지 않고(`celebrate.ts`) 소식으로 알린다(티켓 20261021_1248 사용자 결정 4). 문구는 챕터 1이면 «챕터 1을 시작했어요»다.
 *     묶음 키는 `chapter_up:{챕터}` + `once`라 같은 (유저, 챕터) 소식은 다시 만들어지지 않는다.
 *     챕터는 내려가지 않으므로 같은 챕터가 다시 «가장 높은 챕터»가 되는 일은 재시도뿐이다.
 *  3) 챕터 배지 판정: 비어 있지 않으면(챕터 1 시작 포함) `runJamActionEvaluation(userId, ['chapter_reached'])`로 챕터 조건 배지를 바로 판정해 받게 한다.
 *     넘은 챕터가 여럿이어도 챕터 도달값은 지금 챕터 하나라서 `chapter_reached >= N` 조건 배지는 한 번의 판정으로 모두 받는다.
 *     `skipBadgeEvaluation`이 참이면 이 판정만 건너뛴다(아래 «이중 판정»).
 *
 * ## 이중 판정을 피하는 규칙
 * 동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)은 DB의 지금 챕터를 읽으므로, 동기화가 **직접** 부르는 점수(잼 정산)에서 난 오름은 그 판정이 이어서
 * 읽는다. 그 호출부만 `skipBadgeEvaluation`을 켠다(`lib/jam/settlement.ts`). 나머지는 모두 바로 판정한다 — 라우트(캡슐·잠긴 열기·믹스·드랍·픽업·컬렉션 장착),
 * 동기화 안의 배지 받기·미션 점수, 동기화 뒤에 도는 퀘스트 완료 처리(`chapter_start`). 켜지 않은 호출이 동기화 안에서 불려 판정이 겹쳐도 발급은
 * `user_activity_badges`의 `UNIQUE(user_id, badge_id)`(마이그레이션 001, 130이 유지)로 한 번뿐이다(`issueQualifyingBadges`가 이미 가진 배지는 건너뛰고, 동시 호출이
 * 같은 배지를 넣다 나는 23505는 부수효과 없이 넘긴다).
 * 겹쳐서 생기는 일은 판정이 한 번 더 도는 것과, 동기화 결과 카드 대신 결산 소식(`activity_recap`)으로 먼저 알려지는 것뿐이다. 챕터 오름은 평생 챕터 수(10)번 안쪽이라 비용이 작다.
 *
 * ## 서로 막지 않는다
 * 소식과 판정은 각자 `try/catch`로 감싼다. 판정이 실패해도 소식은 보내고, 소식이 실패해도 판정은 한다. **절대 던지지 않는다** — 실패는 `console.error`와
 * `engine_decision_log`(`points` 엔진, 이벤트 `chapter_rise_failed`, `step`으로 구분)에 남긴다. `runJamActionEvaluation`은 자기 안의 실패를 스스로 삼키고
 * `console.error`만 남기므로, 이 함수가 기록하는 판정 실패는 그 함수를 불러오거나 부르다 던진 경우다.
 *
 * ## 순환 import
 * `jamActionRoute`는 `strava/sync.ts`를 가져오고 `sync.ts`는 잼 정산 → `score.ts`로 이어지므로, 이 파일이 `jamActionRoute`를 정적으로 가져오면
 * `score.ts → rise.ts → jamActionRoute → sync.ts → settlement.ts → score.ts` 순환이 된다. 호출 시점에 `await import()`로 불러 모듈 평가 시점의 순환을 없앤다.
 *
 * 챕터 배지가 다시 챕터 점수를 올리는 고리는 막혀 있다: `chapter_reached` 조건 배지는 «배지 받기» 점수에서 뺀다(`badgeReceive.ts`의 `BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS`).
 *
 * 서버 전용이다.
 */
import { logEngineDecision } from '@/lib/engine-log'
import { createNotification, scopedGroupKey } from '@/lib/notifications'

export interface ChapterRiseInput {
  userId: string
  /** `chapter_add_score`·`chapter_start`가 돌려준 «이번 호출로 오른 챕터 번호 목록» */
  reachedChapters: readonly number[]
}

export interface ChapterRiseOptions {
  /** 참이면 챕터 배지 판정을 건너뛴다. 호출한 동기화의 끝 판정이 이어서 읽는 경우에만 켠다 */
  skipBadgeEvaluation?: boolean
}

type ChapterRiseFailureStep = 'notification' | 'badge_evaluation' | 'unexpected'

function isChapterNo(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function recordRiseFailure(
  userId: string,
  step: ChapterRiseFailureStep,
  reachedChapters: readonly number[],
  error: string
): Promise<void> {
  try {
    console.error(
      `[chapter-rise] 오름 처리 실패 — userId: ${userId}, step: ${step}, reachedChapters: [${reachedChapters.join(',')}]: ${error}`
    )
    await logEngineDecision('points', 'chapter_rise_failed', userId, {
      step,
      reachedChapters: [...reachedChapters],
      error,
    })
  } catch (e) {
    // logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    console.error('[chapter-rise] 실패 기록 중 예외:', e)
  }
}

/** 가장 높은 챕터로 소식 한 건. `createNotification`은 던지지 않고 실패하면 null이다(`once`는 이미 있으면 기존 행을 돌려주므로 null은 실패다) */
async function sendRiseNotification(userId: string, highest: number, reachedChapters: readonly number[]): Promise<void> {
  try {
    const row = await createNotification({
      userId,
      type: 'chapter_up',
      payload: { chapter_no: highest },
      groupKey: scopedGroupKey('chapter_up', highest),
      mode: 'once',
    })
    if (row === null) {
      await recordRiseFailure(userId, 'notification', reachedChapters, 'chapter_up 소식을 만들지 못했다(createNotification이 null을 돌려줬다)')
    }
  } catch (e) {
    await recordRiseFailure(userId, 'notification', reachedChapters, `소식 생성 예외: ${errorText(e)}`)
  }
}

async function evaluateChapterBadges(userId: string, reachedChapters: readonly number[]): Promise<void> {
  try {
    // 정적 import는 `score.ts`와 순환이 된다(파일 머리말 «순환 import»)
    const { runJamActionEvaluation } = await import('@/lib/badge-engine/jamActionRoute')
    await runJamActionEvaluation(userId, ['chapter_reached'])
  } catch (e) {
    await recordRiseFailure(userId, 'badge_evaluation', reachedChapters, `챕터 배지 판정 예외: ${errorText(e)}`)
  }
}

/** 챕터 오름을 처리한다(소식과 챕터 배지 판정). 던지지 않는다. */
export async function processChapterRise(input: ChapterRiseInput, options: ChapterRiseOptions = {}): Promise<void> {
  try {
    const reachedChapters = input.reachedChapters.filter(isChapterNo)
    if (reachedChapters.length === 0) return

    const highest = Math.max(...reachedChapters)
    // 챕터 1 시작도 소식으로 알린다(티켓 20261021_1248). 완료 보상은 시점이 갈라지고 건너뛴 유저는 받지 않아 알림 구실을 하지 못한다
    await sendRiseNotification(input.userId, highest, reachedChapters)
    if (options.skipBadgeEvaluation !== true) await evaluateChapterBadges(input.userId, reachedChapters)
  } catch (e) {
    await recordRiseFailure(input.userId, 'unexpected', input.reachedChapters, errorText(e))
  }
}
