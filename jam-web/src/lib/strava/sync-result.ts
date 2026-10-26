/**
 * 동기화 결과 화면 판정 — 이번 동기화로 받은 잼의 합계와 결과 갈래 (티켓 20261025_2050)
 *
 * `SyncButton`이 쓴다. 규칙
 *  - 응답의 `jamEarned`는 옛 응답에는 없다. 양의 유한 수만 내림해서 읽고(소수는 `Math.floor`), 없거나 0·NaN·음수·문자열이면 0으로 접는다.
 *  - 합계가 0이면 잼 줄 자체를 그리지 않는다(«받은 잼이 없어요»는 쓰지 않는다). 활동별 잼은 어느 갈래에도 그리지 않는다(운영 로직 4.3절).
 *  - 결과 갈래는 셋이다.
 *      reveal  받은 배지가 1개 이상 — 배지 연출 오버레이. 잼이 있으면 헤더에 한 줄(`summaryMessage`)을 얹는다.
 *      toast   배지 0개 — 잼이 있으면 «동기화 완료» 대신 잼 문구 토스트 한 줄(보류 고르기를 먼저 보여 준 뒤에도 같다).
 *              잼이 없고 고르기를 먼저 보여 주지 않았으면 기존 «동기화 완료» 토스트다. 토스트 뒤에는 화면을 새로 읽는다.
 *      refresh 배지 0개이고 잼이 없고 고르기를 먼저 보여 줬다 — 토스트 없이 화면만 새로 읽는다(기존 동작).
 *    `reveal`은 화면을 새로 읽는 일을 오버레이를 닫을 때로 미룬다.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. 문구 사전(`@/lib/i18n`)만 가져온다.
 */
import { d, t } from '@/lib/i18n'

/** 응답의 `jamEarned`를 화면에 쓸 값으로 접는다 — 양의 유한 수는 내림, 나머지는 0 */
export function foldJamEarned(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 잼 합계 한 줄. 합계가 0이면 줄 자체가 없으므로 `undefined`다 */
export function jamEarnedMessage(value: unknown): string | undefined {
  const jam = foldJamEarned(value)
  return jam > 0 ? t(d.today.syncJamEarned, { n: jam.toLocaleString('ko-KR') }) : undefined
}

export type SyncResultView =
  /** 배지 연출. `summaryMessage`가 있으면 헤더에 한 줄을 얹는다. 화면 새로 읽기는 닫을 때 한다 */
  | { kind: 'reveal'; summaryMessage: string | undefined }
  /** 토스트 한 줄을 내고 화면을 새로 읽는다 */
  | { kind: 'toast'; message: string }
  /** 토스트 없이 화면만 새로 읽는다 */
  | { kind: 'refresh' }

interface Input {
  /** 응답에 실린 획득 배지 상세 개수(`earnedBadges.length`) — 연출 노출의 단일 기준 */
  badgeCount: number
  /** 응답에 새 보류가 있어 고르기를 결과보다 먼저 보여 줬는가 */
  pickedFirst: boolean
  /** 응답의 `jamEarned` 원값 */
  jamEarned: unknown
}

export function resolveSyncResult({ badgeCount, pickedFirst, jamEarned }: Input): SyncResultView {
  const jamMessage = jamEarnedMessage(jamEarned)
  if (badgeCount > 0) return { kind: 'reveal', summaryMessage: jamMessage }
  if (jamMessage) return { kind: 'toast', message: jamMessage }
  // 고르기를 이미 보여 줬으므로 완료 토스트 없이 화면만 새로 읽는다. 그렇지 않으면 무반응을 막으려고 기존 완료 토스트를 낸다.
  return pickedFirst ? { kind: 'refresh' } : { kind: 'toast', message: d.today.syncDone }
}
