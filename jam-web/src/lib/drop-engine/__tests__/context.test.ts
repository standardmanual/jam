/**
 * 맥락 오버라이드 매칭 테스트 (드랍엔진 v2 Step D)
 */
import { matchContextTribes } from '../context'
import { MYSTERY_TRIBE_ID, RESOLUTION_TRIBE_ID } from '../constants'
import type { NormalizedActivity } from '@/types/strava'
import { kstIso } from '@/lib/badge-engine/__tests__/kstFixture'

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

describe('matchContextTribes', () => {
  it('복귀는 활동 정보와 무관하게 작심삼일 클럽, always=true', () => {
    const m = matchContextTribes(base, true)
    expect(m?.tribeIds).toEqual([RESOLUTION_TRIBE_ID])
    expect(m?.always).toBe(true)
  })

  it('극한 온도(-10°C 이하 / 33°C 이상)는 아스팔트 레인저', () => {
    expect(matchContextTribes({ ...base, weatherTempC: -12 }, false)?.reason).toBe('cold')
    expect(matchContextTribes({ ...base, weatherTempC: 35 }, false)?.reason).toBe('hot')
    expect(matchContextTribes({ ...base, weatherTempC: 20 }, false)).toBeNull()
  })

  // 시간대 구간은 배지 조건과 같은 상수(`badge-engine/timeBands.ts`)다 — 활동 시작 시각의 KST 기준(티켓 20261018_1815)
  it('새벽(KST 05~07시)은 비트 마에스트로/셔터 마피아', () => {
    const m = matchContextTribes({ ...base, startDate: kstIso('2026-07-21T05:30') }, false)
    expect(m?.reason).toBe('dawn')
    expect(m?.tribeIds).toHaveLength(2)
  })

  it('밤(KST 22~05시)은 낭만 미식가/숲속의 갱단', () => {
    expect(matchContextTribes({ ...base, startDate: kstIso('2026-07-21T23:10') }, false)?.reason).toBe('late_night')
    expect(matchContextTribes({ ...base, startDate: kstIso('2026-07-21T02:00') }, false)?.reason).toBe('late_night')
  })

  it('경계값: 05:00 새벽 시작, 07:00 새벽 끝, 22:00 밤 시작, 04:59 밤 끝', () => {
    const reasonAt = (hhmm: string) => matchContextTribes({ ...base, startDate: kstIso(`2026-07-21T${hhmm}`) }, false)?.reason
    expect(reasonAt('04:59')).toBe('late_night')
    expect(reasonAt('05:00')).toBe('dawn')
    expect(reasonAt('06:59')).toBe('dawn')
    expect(reasonAt('07:00')).toBeUndefined()
    expect(reasonAt('21:59')).toBeUndefined()
    expect(reasonAt('22:00')).toBe('late_night')
  })

  it('현지 시각(startDateLocal)이 아니라 UTC startDate의 한국 시각을 본다', () => {
    // KST 19:00(저녁)인 활동이 현지 시각 05:30(해외)이어도 새벽이 아니다
    expect(matchContextTribes({ ...base, startDateLocal: '2026-07-21T05:30:00Z' }, false)).toBeNull()
  })

  it('온도 매칭이 시간대보다 우선한다', () => {
    const m = matchContextTribes(
      { ...base, weatherTempC: -15, startDate: kstIso('2026-07-21T05:30') },
      false
    )
    expect(m?.reason).toBe('cold')
  })

  it('고고도(500m+)는 미식가/비트', () => {
    expect(matchContextTribes({ ...base, elevationGainM: 600 }, false)?.reason).toBe('high_elevation')
  })

  it('러너스 하이(90분+)는 미스터리 헌터', () => {
    const m = matchContextTribes({ ...base, movingTimeSec: 100 * 60 }, false)
    expect(m?.tribeIds).toEqual([MYSTERY_TRIBE_ID])
    expect(m?.reason).toBe('runners_high')
  })

  it('평범한 활동은 매칭 없음', () => {
    expect(matchContextTribes(base, false)).toBeNull()
    expect(matchContextTribes(null, false)).toBeNull()
  })
})
