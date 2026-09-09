/**
 * strava/api — getActivityStreams velocity_smooth·time 스트림 확장 파싱 (티켓 20260909_1012)
 *
 * 배경: POI 매칭용으로 latlng만 요청하던 Streams API 호출을 velocity_smooth·time까지
 * 확장했다. 이 테스트는 확장된 파싱이 route/velocitySmooth/time을 올바르게 분리해
 * 돌려주는지, 일부 스트림이 응답에 없을 때도 나머지를 살리는지를 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/getActivityStreams.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getActivityStreams } from '../api'

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getActivityStreams — 확장 파싱', () => {
  it('latlng·velocity_smooth·time이 모두 있으면 셋 다 채워서 돌려준다', async () => {
    mockFetchOnce(200, {
      latlng: { data: [[37.5, 127.0], [37.51, 127.01]], series_type: 'distance', original_size: 2, resolution: 'medium' },
      velocity_smooth: { data: [1.2, 1.5, 11.1], series_type: 'distance', original_size: 3, resolution: 'medium' },
      time: { data: [0, 30, 60], series_type: 'distance', original_size: 3, resolution: 'medium' },
    })

    const result = await getActivityStreams(123, 'token')

    expect(result).toEqual({
      route: [[37.5, 127.0], [37.51, 127.01]],
      velocitySmooth: [1.2, 1.5, 11.1],
      time: [0, 30, 60],
    })
  })

  it('velocity_smooth·time이 응답에 없으면(구형 실내 활동 등) 해당 필드만 null이고 route는 살아있다', async () => {
    mockFetchOnce(200, {
      latlng: { data: [[37.5, 127.0]], series_type: 'distance', original_size: 1, resolution: 'medium' },
    })

    const result = await getActivityStreams(123, 'token')

    expect(result).toEqual({
      route: [[37.5, 127.0]],
      velocitySmooth: null,
      time: null,
    })
  })

  it('404(스트림 데이터 없음)는 셋 다 null인 정상 케이스로 처리한다', async () => {
    mockFetchOnce(404, {})

    const result = await getActivityStreams(123, 'token')

    expect(result).toEqual({ route: null, velocitySmooth: null, time: null })
  })

  it('네트워크 오류·비-2xx 응답은 null을 돌려준다 (fail-open 신호)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )

    const result = await getActivityStreams(123, 'token')

    expect(result).toBeNull()
  })
})
