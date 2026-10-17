/**
 * strava/api — getAllActivities 페이지 끝까지 넘기기 (티켓 20261017_1421, 운영 로직 6.2절)
 *
 * 한 번에 가져오는 건수 상한(200건)을 넘으면 페이지를 끝까지 넘긴다. 실제 Strava를 부르지 않고
 * 페이지 조회 함수를 주입해 시험한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/getAllActivities.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import type { StravaSummaryActivity } from '@/types/strava'
import { ACTIVITIES_MAX_PAGES, ACTIVITIES_PAGE_SIZE, getAllActivities } from '../api'

const page = (size: number, startId: number) =>
  Array.from({ length: size }, (_, i) => ({ id: startId + i }) as StravaSummaryActivity)

describe('getAllActivities', () => {
  it('200건을 넘으면 다음 페이지를 이어 가져와 모두 합친다 (200 + 200 + 50)', async () => {
    const fetchPage = vi.fn(async (_token: string, _after?: number, p?: number) => {
      if (p === 1) return page(ACTIVITIES_PAGE_SIZE, 1)
      if (p === 2) return page(ACTIVITIES_PAGE_SIZE, 1001)
      return page(50, 2001)
    })

    const all = await getAllActivities('token', 123, fetchPage)

    expect(all).toHaveLength(450)
    expect(fetchPage.mock.calls.map((c) => c[2])).toEqual([1, 2, 3])
    // after는 모든 페이지에 같게 넘어간다
    expect(fetchPage.mock.calls.every((c) => c[1] === 123)).toBe(true)
  })

  it('한 페이지가 상한보다 적으면 그 페이지에서 멈춘다', async () => {
    const fetchPage = vi.fn(async () => page(3, 1))
    const all = await getAllActivities('token', undefined, fetchPage)
    expect(all).toHaveLength(3)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('빈 응답이면 빈 배열을 돌려준다', async () => {
    const fetchPage = vi.fn(async () => [] as StravaSummaryActivity[])
    expect(await getAllActivities('token', undefined, fetchPage)).toEqual([])
  })

  it('딱 상한만큼 온 페이지 다음에 빈 페이지가 오면 거기서 끝난다', async () => {
    const fetchPage = vi.fn(async (_t: string, _a?: number, p?: number) => (p === 1 ? page(ACTIVITIES_PAGE_SIZE, 1) : []))
    expect(await getAllActivities('token', undefined, fetchPage)).toHaveLength(ACTIVITIES_PAGE_SIZE)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('중간 페이지가 실패하면 일부만 돌려주지 않고 던진다', async () => {
    const fetchPage = vi.fn(async (_t: string, _a?: number, p?: number) => {
      if (p === 2) throw new Error('429')
      return page(ACTIVITIES_PAGE_SIZE, 1)
    })
    await expect(getAllActivities('token', undefined, fetchPage)).rejects.toThrow('429')
  })

  it('끝나지 않는 응답은 안전 상한에서 던진다', async () => {
    const fetchPage = vi.fn(async () => page(ACTIVITIES_PAGE_SIZE, 1))
    await expect(getAllActivities('token', undefined, fetchPage)).rejects.toThrow(/끝나지 않음/)
    expect(fetchPage).toHaveBeenCalledTimes(ACTIVITIES_MAX_PAGES)
  })
})
