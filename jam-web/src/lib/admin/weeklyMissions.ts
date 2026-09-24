/**
 * 어드민 메인 주간 캘린더의 미션 표시 배분(티켓 20260924_0907) — 미션 목록과 주의 월요일을
 * 받아 「기간 미션 막대 목록 · 상시 미션 개수 · 그 주에 시작하는 상시 미션 목록」을 만드는
 * 순수 함수만 담는다(DB·네트워크 접근 없음).
 *
 * 미션 표시 기준(2026-09-24 사용자 결정):
 * - 기간 미션(`ends_at`이 있는 미션)만 막대로 표시한다. 이 주와 겹치는 하루 겹침 판정은
 *   홈피드 카드와 같다(`kstDayBoundsIso`의 `startIso`·`endIso`로
 *   `starts_at <= endIso` 그리고 `ends_at >= startIso`, `weeklyCards.ts` 참고).
 * - 상시 미션(`ends_at`이 없는 미션)은 막대로 만들지 않는다. 그 주 일요일 끝까지 시작한
 *   상시 미션 수만 세고(`openEndedCount`), 그중 그 주에 새로 시작하는 미션만 시작 요일과
 *   함께 별도 목록(`openEndedStarting`)으로 돌려준다 — 상시 미션 53개가 매주 그대로
 *   나열되는 것을 막기 위해서다.
 * - 기간 미션 막대가 주 밖으로 넘치면 0(월)·6(일)로 자르고, 잘리지 않은 쪽에만
 *   "시작"·"종료" 표식을 붙인다(`startsThisWeek`·`endsThisWeek`).
 */
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from './today-calendar'
import { isGateMission } from '@/lib/missions/gateMissions'
import type { MissionRow } from '@/types/database'

/** weeklyMissions()에 필요한 컬럼만 추린 입력 타입(전체 컬럼 조회 방지) */
export type WeeklyMissionInput = Pick<MissionRow, 'id' | 'title' | 'starts_at' | 'ends_at' | 'gate_axis'>

export interface WeeklyMissionBar {
  id: string
  title: string
  /** 열 위치 0(월) ~ 6(일). 주 밖으로 넘치는 쪽은 0 또는 6으로 자른다 */
  startCol: number
  endCol: number
  /** true면 이 주 안에서 시작한다("시작" 표식) */
  startsThisWeek: boolean
  /** true면 이 주 안에서 끝난다("종료" 표식) */
  endsThisWeek: boolean
  /** 게이트 미션(`gate_axis` 있음) 여부 */
  isGate: boolean
}

export interface WeeklyOpenEndedStartingMission {
  id: string
  title: string
  /** 'YYYY-MM-DD'(KST) — 시작일 */
  date: string
}

export interface WeeklyMissionsResult {
  bars: WeeklyMissionBar[]
  /** ends_at이 없고 그 주 일요일 끝까지 시작한 미션 수(아직 시작 전인 미션은 제외) */
  openEndedCount: number
  /** 상시 미션 중 그 주에 새로 시작하는 미션만 */
  openEndedStarting: WeeklyOpenEndedStartingMission[]
}

/**
 * `weekStartMs`(그 주 월요일 KST 00:00:00.000의 UTC epoch ms) 기준으로 `targetMs`가 몇 번째
 * 요일(0=월 ~ 6=일)에 해당하는지 계산한다. KST는 서머타임이 없어 하루가 항상 정확히
 * 86400000ms이므로 나눗셈만으로 정확하다(`today-calendar.ts`와 같은 근거). 범위 밖 값은
 * 0·6으로 자른다(호출부에서 이미 주 안임을 확인했을 때만 쓴다).
 */
function dayOffsetInWeek(weekStartMs: number, targetMs: number): number {
  const diffDays = Math.floor((targetMs - weekStartMs) / (24 * 60 * 60 * 1000))
  return Math.min(6, Math.max(0, diffDays))
}

/** 미션 목록과 주의 월요일('YYYY-MM-DD')을 받아 막대·상시 미션 개수·그 주 시작 상시 미션을 만든다 */
export function weeklyMissions(missions: readonly WeeklyMissionInput[], weekStart: string): WeeklyMissionsResult {
  const weekEnd = shiftDateStr(weekStart, 6)
  const { startIso: weekStartIso } = kstDayBoundsIso(weekStart)
  const { endIso: weekEndIso } = kstDayBoundsIso(weekEnd)
  const weekStartMs = new Date(weekStartIso).getTime()
  const weekEndMs = new Date(weekEndIso).getTime()

  const bars: WeeklyMissionBar[] = []
  const openEndedStarting: WeeklyOpenEndedStartingMission[] = []
  let openEndedCount = 0

  for (const mission of missions) {
    const startMs = new Date(mission.starts_at).getTime()

    if (mission.ends_at == null) {
      // 상시 미션 — 그 주 일요일 끝까지 시작하지 않았으면(아직 시작 전) 개수에 넣지 않는다.
      if (startMs > weekEndMs) continue
      openEndedCount++
      // 그중 이 주에 새로 시작하는 것만 시작 항목으로 돌려준다.
      if (startMs >= weekStartMs) {
        openEndedStarting.push({
          id: mission.id,
          title: mission.title,
          date: todayKstDateString(new Date(mission.starts_at)),
        })
      }
      continue
    }

    // 기간 미션 — 홈피드 카드와 같은 하루 겹침 판정(weeklyCards.ts의 overlapsDay와 동일 규칙)
    const endMs = new Date(mission.ends_at).getTime()
    if (!(startMs <= weekEndMs && endMs >= weekStartMs)) continue

    const startsThisWeek = startMs >= weekStartMs
    const endsThisWeek = endMs <= weekEndMs
    bars.push({
      id: mission.id,
      title: mission.title,
      startCol: startsThisWeek ? dayOffsetInWeek(weekStartMs, startMs) : 0,
      endCol: endsThisWeek ? dayOffsetInWeek(weekStartMs, endMs) : 6,
      startsThisWeek,
      endsThisWeek,
      isGate: isGateMission(mission),
    })
  }

  return { bars, openEndedCount, openEndedStarting }
}
