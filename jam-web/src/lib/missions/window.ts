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
 *
 * DB 기록으로 세는 조건(믹스·드랍·캡슐 등, 티켓 20261019_1445)은 활동 배열이 아니라 DB 행의 시각을 거르므로
 * 같은 경계를 `missionWindowIsoBounds`로 ISO 시각 문자열로 돌려받아 쓴다 — 활동 선택과 같은 계산을 공유한다.
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

/** 기간 경계를 밀리초로 — 하한(참가·시작 가운데 늦은 시각)과 상한(종료). 해석되지 않는 쪽은 null */
function missionWindowBoundsMs(window: MissionWindow): { lower: number | null; upper: number | null } {
  const joined = toMs(window.joinedAt)
  const started = toMs(window.startsAt)
  const ended = toMs(window.endsAt)

  const lowerBounds = [joined, started].filter((ms): ms is number => ms !== null)
  const lower = lowerBounds.length > 0 ? Math.max(...lowerBounds) : null
  return { lower, upper: ended }
}

/**
 * 기간 경계를 ISO 시각 문자열로 — DB 지표를 «참가한 뒤, 기간 안»으로 거를 때 쓴다(티켓 20261019_1445).
 * 활동 선택(`activitiesWithinMissionWindow`)과 같은 경계 계산을 쓰므로 두 판정이 서로 다른 기간을 보지 않는다.
 * 하한·상한 모두 포함이다. 해석되지 않는 쪽은 null — 하한이 null이면 호출자가 «기간을 정할 수 없음»으로 다뤄야 한다
 * (활동 선택은 하한이 없어도 가입 이력을 버리지 않지만, DB 지표는 하한이 없으면 평생값이 섞인다).
 */
export function missionWindowIsoBounds(window: MissionWindow): { fromIso: string | null; toIso: string | null } {
  const { lower, upper } = missionWindowBoundsMs(window)
  return {
    fromIso: lower === null ? null : new Date(lower).toISOString(),
    toIso: upper === null ? null : new Date(upper).toISOString(),
  }
}

/** 기간 안의 활동만 남긴다. 하한·상한이 해석되지 않으면 그 쪽은 걸러내지 않는다(가입 이력을 통째로 버리지 않는다) */
export function activitiesWithinMissionWindow(
  activities: NormalizedActivity[],
  window: MissionWindow
): NormalizedActivity[] {
  const { lower, upper } = missionWindowBoundsMs(window)

  return activities.filter((a) => {
    const at = Date.parse(a.startDate)
    if (Number.isNaN(at)) return false
    if (lower !== null && at < lower) return false
    if (upper !== null && at > upper) return false
    return true
  })
}
