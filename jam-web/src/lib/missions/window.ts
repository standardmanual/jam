/**
 * 미션 기간 경계 — 판정에 넘기는 활동을 고르는 순수 함수 (티켓 20261019_1312)
 *
 * 운영 로직 13.2절 «기간과 순위»: 지정한 기간 안에, 참가한 뒤에 한 활동만 반영한다.
 * 미리 보여 주는 미션에 시작 전에 참가했어도 시작 전 활동은 반영하지 않고, 끝난 뒤에 한 활동도 반영하지 않는다.
 *
 * - 하한: 참가 시각(`joinedAt`)과 미션 시작(`startsAt`) 가운데 늦은 시각 (그 시각 포함)
 * - 상한: 미션 종료(`endsAt`). `null`이면 상한이 없다(상시 미션). 그 시각까지 포함한다 —
 *   `isMissionActive`가 `ends_at >= 지금`을 활성으로 보는 것과 같은 방향이다
 *
 * 비교는 문자열이 아니라 시각(밀리초)으로 한다. 활동 시작(`startDate`)은 `...Z`, DB의 `timestamptz`는
 * `...+00:00`처럼 표기가 달라 문자열로 비교하면 같은 시각이 어긋난다.
 *
 * 순수 모듈이다 — DB·서버 의존이 없다. 체크인·아이템 수집처럼 보유 현황으로 판정하는 유형은 활동 배열을
 * 쓰지 않으므로 이 함수를 거치지 않는다(`checker.ts`).
 */
import type { NormalizedActivity } from '@/types/strava'

export interface MissionWindow {
  /** 참가 시각(`user_mission_participations.joined_at`). 알 수 없으면 undefined */
  joinedAt?: string | null
  /** 미션 시작(`missions.starts_at`) */
  startsAt: string
  /** 미션 종료(`missions.ends_at`). null이면 상시 미션 */
  endsAt: string | null
}

/** 시각 문자열 → 밀리초. 해석할 수 없으면 null */
function toMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** 기간 안의 활동만 남긴다. 하한·상한이 해석되지 않으면 그 쪽은 걸러내지 않는다(가입 이력을 통째로 버리지 않는다) */
export function activitiesWithinMissionWindow(
  activities: NormalizedActivity[],
  window: MissionWindow
): NormalizedActivity[] {
  const joined = toMs(window.joinedAt)
  const started = toMs(window.startsAt)
  const ended = toMs(window.endsAt)

  const lowerBounds = [joined, started].filter((ms): ms is number => ms !== null)
  const lower = lowerBounds.length > 0 ? Math.max(...lowerBounds) : null

  return activities.filter((a) => {
    const at = Date.parse(a.startDate)
    if (Number.isNaN(at)) return false
    if (lower !== null && at < lower) return false
    if (ended !== null && at > ended) return false
    return true
  })
}
