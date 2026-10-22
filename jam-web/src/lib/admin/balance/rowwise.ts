/**
 * 밸런스 설정 구역이 여러 표(행)를 한 번에 저장할 때 쓰는 공용 모듈 (티켓 20261022_1133 1회, 7-1 `capsule.ts`가 선례)
 *
 * 공용 저장(`saveBalanceSection`)은 구역마다 «값 묶음 하나 + 수정 시각 하나»를 가정하고 갱신을 `binding.write` 한 번으로 맡긴다.
 * 구역이 표를 둘 이상 읽으면(컬렉션: 등급별 기본 포인트 4행 + 믹스 정책 1행, 챕터: 챕터 10행 + 활동 12행) 한 번의 조건부 갱신으로 끝나지 않는다. 이 모듈이 그 사이를 메운다.
 * - 구역의 수정 시각(`updatedAt`)은 **구역이 읽는 모든 행의 `updated_at` 가운데 가장 늦은 것**이다(`latestStamp`). 어느 행이든 저장하면 이 값이 올라가
 *   화면이 읽은 뒤 누가 바꿨는지 구역 단위로 가려진다.
 * - 행마다 «읽은 수정 시각이 같을 때만» 갱신한다(`RowOp.apply`). 읽은 뒤 다른 곳이 그 행을 바꾸면 0행이 되어 conflict다.
 * - 중간에 막히면(0행, DB 오류, 던짐) **이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린 뒤** 결과를 돌려준다(`RowOp.undo`, 나중에 쓴 행부터).
 *   되돌리기까지 실패하면 로그에 남기고 error로 답한다.
 *
 * 표마다 칼럼과 키가 다르므로 갱신과 되돌림은 **각 구역이 자기 표에 맞는 함수로 만들어 넘긴다**. 이 모듈은 순서와 되돌림만 맡고 DB를 직접 다루지 않는다.
 * 구역이 직접 하는 일: ① 화면이 본 수정 시각이 지금 읽은 행들의 `latestStamp`와 같은지 확인(다르면 conflict) ② `RowOp` 목록 만들기
 * ③ 성공하면 `latestStamp([...쓴 행의 새 수정 시각, ...쓰지 않은 행의 수정 시각])`를 구역의 새 수정 시각으로 돌려주기.
 */
import type { BalanceWriteResult } from './types'

const LOG = '[admin/balance]'

/** 수정 시각 가운데 가장 늦은 것(밀리초로 견주고, 같으면 먼저 나온 글자). 읽을 수 없는 글자가 있거나 비어 있으면 던진다. */
export function latestStamp(stamps: readonly string[]): string {
  let best: string | null = null
  let bestTime = Number.NEGATIVE_INFINITY
  for (const stamp of stamps) {
    const time = Date.parse(stamp)
    if (Number.isNaN(time)) throw new Error(`수정 시각을 읽을 수 없음: ${stamp}`)
    if (time > bestTime) {
      best = stamp
      bestTime = time
    }
  }
  if (best === null) throw new Error('수정 시각이 없음')
  return best
}

export type RowFailure = Exclude<BalanceWriteResult, { ok: true }>

/** 행 하나를 갱신한 결과. 성공하면 갱신된 행의 수정 시각이다. */
export type RowOutcome = { ok: true; stamp: string } | RowFailure

export interface RowOp {
  /** 로그·오류 문장에 쓰는 행 이름(예: `default_reward:epic`). */
  label: string
  /** 이 행을 새 값으로 갱신한다. **읽은 수정 시각이 같을 때만** 갱신하고, 0행이면 conflict로 답한다. */
  apply: () => Promise<RowOutcome>
  /** 방금 쓴 이 행을 이전 값과 이전 수정 시각으로 되돌린다. **`appliedStamp`(방금 쓴 수정 시각)가 같을 때만** 되돌리고, 되돌렸으면 `true`. */
  undo: (appliedStamp: string) => Promise<boolean>
}

export type RunRowOpsResult = { ok: true; stamps: string[] } | RowFailure

/** 조건부 갱신(`.update().eq(...).select('updated_at')`)의 응답을 행 결과로 바꾼다. 오류는 error, 0행은 conflict. */
export function toRowOutcome(res: {
  data: ReadonlyArray<{ updated_at: string }> | null
  error: { message: string } | null
}): RowOutcome {
  if (res.error) return { ok: false, reason: 'error', message: res.error.message }
  const row = res.data?.[0]
  if (!row) return { ok: false, reason: 'conflict' }
  return { ok: true, stamp: row.updated_at }
}

/** 되돌리기 갱신의 응답이 «한 행이 바뀌었다»인지. */
export function didUndo(res: { data: ReadonlyArray<unknown> | null; error: { message: string } | null }): boolean {
  return !res.error && (res.data?.length ?? 0) > 0
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 행 갱신을 차례로 한다. 모두 성공하면 쓴 행의 새 수정 시각을 `ops` 순서대로 돌려준다.
 * 하나가 막히면 이미 쓴 행을 되돌린다(나중에 쓴 행부터). 되돌리지 못한 행이 있으면 로그를 남기고 error로 답한다(원래 사유 뒤에 «(되돌리기 실패)»).
 * `apply`나 `undo`가 던져도 같은 방식으로 처리한다(던진 행은 쓰이지 않은 것으로 본다).
 */
export async function runRowOps(section: string, ops: readonly RowOp[]): Promise<RunRowOpsResult> {
  const applied: Array<{ op: RowOp; stamp: string }> = []

  async function abort(failure: RowFailure): Promise<RowFailure> {
    if (applied.length === 0) return failure
    let allUndone = true
    for (const { op, stamp } of [...applied].reverse()) {
      try {
        if (!(await op.undo(stamp))) allUndone = false
      } catch {
        allUndone = false
      }
    }
    if (allUndone) return failure
    console.error(
      `${LOG} ${section} 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다 — 일부 행만 바뀌어 있을 수 있다:`,
      JSON.stringify(applied.map(({ op, stamp }) => ({ label: op.label, stamp })))
    )
    return { ok: false, reason: 'error', message: `${failure.reason === 'error' ? failure.message : '다른 곳이 먼저 바꿈'} (되돌리기 실패)` }
  }

  for (const op of ops) {
    let outcome: RowOutcome
    try {
      outcome = await op.apply()
    } catch (e) {
      outcome = { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (!outcome.ok) return abort(outcome)
    applied.push({ op, stamp: outcome.stamp })
  }
  return { ok: true, stamps: applied.map(({ stamp }) => stamp) }
}
