/**
 * 상황판 개발 요청 읽기 (티켓 20261026_2028 3회차)
 *
 * 지키는 것:
 * - `requested` 상태만 읽고, 보드에 필요한 네 필드(번호·제목·출처·상태)만 돌려준다(본문·정책 ID·티켓 ID는 싣지 않는다)
 * - 읽기 실패는 던진다(`loadDevBoard`가 `error`로 담는다)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/requests.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({ listDevRequests: vi.fn() }))
vi.mock('@/lib/admin/devRequests/store', () => ({ listDevRequests: hoisted.listDevRequests }))

import { listBoardRequests } from '../requests'

const service = {} as Parameters<typeof listBoardRequests>[0]

beforeEach(() => {
  hoisted.listDevRequests.mockReset()
})

describe('listBoardRequests', () => {
  it('requested 요청만 읽어 보드 입력 모양으로 바꾼다', async () => {
    hoisted.listDevRequests.mockResolvedValue([
      {
        id: 'uuid-1',
        no: 7,
        title: '캡슐 확률을 코드 밖으로',
        detail: '긴 본문',
        origin: 'eco',
        policyId: 'capsule-odds',
        status: 'requested',
        ticketId: null,
        createdAt: '2026-10-27T00:00:00Z',
      },
    ])
    const result = await listBoardRequests(service)
    expect(hoisted.listDevRequests).toHaveBeenCalledWith(service, { status: 'requested' })
    expect(result).toEqual([{ no: 7, title: '캡슐 확률을 코드 밖으로', origin: 'eco', status: 'requested' }])
  })

  it('요청이 없으면 빈 배열이다', async () => {
    hoisted.listDevRequests.mockResolvedValue([])
    expect(await listBoardRequests(service)).toEqual([])
  })

  it('읽기가 실패하면 던진다', async () => {
    hoisted.listDevRequests.mockImplementation(async () => {
      throw new Error('개발 요청 조회 실패: x')
    })
    await expect(listBoardRequests(service)).rejects.toThrow('개발 요청 조회 실패')
  })
})
