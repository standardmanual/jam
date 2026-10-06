/**
 * 연결 그룹·생성 순서·종류 쌍 (티켓 20261002_1122, PRD §8.3)와 함께 취소할 항목(`cancelSetOf`, 티켓 20261002_1256, PRD §8.7),
 * 지금 종료가 알릴 항목(`pointingLiveOf`, 티켓 20261006_0950, PRD §8.7)
 */
import { describe, it, expect } from 'vitest'
import {
  CREATION_KIND_ORDER,
  LINK_PAIRS,
  buildLinkGroups,
  cancelSetOf,
  orderForCreation,
  orderForUndo,
  planLinkFills,
  pointingLiveOf,
  referencersOf,
} from '../groups'
import { makeItem } from './fixtures'

const idsOf = (items: Array<{ id: string }>) => items.map((item) => item.id)

describe('buildLinkGroups · 방향 없이 이은 연결 요소', () => {
  it('어느 쪽이 적었는지와 관계없이 이어진 항목을 한 그룹으로 모은다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission' }),
      makeItem({ key: 'badge', kind: 'jam_badge', links: ['mission'] }),
      makeItem({ key: 'alone', kind: 'recipe' }),
    ])
    expect(groups.map((group) => idsOf(group.items))).toEqual([['card', 'mission', 'badge'], ['alone']])
    expect(groups[0].edges).toEqual([
      { from: 'card', to: 'mission' },
      { from: 'badge', to: 'mission' },
    ])
    expect(groups[0].unreadableItemIds).toEqual([])
  })

  it('반려·취소·실패한 항목은 그룹에서 빼고, 그 항목을 거친 연결은 끊긴다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'rejected', links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge' }),
    ])
    expect(groups.map((group) => idsOf(group.items))).toEqual([['card'], ['badge']])
    expect(groups[0].unreadableItemIds).toEqual([])
  })

  it('결정 전·이미 처리된 항목도 그룹에 들어간다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'a', status: 'reviewing', links: ['b'] }),
      makeItem({ key: 'b', status: 'scheduled' }),
    ])
    expect(groups).toHaveLength(1)
    expect(idsOf(groups[0].items)).toEqual(['a', 'b'])
  })

  it('겹친 키는 그 키를 가진 항목과 그 키를 가리킨 항목을 모두 읽을 수 없음으로 표시하고 이어 주지 않는다', () => {
    const groups = buildLinkGroups([
      makeItem({ id: 'x1', key: 'x' }),
      makeItem({ id: 'x2', key: 'x' }),
      makeItem({ id: 'pointer', key: 'p', links: ['x'] }),
    ])
    expect(groups.map((group) => idsOf(group.items))).toEqual([['x1'], ['x2'], ['pointer']])
    expect(groups.flatMap((group) => group.unreadableItemIds).sort()).toEqual(['pointer', 'x1', 'x2'])
  })

  it('없는 키·자기 자신을 가리킨 항목을 읽을 수 없음으로 표시한다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'ghost-link', links: ['nowhere'] }),
      makeItem({ key: 'self-link', links: ['self-link'] }),
      makeItem({ key: 'fine' }),
    ])
    expect(groups.flatMap((group) => group.unreadableItemIds)).toEqual(['ghost-link', 'self-link'])
    expect(groups.every((group) => group.edges.length === 0)).toBe(true)
  })

  it('멈춘 항목의 키를 가리키는 연결은 읽을 수 없음이 아니다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', status: 'cancelled' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].unreadableItemIds).toEqual([])
  })

  it('그룹과 그룹 안 항목은 제출 순서(position)다', () => {
    const groups = buildLinkGroups([
      makeItem({ key: 'late', position: 9, links: ['early'] }),
      makeItem({ key: 'other', position: 5 }),
      makeItem({ key: 'early', position: 1 }),
    ])
    expect(groups.map((group) => idsOf(group.items))).toEqual([['early', 'late'], ['other']])
  })
})

describe('생성 순서', () => {
  it('종류 순서가 §8.3의 모든 쌍을 만족한다(대상이 가리키는 쪽보다 먼저다)', () => {
    for (const pair of LINK_PAIRS) {
      expect(CREATION_KIND_ORDER.indexOf(pair.to), `${pair.from} → ${pair.to}`).toBeLessThan(CREATION_KIND_ORDER.indexOf(pair.from))
    }
  })

  it('종류 순서대로, 같은 종류는 position 순이고 알 수 없는 종류는 맨 끝이다', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', position: 1 }),
      makeItem({ key: 'drop', kind: 'drop_schedule', position: 2 }),
      makeItem({ key: 'mission-b', kind: 'mission', position: 4 }),
      makeItem({ key: 'mission-a', kind: 'mission', position: 3 }),
      makeItem({ key: 'collection', kind: 'collection_launch', position: 5 }),
      makeItem({ key: 'badge', kind: 'jam_badge', position: 6 }),
      makeItem({ key: 'recipe', kind: 'recipe', position: 7 }),
      makeItem({ key: 'pattern', kind: 'pattern_proposal', position: 0 }),
    ]
    const ordered = orderForCreation({ items })
    expect(idsOf(ordered)).toEqual(['recipe', 'badge', 'collection', 'mission-a', 'mission-b', 'drop', 'card', 'pattern'])
    expect(idsOf(items)[0]).toBe('card')
  })

  it('되돌림은 생성 순서의 역순이다', () => {
    const items = [makeItem({ key: 'card', kind: 'home_feed_card' }), makeItem({ key: 'mission', kind: 'mission' }), makeItem({ key: 'badge', kind: 'jam_badge' })]
    expect(idsOf(orderForUndo({ items }))).toEqual(['card', 'mission', 'badge'])
  })
})

describe('referencersOf · 멈춘 항목을 가리키는 항목', () => {
  it('멈춘 항목을 직접 가리키는 항목을 찾는다(쓴 쪽과 관계없이 종류 쌍으로 정한다)', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card' }),
      makeItem({ key: 'mission', kind: 'mission', status: 'rejected', links: ['card'] }),
    ]
    expect([...referencersOf(items, ['mission'])]).toEqual([['card', { stoppedId: 'mission', direct: true }]])
  })

  it('다른 항목을 거쳐 가리키는 항목도 찾는다', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'rejected' }),
    ]
    const found = referencersOf(items, new Set(['badge']))
    expect(found.get('mission')).toEqual({ stoppedId: 'badge', direct: true })
    expect(found.get('card')).toEqual({ stoppedId: 'badge', direct: false })
  })

  it('멈춘 항목이 가리키기만 하는 항목은 들어 있지 않다(반려된 카드가 여는 미션)', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'rejected', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission' }),
    ]
    expect(referencersOf(items, ['card']).size).toBe(0)
  })

  it('이미 만들어진 항목은 거쳐 가지 않는다(자원이 있으므로 그 너머가 멈춰도 영향이 없다)', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['mission'] }),
      makeItem({ key: 'mission', kind: 'mission', status: 'live', links: ['badge'] }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'rejected' }),
    ]
    expect(referencersOf(items, ['badge']).size).toBe(0)
  })

  it('종류 쌍이 아닌 연결(같은 종류끼리)은 가리킴이 아니다', () => {
    const items = [
      makeItem({ key: 'a', kind: 'mission', links: ['b'] }),
      makeItem({ key: 'b', kind: 'mission', status: 'rejected' }),
    ]
    expect(referencersOf(items, ['b']).size).toBe(0)
  })
})

describe('planLinkFills · 연결 칸 채우기 계획', () => {
  const planOf = (items: ReturnType<typeof makeItem>[]) => planLinkFills(buildLinkGroups(items)[0])

  it('카드가 미션·배지·컬렉션을 가리키면 칸마다 대상을 정한다. 반대쪽에 적어도 같은 쌍으로 읽는다', () => {
    const plan = planOf([
      makeItem({ key: 'card', kind: 'home_feed_card' }),
      makeItem({ key: 'mission', kind: 'mission', links: ['card'] }),
      makeItem({ key: 'badge', kind: 'jam_badge', links: ['card'] }),
      makeItem({ key: 'collection', kind: 'collection_launch', links: ['card'] }),
    ])
    expect(plan.conflicts).toEqual([])
    expect(plan.fills.get('card')?.map((fill) => [fill.field, fill.mode, fill.targetItemIds])).toEqual([
      ['mission_id', 'single', ['mission']],
      ['badge_ids', 'append', ['badge']],
      ['item_book_id', 'single', ['collection']],
    ])
  })

  it('표에 없는 쌍(같은 종류끼리 등)은 그룹으로만 묶고 칸을 채우지 않는다', () => {
    const plan = planOf([makeItem({ key: 'a', kind: 'mission', links: ['b'] }), makeItem({ key: 'b', kind: 'mission' })])
    expect(plan.fills.size).toBe(0)
    expect(plan.conflicts).toEqual([])
  })

  it('덧붙이는 칸은 대상이 여럿이어도 충돌이 아니다', () => {
    const plan = planOf([
      makeItem({ key: 'mission', kind: 'mission', links: ['b1', 'b2'], resource: { reward_badge_ids: ['x'] } }),
      makeItem({ key: 'b1', kind: 'jam_badge' }),
      makeItem({ key: 'b2', kind: 'jam_badge' }),
    ])
    expect(plan.conflicts).toEqual([])
    expect(plan.fills.get('mission')?.[0].targetItemIds).toEqual(['b1', 'b2'])
  })

  it('단일 칸에 대상이 둘 이상이면 충돌이다', () => {
    const plan = planOf([
      makeItem({ key: 'card', kind: 'home_feed_card', links: ['m1', 'm2'] }),
      makeItem({ key: 'm1', kind: 'mission' }),
      makeItem({ key: 'm2', kind: 'mission' }),
    ])
    expect(plan.conflicts.map((conflict) => [conflict.itemId, conflict.code])).toEqual([['card', 'multiple_targets']])
    expect(plan.fills.has('card')).toBe(false)
  })

  it('resource에 같은 칸이 이미 있으면 충돌이다', () => {
    const plan = planOf([
      makeItem({ key: 'collection', kind: 'collection_launch', links: ['badge'], resource: { reward_badge_id: 'b-0' } }),
      makeItem({ key: 'badge', kind: 'jam_badge' }),
    ])
    expect(plan.conflicts.map((conflict) => conflict.code)).toEqual(['own_resource_field'])
  })

  it('드랍이 아이템을 직접 고르는데 컬렉션을 가리키면 충돌이고, 컬렉션 선택이면 칸을 채운다', () => {
    const direct = planOf([
      makeItem({ key: 'drop', kind: 'drop_schedule', links: ['collection'], resource: { badge_ids: ['b-0'] } }),
      makeItem({ key: 'collection', kind: 'collection_launch' }),
    ])
    expect(direct.conflicts.map((conflict) => conflict.code)).toEqual(['direct_selection'])

    const byCollection = planOf([
      makeItem({ key: 'drop', kind: 'drop_schedule', links: ['collection'], resource: { collection_ids: ['c-0'], badge_ids: [] } }),
      makeItem({ key: 'collection', kind: 'collection_launch' }),
    ])
    expect(byCollection.conflicts).toEqual([])
    expect(byCollection.fills.get('drop')?.[0]).toMatchObject({ field: 'collection_ids', mode: 'append', targetItemIds: ['collection'] })
  })
})

describe('cancelSetOf · 함께 취소할 항목(PRD §8.7)', () => {
  // 배지 ← 미션 ← 카드(카드가 미션을, 미션이 배지를 가리킨다)
  const chain = (status: { card?: string; mission?: string; badge?: string } = {}) => [
    makeItem({ key: 'card', kind: 'home_feed_card', status: status.card ?? 'scheduled', links: ['mission'], position: 1 }),
    makeItem({ key: 'mission', kind: 'mission', status: status.mission ?? 'scheduled', links: ['badge'], position: 2 }),
    makeItem({ key: 'badge', kind: 'jam_badge', status: status.badge ?? 'scheduled', position: 3 }),
  ]

  it('연결이 없는 항목은 자기 자신만 취소한다', () => {
    expect(cancelSetOf([makeItem({ key: 'solo', kind: 'home_feed_card', status: 'scheduled' })], 'solo')).toEqual({ cancelIds: ['solo'], blockers: [] })
  })

  it('항목을 직접 가리키는 예약됨 항목을 함께 취소한다(미션을 취소하면 그 미션을 여는 카드도)', () => {
    expect(cancelSetOf(chain(), 'mission')).toEqual({ cancelIds: ['card', 'mission'], blockers: [] })
  })

  it('다른 예약됨 항목을 거쳐 가리키는 항목도 따라간다', () => {
    expect(cancelSetOf(chain(), 'badge')).toEqual({ cancelIds: ['card', 'mission', 'badge'], blockers: [] })
  })

  it('가리키는 대상 쪽은 따라가지 않는다(카드를 취소해도 미션은 남는다)', () => {
    expect(cancelSetOf(chain(), 'card')).toEqual({ cancelIds: ['card'], blockers: [] })
  })

  it('어느 쪽 links에 적혔는지와 관계없이 종류 쌍으로 가리키는 쪽을 정한다', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'scheduled', position: 1 }),
      makeItem({ key: 'mission', kind: 'mission', status: 'scheduled', links: ['card'], position: 2 }), // 미션 쪽이 적었지만 가리키는 쪽은 카드다
    ]
    expect(cancelSetOf(items, 'mission')).toEqual({ cancelIds: ['card', 'mission'], blockers: [] })
    expect(cancelSetOf(items, 'card')).toEqual({ cancelIds: ['card'], blockers: [] })
  })

  it('게재 중인 항목이 가리키면 막는 항목이다. 그 너머는 따라가지 않는다', () => {
    const items = [...chain({ card: 'live', mission: 'scheduled' }), makeItem({ key: 'poster', kind: 'home_feed_card', status: 'scheduled', links: ['card'], position: 4 })]
    expect(cancelSetOf(items, 'mission')).toEqual({ cancelIds: ['mission'], blockers: [{ id: 'card', status: 'live' }] })
  })

  it('예약 등록이 진행 중인 항목도 막는 항목이다', () => {
    expect(cancelSetOf(chain({ card: 'preparing' }), 'mission')).toEqual({ cancelIds: ['mission'], blockers: [{ id: 'card', status: 'preparing' }] })
  })

  it('다른 예약됨 항목을 거쳐 가리키는 게재중 항목도 막는다', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'live', links: ['mission'], position: 1 }),
      makeItem({ key: 'mission', kind: 'mission', status: 'scheduled', links: ['badge'], position: 2 }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'scheduled', position: 3 }),
    ]
    expect(cancelSetOf(items, 'badge')).toEqual({ cancelIds: ['mission', 'badge'], blockers: [{ id: 'card', status: 'live' }] })
  })

  it.each(['arrived', 'reviewing', 'approved', 'ended', 'rejected', 'cancelled', 'failed'])('가리키는 항목이 %s이면 건드리지 않고 막지도 않는다', (status) => {
    expect(cancelSetOf(chain({ card: status }), 'mission')).toEqual({ cancelIds: ['mission'], blockers: [] })
  })

  it('건드리지 않는 항목 너머의 예약됨 항목은 따라가지 않는다', () => {
    const items = [
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'scheduled', links: ['mission'], position: 1 }),
      makeItem({ key: 'mission', kind: 'mission', status: 'ended', links: ['badge'], position: 2 }),
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'scheduled', position: 3 }),
    ]
    expect(cancelSetOf(items, 'badge')).toEqual({ cancelIds: ['badge'], blockers: [] })
  })

  it('표에 없는 쌍(같은 종류끼리)은 가리키는 관계가 아니라 건드리지 않는다', () => {
    const items = [
      makeItem({ key: 'a', kind: 'mission', status: 'scheduled', links: ['b'], position: 1 }),
      makeItem({ key: 'b', kind: 'mission', status: 'live', position: 2 }),
    ]
    expect(cancelSetOf(items, 'a')).toEqual({ cancelIds: ['a'], blockers: [] })
  })

  it('같은 항목을 여러 길로 가리켜도 한 번만 센다. 제출 순서로 돌려준다', () => {
    const items = [
      makeItem({ key: 'badge', kind: 'jam_badge', status: 'scheduled', position: 5 }),
      makeItem({ key: 'card', kind: 'home_feed_card', status: 'scheduled', links: ['mission', 'badge'], position: 3 }),
      makeItem({ key: 'mission', kind: 'mission', status: 'scheduled', links: ['badge'], position: 4 }),
    ]
    expect(cancelSetOf(items, 'badge')).toEqual({ cancelIds: ['card', 'mission', 'badge'], blockers: [] })
  })

  it('묶음에 없는 항목이면 빈 결과다. 입력을 바꾸지 않는다', () => {
    const items = chain()
    const before = JSON.stringify(items)
    expect(cancelSetOf(items, 'nope')).toEqual({ cancelIds: [], blockers: [] })
    expect(JSON.stringify(items)).toBe(before)
  })
})

describe('pointingLiveOf · 지금 종료가 알릴 항목(PRD §8.7)', () => {
  const items = () => [
    makeItem({ key: 'card', kind: 'home_feed_card', status: 'live', links: ['mission'], position: 1 }),
    makeItem({ key: 'mission', kind: 'mission', status: 'live', links: ['badge'], position: 2 }),
    makeItem({ key: 'badge', kind: 'jam_badge', status: 'live', position: 3 }),
  ]

  it('이 항목을 직접 가리키는 게재 중 항목만 돌려준다. 다른 항목을 거쳐 가리키는 항목과 이 항목이 가리키는 항목은 뺀다', () => {
    expect(idsOf(pointingLiveOf(items(), 'mission'))).toEqual(['card'])
    expect(idsOf(pointingLiveOf(items(), 'badge'))).toEqual(['mission'])
    expect(pointingLiveOf(items(), 'card')).toEqual([])
  })

  it('예약됨·종료·반려 같은 게재 중이 아닌 항목은 넣지 않는다', () => {
    for (const status of ['scheduled', 'ended', 'rejected', 'cancelled', 'preparing', 'approved']) {
      const list = items().map((item) => (item.id === 'card' ? { ...item, status } : item))
      expect(pointingLiveOf(list, 'mission'), status).toEqual([])
    }
  })

  it('표에 없는 쌍(같은 종류끼리)은 가리키는 관계가 아니다', () => {
    const list = [
      makeItem({ key: 'a', kind: 'mission', status: 'live', links: ['b'], position: 1 }),
      makeItem({ key: 'b', kind: 'mission', status: 'live', position: 2 }),
    ]
    expect(pointingLiveOf(list, 'b')).toEqual([])
  })

  it('가리키는 항목이 여럿이면 제출 순서로 돌려준다. 묶음에 없는 항목이면 빈 결과이고 입력을 바꾸지 않는다', () => {
    const list = [
      makeItem({ key: 'mission', kind: 'mission', status: 'live', position: 9 }),
      makeItem({ key: 'cardB', kind: 'home_feed_card', status: 'live', links: ['mission'], position: 5 }),
      makeItem({ key: 'cardA', kind: 'home_feed_card', status: 'live', links: ['mission'], position: 4 }),
    ]
    const before = JSON.stringify(list)
    expect(idsOf(pointingLiveOf(list, 'mission'))).toEqual(['cardA', 'cardB'])
    expect(pointingLiveOf(list, 'nope')).toEqual([])
    expect(JSON.stringify(list)).toBe(before)
  })
})
