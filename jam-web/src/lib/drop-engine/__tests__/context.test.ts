/**
 * 맥락 오버라이드 매칭 테스트 (드랍엔진 v2 Step D)
 */
import { matchContextFactions } from '../context'
import { MYSTERY_FACTION_ID, RESOLUTION_FACTION_ID } from '../constants'
import type { NormalizedActivity } from '@/types/strava'

const base: NormalizedActivity = {
  stravaId: 1,
  name: 'test',
  distanceKm: 5,
  movingTimeSec: 1800,
  elevationGainM: 50,
  jamActivityType: 'running',
  startDate: '2026-07-21T10:00:00Z',
  startDateLocal: '2026-07-21T19:00:00Z',
  averageSpeedKmh: 10,
  startLatLng: null,
  endLatLng: null,
  weatherTempC: 20,
}

describe('matchContextFactions', () => {
  it('복귀는 활동 정보와 무관하게 작심삼일 클럽, always=true', () => {
    const m = matchContextFactions(base, true)
    expect(m?.factionIds).toEqual([RESOLUTION_FACTION_ID])
    expect(m?.always).toBe(true)
  })

  it('극한 온도(-10°C 이하 / 33°C 이상)는 아스팔트 레인저', () => {
    expect(matchContextFactions({ ...base, weatherTempC: -12 }, false)?.reason).toBe('cold')
    expect(matchContextFactions({ ...base, weatherTempC: 35 }, false)?.reason).toBe('hot')
    expect(matchContextFactions({ ...base, weatherTempC: 20 }, false)).toBeNull()
  })

  it('새벽(05~07시 local)은 비트 마에스트로/셔터 마피아', () => {
    const m = matchContextFactions({ ...base, startDateLocal: '2026-07-21T05:30:00Z' }, false)
    expect(m?.reason).toBe('dawn')
    expect(m?.factionIds).toHaveLength(2)
  })

  it('심야(23~04시 local)는 낭만 미식가/숲속의 갱단', () => {
    expect(matchContextFactions({ ...base, startDateLocal: '2026-07-21T23:10:00Z' }, false)?.reason).toBe('late_night')
    expect(matchContextFactions({ ...base, startDateLocal: '2026-07-21T02:00:00Z' }, false)?.reason).toBe('late_night')
  })

  it('온도 매칭이 시간대보다 우선한다', () => {
    const m = matchContextFactions(
      { ...base, weatherTempC: -15, startDateLocal: '2026-07-21T05:30:00Z' },
      false
    )
    expect(m?.reason).toBe('cold')
  })

  it('고고도(500m+)는 미식가/비트', () => {
    expect(matchContextFactions({ ...base, elevationGainM: 600 }, false)?.reason).toBe('high_elevation')
  })

  it('러너스 하이(90분+)는 미스터리 헌터', () => {
    const m = matchContextFactions({ ...base, movingTimeSec: 100 * 60 }, false)
    expect(m?.factionIds).toEqual([MYSTERY_FACTION_ID])
    expect(m?.reason).toBe('runners_high')
  })

  it('평범한 활동은 매칭 없음', () => {
    expect(matchContextFactions(base, false)).toBeNull()
    expect(matchContextFactions(null, false)).toBeNull()
  })
})
