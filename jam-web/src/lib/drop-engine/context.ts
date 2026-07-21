/**
 * 드랍엔진 v2 — 맥락 오버라이드 매칭 (Step D)
 *
 * 활동의 실제 맥락(온도·시간대·고도·복귀)이 세계관과 정합하면 해당 세계관 드랍을 강제해
 * 보상을 '성취의 증거'(informational reward)로 만든다.
 * 강수(비·태풍) 조건은 외부 날씨 API 도입 전까지 범위 제외.
 *
 * 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3.4
 */
import type { NormalizedActivity } from '@/types/strava'
import { MYSTERY_FACTION_ID, RESOLUTION_FACTION_ID } from './constants'

// 019_seed_worldview.sql 고정 UUID
const RANGER = '7a91727e-e2e1-b7f7-45f0-899ce04716bd' // 아스팔트 레인저
const GOURMET = 'defa02b9-c4b6-af0d-dc99-c43c278a78d8' // 낭만 미식가
const GANG = '73f0f601-2382-900c-8ca2-5cc7c93ed95d' // 숲속의 갱단
const BEAT = 'e33307bb-5191-5ad5-58e0-053b40cb09f0' // 비트 마에스트로
const SHUTTER = '672acbec-74d3-f36c-28e9-42563dda8e13' // 셔터 마피아

// 임계값 (엔진 상수 — 세밀 튜닝이 필요해지면 drop_policy로 승격)
const COLD_MAX_C = -10
const HOT_MIN_C = 33
const HIGH_ELEVATION_M = 500
const RUNNERS_HIGH_MIN_SEC = 90 * 60

export interface ContextMatch {
  factionIds: string[]
  /** 복귀 오버라이드는 발동률 없이 항상 적용 (최우선) */
  always: boolean
  reason: string
}

/**
 * 활동 맥락 → 오버라이드 세계관. 우선순위: 복귀 > 온도 > 시간대 > 고도 > 러너스 하이.
 * 매칭 없으면 null.
 */
export function matchContextFactions(
  activity: NormalizedActivity | null,
  isComeback: boolean
): ContextMatch | null {
  // 1. 복귀 (최우선, 발동률 무시) — "결계 섬데이 돌파"
  if (isComeback) {
    return { factionIds: [RESOLUTION_FACTION_ID], always: true, reason: 'comeback' }
  }
  if (!activity) return null

  // 2. 극한 온도 (Strava average_temp)
  const temp = activity.weatherTempC
  if (temp !== null && temp !== undefined && (temp <= COLD_MAX_C || temp >= HOT_MIN_C)) {
    return { factionIds: [RANGER], always: false, reason: temp <= COLD_MAX_C ? 'cold' : 'hot' }
  }

  // 3. 시간대 (startDateLocal 우선, 없으면 startDate)
  const local = activity.startDateLocal ?? activity.startDate
  const hour = parseInt(local.slice(11, 13), 10)
  if (!Number.isNaN(hour)) {
    if (hour >= 5 && hour < 7) {
      return { factionIds: [BEAT, SHUTTER], always: false, reason: 'dawn' }
    }
    if (hour >= 23 || hour < 4) {
      return { factionIds: [GOURMET, GANG], always: false, reason: 'late_night' }
    }
  }

  // 4. 고고도 상승
  if (activity.elevationGainM >= HIGH_ELEVATION_M) {
    return { factionIds: [GOURMET, BEAT], always: false, reason: 'high_elevation' }
  }

  // 5. 러너스 하이 (고강도 장시간) — 미스터리 헌터, rare+ 한정 (pickFaction에서 rarity 게이트)
  if (activity.movingTimeSec >= RUNNERS_HIGH_MIN_SEC) {
    return { factionIds: [MYSTERY_FACTION_ID], always: false, reason: 'runners_high' }
  }

  return null
}
