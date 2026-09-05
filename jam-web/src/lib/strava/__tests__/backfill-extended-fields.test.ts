/**
 * 확장 필드 백필 — 병합 규칙 회귀 테스트 (티켓 20260905_0029)
 *
 * 백필은 기존 873행(실측 2026-09-05)의 `normalized`를 손대는 작업이라, 병합 규칙이 틀리면
 * **이미 저장된 활동 데이터가 손상된다.** 되돌릴 방법이 없으므로 아래를 고정한다.
 *
 * - 확장 6필드 **외의 키는 건드리지 않는다**
 * - Strava가 주지 않은 값은 키를 만들지도, 기존 값을 지우지도 않는다
 * - 값이 이미 같으면 UPDATE를 보내지 않는다 (재실행 비용 0 · 멱등)
 * - 이 모듈은 배지·드랍·미션·소식 엔진을 **import조차 하지 않는다** — 백필이 배지 홍수를
 *   일으키는 경로가 아예 없어야 한다
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/backfill-extended-fields.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeExtendedFields } from '../backfill'
import type { StravaSummaryActivity } from '@/types/strava'

function summary(overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id: 2002,
    resource_state: 2,
    name: '한강 라이딩',
    distance: 40_000,
    moving_time: 5_400,
    elapsed_time: 6_000,
    total_elevation_gain: 120,
    type: 'Ride',
    sport_type: 'Ride',
    start_date: '2026-08-20T00:00:00Z',
    start_date_local: '2026-08-20T09:00:00Z',
    timezone: '(GMT+09:00) Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: 'South Korea',
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: 'b1', summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5, 127.0],
    end_latlng: [37.5, 127.0],
    average_speed: 7.4,
    max_speed: 12.5,       // → 45km/h
    has_heartrate: true,
    average_heartrate: 142,
    max_heartrate: 175,
    average_watts: 187,
    average_cadence: 82,
    elev_high: 61,
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

/** 백필 전의 실제 저장 형태 — 확장 필드가 하나도 없다 (실측 2026-09-05: 873행 전부 이 형태) */
const STORED_BEFORE = {
  stravaId: 2002,
  name: '한강 라이딩',
  distanceKm: 40,
  movingTimeSec: 5400,
  elevationGainM: 120,
  jamActivityType: 'cycling',
  startDate: '2026-08-20T00:00:00Z',
  startDateLocal: '2026-08-20T09:00:00Z',
  averageSpeedKmh: 26.6,
  startLatLng: [37.5, 127.0],
  endLatLng: [37.5, 127.0],
  weatherTempC: null,
}

describe('mergeExtendedFields — 확장 6필드만 채운다', () => {
  it('확장 필드가 없던 행에 6필드가 붙고 changed=true다', () => {
    const { normalized, changed } = mergeExtendedFields(STORED_BEFORE, summary())
    expect(changed).toBe(true)
    expect(normalized.elapsedTimeSec).toBe(6_000)
    expect(normalized.maxSpeedKmh).toBe(45)
    expect(normalized.maxElevationM).toBe(61)
    expect(normalized.avgHeartrateBpm).toBe(142)
    expect(normalized.avgWatts).toBe(187)
    expect(normalized.avgCadence).toBe(82)
  })

  it('기존 키를 하나도 바꾸지 않는다', () => {
    const { normalized } = mergeExtendedFields(STORED_BEFORE, summary())
    for (const [key, value] of Object.entries(STORED_BEFORE)) {
      expect(normalized[key]).toEqual(value)
    }
  })

  it('Strava가 주지 않은 필드는 키를 만들지 않는다', () => {
    const bare = summary()
    delete bare.average_heartrate
    delete bare.average_watts
    delete bare.average_cadence
    delete bare.elev_high
    const { normalized } = mergeExtendedFields(STORED_BEFORE, bare)
    expect('avgHeartrateBpm' in normalized).toBe(false)
    expect('avgWatts' in normalized).toBe(false)
    expect('avgCadence' in normalized).toBe(false)
    expect('maxElevationM' in normalized).toBe(false)
  })

  it('이미 저장된 확장 값을 Strava가 안 준다고 해서 지우지 않는다', () => {
    // 한 번 백필된 뒤 유저가 심박 데이터를 Strava에서 지운 상황
    const stored = mergeExtendedFields(STORED_BEFORE, summary()).normalized
    const bare = summary()
    delete bare.average_heartrate
    const { normalized, changed } = mergeExtendedFields(stored, bare)
    expect(normalized.avgHeartrateBpm).toBe(142)
    expect(changed).toBe(false) // 바꿀 게 없으면 UPDATE도 없다
  })

  it('값이 이미 같으면 changed=false — 재실행해도 쓰기가 0건이다', () => {
    const once = mergeExtendedFields(STORED_BEFORE, summary())
    const twice = mergeExtendedFields(once.normalized, summary())
    expect(twice.changed).toBe(false)
    expect(twice.normalized).toEqual(once.normalized)
  })

  it('값이 달라졌으면 갱신한다 (Strava에서 활동을 수정한 경우)', () => {
    const stored = { ...STORED_BEFORE, avgWatts: 100 }
    const { normalized, changed } = mergeExtendedFields(stored, summary({ average_watts: 187 }))
    expect(changed).toBe(true)
    expect(normalized.avgWatts).toBe(187)
  })

  it('normalized가 비어 있거나 형태가 깨져 있어도 죽지 않는다', () => {
    expect(mergeExtendedFields({}, summary()).changed).toBe(true)
    expect(mergeExtendedFields(null, summary()).normalized.avgWatts).toBe(187)
    // 배열·스칼라가 들어와도 빈 객체에서 시작한다 (jsonb라 형태 보장이 없다)
    expect(mergeExtendedFields([1, 2], summary()).normalized.avgWatts).toBe(187)
    expect(mergeExtendedFields('깨진 값', summary()).normalized.avgWatts).toBe(187)
  })

  it('max_speed는 백필에서도 m/s → km/h로 변환된다 (싱크와 같은 함수)', () => {
    const { normalized } = mergeExtendedFields(STORED_BEFORE, summary({ max_speed: 10 }))
    expect(normalized.maxSpeedKmh).toBe(36)
  })
})

describe('백필 모듈 — 배지 홍수를 일으킬 경로가 없다', () => {
  const raw = readFileSync(join(process.cwd(), 'src/lib/strava/backfill.ts'), 'utf8')
  /** 주석은 «하지 않는 것»을 설명하느라 금지어를 그대로 담고 있다 — 실행 코드만 본다 */
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('배지·드랍·미션·소식·피드 엔진을 import하지 않는다', () => {
    // 티켓 확정 사항: 「백필은 normalized의 확장 필드만 갱신한다. 배지 재발급·드랍·알림을
    // 트리거하지 마라 — 돌리는 순간 배지 홍수가 난다」
    for (const forbidden of [
      'badge-engine',
      'drop-engine',
      'missions/checker',
      'lib/notifications',
      'activity-feed',
      'itembook',
      'poi/matcher',
      'processFetchedActivities',
    ]) {
      expect(source, `금지된 의존: ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('last_synced_at을 건드리지 않는다 — 커서가 밀리면 활동이 영영 누락된다', () => {
    expect(source).not.toContain('last_synced_at')
  })

  it('상세 엔드포인트(getActivityById)를 쓰지 않는다 — 활동당 1회 호출은 백필 비용이 697회다', () => {
    expect(source).not.toContain('getActivityById')
  })

  it('strava_activities에 쓰는 컬럼은 normalized·processed_via뿐이다', () => {
    const updateBlock = source.slice(source.indexOf('const payload'), source.indexOf('result.updated++'))
    expect(updateBlock).toContain('normalized')
    expect(updateBlock).toContain('processed_via')
    for (const column of ['distance_km', 'jam_activity_type', 'start_date', 'user_id', 'strava_id']) {
      expect(updateBlock, `쓰기 대상에 ${column}이 들어갔다`).not.toContain(`${column}:`)
    }
  })
})
