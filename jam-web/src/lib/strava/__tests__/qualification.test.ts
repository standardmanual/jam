/**
 * strava/qualification — 인정 활동 판정 사례별 시험 (티켓 20261017_1421, 운영 로직 3.3절)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/qualification.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { StravaSummaryActivity } from '@/types/strava'
import { getJamActivityType, isVirtualStravaActivity } from '@/types/strava'
import {
  buildSourceMeta,
  isFileUploadActivity,
  MIN_QUALIFIED_MOVING_TIME_SEC,
  qualifyActivity,
} from '../qualification'

/** 인정 기준을 모두 갖춘 러닝 — 필요한 칸만 덮어써서 한 기준씩 깬다 */
function raw(overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id: 1,
    resource_state: 2,
    name: 'Run',
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 0,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-09-10T00:00:00Z',
    start_date_local: '2026-09-10T09:00:00',
    timezone: 'Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: null,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: 'm1', summary_polyline: 'poly', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [],
    average_speed: 2.7,
    max_speed: 3,
    has_heartrate: false,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: null,
    upload_id_str: null,
    external_id: null,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
    workout_type: null,
    suffer_score: null,
    ...overrides,
  }
}

describe('qualifyActivity — 인정', () => {
  it('다섯 기준을 모두 갖추면 인정한다 (filter_reason NULL)', () => {
    const result = qualifyActivity(raw())
    expect(result.qualified).toBe(true)
    expect(result.filterReason).toBeNull()
  })

  it('다섯 종목은 모두 인정한다: 러닝·트레일러닝·걷기·등산·자전거(전기자전거 포함)', () => {
    for (const sport of ['Run', 'TrailRun', 'Walk', 'Hike', 'Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide']) {
      expect(qualifyActivity(raw({ type: sport === 'TrailRun' ? 'Run' : sport, sport_type: sport })).qualified).toBe(true)
    }
  })

  it('움직인 시간이 정확히 10분이면 인정한다', () => {
    expect(qualifyActivity(raw({ moving_time: MIN_QUALIFIED_MOVING_TIME_SEC })).qualified).toBe(true)
  })

  it('외부 ID가 확장자 없는 서비스 식별자면 업로드 번호가 있어도 인정한다 (기기 동기화)', () => {
    const result = qualifyActivity(raw({ upload_id: 99, upload_id_str: '99', external_id: 'garmin_push_123456' }))
    expect(result.qualified).toBe(true)
  })

  it('업로드 번호가 없으면 외부 ID가 파일 이름 모양이어도 파일 업로드로 보지 않는다', () => {
    expect(qualifyActivity(raw({ external_id: 'a.fit' })).qualified).toBe(true)
  })
})

describe('qualifyActivity — 걸러짐 사유', () => {
  it('가상 활동: type이나 sport_type이 Virtual로 시작', () => {
    expect(qualifyActivity(raw({ type: 'VirtualRide', sport_type: 'VirtualRide' })).filterReason).toBe('virtual')
    expect(qualifyActivity(raw({ type: 'VirtualRun', sport_type: 'VirtualRun' })).filterReason).toBe('virtual')
    // 둘 중 하나만 가상이어도 가상이다
    expect(qualifyActivity(raw({ type: 'Ride', sport_type: 'VirtualRide' })).filterReason).toBe('virtual')
  })

  it('다섯 종목 밖: 수영·요가·웨이트 등', () => {
    for (const sport of ['Swim', 'Yoga', 'WeightTraining', 'Workout']) {
      expect(qualifyActivity(raw({ type: sport, sport_type: sport })).filterReason).toBe('unsupported_sport')
    }
  })

  it('수동 입력: manual이 true', () => {
    expect(qualifyActivity(raw({ manual: true })).filterReason).toBe('manual_entry')
  })

  it('파일 업로드(추정): 업로드 번호가 있고 외부 ID가 파일 이름 모양', () => {
    for (const externalId of ['run.gpx', 'Morning.FIT', 'x.tcx', 'a.gpx.gz']) {
      const result = qualifyActivity(raw({ upload_id: 1, external_id: externalId }))
      expect(result.filterReason).toBe('file_upload')
    }
    // upload_id_str만 와도 업로드 번호가 있는 것이다
    expect(qualifyActivity(raw({ upload_id: null, upload_id_str: '55', external_id: 'x.gpx' })).filterReason).toBe('file_upload')
  })

  it('GPS 경로 없음: 시작 좌표가 비었거나 경로 요약이 비었거나 둘 다 비었다', () => {
    expect(qualifyActivity(raw({ start_latlng: [] })).filterReason).toBe('no_gps')
    expect(qualifyActivity(raw({ map: { id: 'm', summary_polyline: null, resource_state: 2 } })).filterReason).toBe('no_gps')
    expect(qualifyActivity(raw({ map: { id: 'm', summary_polyline: '', resource_state: 2 } })).filterReason).toBe('no_gps')
    expect(
      qualifyActivity(raw({ start_latlng: [], map: { id: 'm', summary_polyline: null, resource_state: 2 } })).filterReason
    ).toBe('no_gps')
  })

  it('움직인 시간 10분 미만', () => {
    expect(qualifyActivity(raw({ moving_time: 599 })).filterReason).toBe('too_short')
    expect(qualifyActivity(raw({ moving_time: 0 })).filterReason).toBe('too_short')
  })

  it('기준이 여러 개 걸리면 순서대로 처음 걸린 하나가 사유다: 가상 → 종목 → 수동 → 파일 → GPS → 시간', () => {
    const everythingWrong = raw({
      type: 'VirtualRide',
      sport_type: 'VirtualRide',
      manual: true,
      start_latlng: [],
      moving_time: 10,
    })
    expect(qualifyActivity(everythingWrong).filterReason).toBe('virtual')
    expect(qualifyActivity({ ...everythingWrong, type: 'Swim', sport_type: 'Swim' }).filterReason).toBe('unsupported_sport')
    expect(qualifyActivity({ ...everythingWrong, type: 'Run', sport_type: 'Run' }).filterReason).toBe('manual_entry')
    expect(
      qualifyActivity({ ...everythingWrong, type: 'Run', sport_type: 'Run', manual: false, upload_id: 1, external_id: 'a.gpx' })
        .filterReason
    ).toBe('file_upload')
    expect(qualifyActivity({ ...everythingWrong, type: 'Run', sport_type: 'Run', manual: false }).filterReason).toBe('no_gps')
    expect(
      qualifyActivity({ ...everythingWrong, type: 'Run', sport_type: 'Run', manual: false, start_latlng: [37.5, 127] }).filterReason
    ).toBe('too_short')
  })
})

describe('source_meta — 판정에 쓴 원본 값의 유무·모양만 담는다', () => {
  it('외부 ID 모양을 없음 / 파일 이름 / 그 밖으로 가르고, 원문은 담지 않는다', () => {
    expect(buildSourceMeta(raw({ external_id: null })).externalIdShape).toBe('none')
    expect(buildSourceMeta(raw({ external_id: '  ' })).externalIdShape).toBe('none')
    expect(buildSourceMeta(raw({ external_id: 'run.gpx' })).externalIdShape).toBe('file_name')
    expect(buildSourceMeta(raw({ external_id: 'garmin_push_1' })).externalIdShape).toBe('other')
  })

  it('경로 요약 본문·좌표를 담지 않는다', () => {
    const meta = buildSourceMeta(
      raw({ map: { id: 'm', summary_polyline: 'VERY-SECRET', resource_state: 2 }, start_latlng: [37.5111, 127.0222] })
    )
    const serialized = JSON.stringify(meta)
    expect(serialized).not.toContain('VERY-SECRET')
    expect(serialized).not.toContain('37.5111')
    expect(meta.hasSummaryPolyline).toBe(true)
    expect(meta.hasStartLatLng).toBe(true)
  })

  it('걸러진 활동에도 sourceMeta가 같이 온다', () => {
    const result = qualifyActivity(raw({ manual: true }))
    expect(result.sourceMeta.manual).toBe(true)
  })

  it('파일 업로드 기준은 isFileUploadActivity 한 함수가 가른다', () => {
    expect(isFileUploadActivity({ hasUploadId: true, externalIdShape: 'file_name' })).toBe(true)
    expect(isFileUploadActivity({ hasUploadId: true, externalIdShape: 'other' })).toBe(false)
    expect(isFileUploadActivity({ hasUploadId: false, externalIdShape: 'file_name' })).toBe(false)
  })
})

describe('getJamActivityType — 종목 매핑 (운영 로직 3.3절)', () => {
  it('가상 종목은 매핑하지 않는다', () => {
    expect(getJamActivityType({ type: 'VirtualRide', sport_type: 'VirtualRide' })).toBeNull()
    expect(getJamActivityType({ type: 'VirtualRun', sport_type: 'VirtualRun' })).toBeNull()
    expect(isVirtualStravaActivity({ type: 'Ride', sport_type: 'VirtualRide' })).toBe(true)
    expect(isVirtualStravaActivity({ type: 'Ride', sport_type: 'Ride' })).toBe(false)
  })

  it('전기자전거·전기 산악자전거는 인정 종목(자전거 값)으로 매핑한다', () => {
    expect(getJamActivityType({ type: 'EBikeRide', sport_type: 'EBikeRide' })).toBe('cycling')
    expect(getJamActivityType({ type: 'EBikeRide', sport_type: 'EMountainBikeRide' })).toBe('cycling')
  })
})
