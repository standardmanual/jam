/**
 * 아이템 배지 지급 뒤의 후속 처리 `recordIssuedRewards` (티켓 20261017_1425 2회, 20261021_1249 6-3 5회)
 *
 * 고정하는 것
 *  - 기본(동기화·보류 받기): 열린 개체는 배지 포인트를 한 번 주고 `item_dropped` 피드를 올린다. 활동 id와 활동 시작 시각을 피드에 넘긴다.
 *  - 잠긴 개체: 포인트도 피드도 건너뛴다(운영 로직 7.3절).
 *  - `skipFeed`(캡슐 열기): 열린 개체여도 피드를 올리지 않고 포인트는 그대로 준다(운영 로직 15.3절 «캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다»).
 *  - 포인트·피드가 던져도 던지지 않는다.
 *  - `recordItemDroppedFeed`(티켓 20261026_1031): 피드 칸을 한 곳에서 정한다. 열린 채 받은 개체(위)와 잠긴 개체를 연 때(`openLockedItem`)가 같이 쓴다.
 *    시각·활동 id를 생략하면 넘기지 않고(DB 기본값 = 지금), 포인트가 0이면 `point_reward` 칸이 없으며, 그림이 없으면 빈 문자열이다.
 * 실제 포인트·피드·공용 DB는 부르지 않는다 — 둘 다 모의한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/issueFollowUp.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const feedMock = vi.hoisted(() => vi.fn())
const awardPointsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: (...args: unknown[]) => feedMock(...args) }))
vi.mock('@/lib/points', () => ({ awardPoints: (...args: unknown[]) => awardPointsMock(...args) }))

import { recordIssuedRewards, recordItemDroppedFeed, type IssuedRewardsInput } from '../issueFollowUp'

const USER = 'user-1'

function input(over: Partial<IssuedRewardsInput> = {}): IssuedRewardsInput {
  return {
    userId: USER,
    stravaId: 1234,
    startDate: '2026-10-22T01:00:00.000Z',
    tribeName: '트라이브-A',
    inventoryItemId: 'inv-1',
    badge: { id: 'badge-1', name: '파편', image_url: 'https://example.com/a.png', point_reward: 50 },
    rarity: 'epic',
    ...over,
  }
}

beforeEach(() => {
  feedMock.mockReset()
  feedMock.mockResolvedValue(undefined)
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordIssuedRewards', () => {
  it('기본: 열린 개체는 포인트를 한 번 주고 item_dropped 피드를 활동 정보와 함께 올린다', async () => {
    await recordIssuedRewards(input())

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 50, 'badge_point_reward', { sourceBadgeId: 'badge-1' })
    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock.mock.calls[0][0]).toBe(USER)
    expect(feedMock.mock.calls[0][1]).toBe('item_dropped')
    expect(feedMock.mock.calls[0][2]).toMatchObject({ inventory_item_id: 'inv-1', badge_id: 'badge-1', tribe_name: '트라이브-A', point_reward: 50 })
    expect(feedMock.mock.calls[0][3]).toBe('2026-10-22T01:00:00.000Z')
    expect(feedMock.mock.calls[0][4]).toBe(1234)
  })

  it('skipFeed가 참이면 열린 개체여도 피드를 올리지 않고 포인트는 그대로 준다', async () => {
    await recordIssuedRewards(input({ stravaId: null, startDate: null, skipFeed: true }))

    expect(feedMock).not.toHaveBeenCalled()
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER, 50, 'badge_point_reward', { sourceBadgeId: 'badge-1' })
  })

  it('skipFeed가 거짓이거나 생략되면 피드를 올린다', async () => {
    await recordIssuedRewards(input({ skipFeed: false }))
    await recordIssuedRewards(input())

    expect(feedMock).toHaveBeenCalledTimes(2)
  })

  it('잠긴 개체는 포인트도 피드도 건너뛴다', async () => {
    await recordIssuedRewards(input({ locked: true }))

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(feedMock).not.toHaveBeenCalled()
  })

  it('포인트가 없는 배지는 포인트를 주지 않고 피드만 올린다(skipFeed가 아니면)', async () => {
    await recordIssuedRewards(input({ badge: { id: 'badge-1', name: '파편', image_url: null, point_reward: null } }))

    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock.mock.calls[0][2]).not.toHaveProperty('point_reward')
  })

  it('포인트 지급이 던져도 던지지 않고, 피드는 이어서 올린다', async () => {
    awardPointsMock.mockRejectedValue(new Error('포인트 서버 다운'))

    await expect(recordIssuedRewards(input())).resolves.toBeUndefined()

    expect(feedMock).toHaveBeenCalledTimes(1)
  })

  it('피드 기록이 던져도 던지지 않는다', async () => {
    feedMock.mockRejectedValue(new Error('피드 서버 다운'))

    await expect(recordIssuedRewards(input())).resolves.toBeUndefined()
  })
})

describe('recordItemDroppedFeed', () => {
  it('칸 이름과 값을 정해진 모양으로 싣고, 시각·활동 id를 생략하면 넘기지 않는다', async () => {
    await recordItemDroppedFeed({
      userId: USER,
      inventoryItemId: 'inv-1',
      badge: { id: 'badge-1', name: '파편', image_url: 'https://example.com/a.png' },
      rarity: 'epic',
      tribeName: '트라이브-A',
      pointReward: 50,
    })

    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock).toHaveBeenCalledWith(
      USER,
      'item_dropped',
      {
        inventory_item_id: 'inv-1',
        badge_id: 'badge-1',
        badge_name: '파편',
        badge_image_url: 'https://example.com/a.png',
        rarity: 'epic',
        poi_name: '',
        tribe_name: '트라이브-A',
        is_last_piece: false,
        point_reward: 50,
      },
      undefined,
      undefined
    )
  })

  it('포인트가 0이면 point_reward 칸이 없고, 그림이 없으면 빈 문자열이며, 등급이 없으면 null이다', async () => {
    await recordItemDroppedFeed({
      userId: USER,
      inventoryItemId: 'inv-1',
      badge: { id: 'badge-1', name: '파편', image_url: null },
      rarity: null,
      tribeName: '',
      pointReward: 0,
      eventAt: '2026-10-26T01:00:00.000Z',
      stravaId: 99,
    })

    expect(feedMock.mock.calls[0][2]).not.toHaveProperty('point_reward')
    expect(feedMock.mock.calls[0][2]).toMatchObject({ badge_image_url: '', rarity: null, tribe_name: '' })
    expect(feedMock.mock.calls[0][3]).toBe('2026-10-26T01:00:00.000Z')
    expect(feedMock.mock.calls[0][4]).toBe(99)
  })

  it('포인트를 주지 않는다', async () => {
    await recordItemDroppedFeed({
      userId: USER,
      inventoryItemId: 'inv-1',
      badge: { id: 'badge-1', name: '파편', image_url: null },
      rarity: 'common',
      tribeName: '트라이브-A',
      pointReward: 50,
    })

    expect(awardPointsMock).not.toHaveBeenCalled()
  })
})
