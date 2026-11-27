/**
 * lib/chapter/reward/record — 챕터 오름 보상 지급 뒤 후속 처리 (티켓 20261127_1731 C3a)
 *
 * 고정하는 것:
 * - 지급된 개체(인벤토리 id가 있는 칸)마다 `recordIssuedRewards`를 부르고, 피드는 건너뛴다(`skipFeed: true`). 활동 정보는 없다(`stravaId`·`startDate` null).
 * - 트라이브 이름은 개체의 트라이브 id로 찾고, 못 찾으면 빈 문자열이다.
 * - 잠긴 개체는 `locked: true`로 넘겨 포인트에서 빠진다(실제 `recordIssuedRewards`를 통과시켜 포인트·피드가 불리지 않음을 확인한다).
 * - 지급 결과가 없는 칸은 건너뛴다. 후속 처리가 던져도 던지지 않고 다음 개체를 이어 처리한다.
 * 공용 DB는 호출하지 않는다 — 포인트·피드는 가짜다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/reward/__tests__/record.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RolledChapterRewardItem } from '../roll'
import type { ChapterRewardBadge } from '../stored'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const followUpMock = vi.hoisted(() => vi.fn())
const awardPointsMock = vi.hoisted(() => vi.fn())
const feedMock = vi.hoisted(() => vi.fn())
const realFollowUp = vi.hoisted(() => ({ fn: null as null | ((...args: never[]) => Promise<void>) }))

vi.mock('@/lib/points', () => ({ awardPoints: (...args: unknown[]) => awardPointsMock(...args) }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: (...args: unknown[]) => feedMock(...args) }))
vi.mock('@/lib/drop-engine/issueFollowUp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drop-engine/issueFollowUp')>()
  realFollowUp.fn = actual.recordIssuedRewards as unknown as (...args: never[]) => Promise<void>
  return { ...actual, recordIssuedRewards: (...args: Parameters<typeof actual.recordIssuedRewards>) => followUpMock(...args) }
})

import { recordChapterRewardItems } from '../record'

const badge = (id: string, point: number | null): ChapterRewardBadge => ({
  id,
  name: id,
  image_url: null,
  rarity: 'rare',
  item_book_id: 'book-1',
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  deleted_at: null,
  point_reward: point,
})

const TRIBES = [
  { id: 'tribe-1', name: '트라이브 하나' },
  { id: 'tribe-2', name: '트라이브 둘' },
]

const OPEN: RolledChapterRewardItem<ChapterRewardBadge> = {
  badge: badge('badge-open', 7),
  tribeId: 'tribe-1',
  rarity: 'rare',
  rolledRarity: 'rare',
  lock: { locked: false, lockReason: null, unlockRequired: null },
}
const LOCKED: RolledChapterRewardItem<ChapterRewardBadge> = {
  badge: badge('badge-locked', 9),
  tribeId: 'tribe-2',
  rarity: 'epic',
  rolledRarity: 'epic',
  lock: { locked: true, lockReason: 'rolled', unlockRequired: 120 },
}

beforeEach(() => {
  followUpMock.mockReset()
  awardPointsMock.mockReset()
  feedMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recordChapterRewardItems', () => {
  it('지급된 개체마다 recordIssuedRewards를 skipFeed: true로 부른다(활동 정보 없음, 트라이브 이름 포함)', async () => {
    await recordChapterRewardItems(USER_ID, TRIBES, [OPEN, LOCKED], [{ inventoryItemId: 'inv-1' }, { inventoryItemId: 'inv-2' }])

    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(followUpMock).toHaveBeenNthCalledWith(1, {
      userId: USER_ID,
      stravaId: null,
      startDate: null,
      tribeName: '트라이브 하나',
      inventoryItemId: 'inv-1',
      badge: OPEN.badge,
      rarity: 'rare',
      locked: false,
      skipFeed: true,
    })
    expect(followUpMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ inventoryItemId: 'inv-2', tribeName: '트라이브 둘', rarity: 'epic', locked: true, skipFeed: true }))
  })

  it('잠긴 개체는 포인트에서 빠지고 열린 개체만 포인트를 받으며, 피드는 어느 쪽도 올리지 않는다', async () => {
    followUpMock.mockImplementation((...args: unknown[]) => (realFollowUp.fn as (...a: unknown[]) => Promise<void>)(...args))

    await recordChapterRewardItems(USER_ID, TRIBES, [OPEN, LOCKED], [{ inventoryItemId: 'inv-1' }, { inventoryItemId: 'inv-2' }])

    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 7, 'badge_point_reward', { sourceBadgeId: 'badge-open' })
    expect(feedMock).not.toHaveBeenCalled()
  })

  it('트라이브 이름을 찾지 못하면 빈 문자열이다', async () => {
    await recordChapterRewardItems(USER_ID, [], [OPEN], [{ inventoryItemId: 'inv-1' }])
    expect(followUpMock).toHaveBeenCalledWith(expect.objectContaining({ tribeName: '' }))
  })

  it('지급 결과가 없는 칸(인벤토리 id 없음, 칸 자체가 없음)은 건너뛴다', async () => {
    await recordChapterRewardItems(USER_ID, TRIBES, [OPEN, LOCKED], [{}])
    expect(followUpMock).not.toHaveBeenCalled()
  })

  it('후속 처리가 던져도 던지지 않고 다음 개체를 이어 처리한다(로그만 남긴다)', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    followUpMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)

    await expect(
      recordChapterRewardItems(USER_ID, TRIBES, [OPEN, LOCKED], [{ inventoryItemId: 'inv-1' }, { inventoryItemId: 'inv-2' }])
    ).resolves.toBeUndefined()

    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(errorLog).toHaveBeenCalledTimes(1)
  })
})
