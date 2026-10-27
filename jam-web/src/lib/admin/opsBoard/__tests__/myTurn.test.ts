/**
 * 내 차례 카드 계산 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §6.1)
 *
 * 지키는 것: 카드 종류(결정 필요·문제), 마감(수요일 18:00 KST), 이유 칩(최대 3개), 정렬(문제 → 결정 필요),
 * 루틴 멈춤 카드, 시험 묶음 제외, 카드 수.
 */
import { describe, expect, it } from 'vitest'
import { computeMyTurn, decisionDeadlineIso, myTurnCount } from '@/lib/admin/opsBoard/myTurn'
import { NOW, makeBundle, makeItem, makeStart } from './fixtures'

describe('결정 필요 카드', () => {
  it('도착·검토중 항목이 있는 묶음마다 한 장이고 건수는 그 항목 수다', () => {
    const bundle = makeBundle({ id: 'b1', title: 'LP 리바이벌', statuses: ['arrived', 'reviewing', 'scheduled', 'rejected'] })
    const cards = computeMyTurn({ bundles: [bundle], starts: [], now: NOW })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ kind: 'decide', reason: 'items', title: 'LP 리바이벌', count: 2, href: '/admin/ops-inbox/b1' })
  })

  it('결정 전 항목이 없는 묶음은 카드가 없다', () => {
    const cards = computeMyTurn({ bundles: [makeBundle({ statuses: ['scheduled', 'live', 'ended', 'rejected'] })], starts: [], now: NOW })
    expect(cards).toEqual([])
  })

  it('패턴 제안도 결정할 항목이라 센다', () => {
    const bundle = makeBundle({ statuses: ['arrived'] })
    bundle.items.push(makeItem('arrived', { bundleId: bundle.id, kind: 'pattern_proposal' }))
    expect(computeMyTurn({ bundles: [bundle], starts: [], now: NOW })[0].count).toBe(2)
  })

  it('마감은 그 묶음 주의 수요일 18:00 KST다', () => {
    const bundle = makeBundle({ week: '2026-W44', statuses: ['arrived'] })
    const [card] = computeMyTurn({ bundles: [bundle], starts: [], now: NOW })
    expect(card.deadlineIso).toBe('2026-10-28T09:00:00.000Z')
    expect(decisionDeadlineIso({ week: '2026-W43', receivedAt: '2026-10-20T00:00:00Z' })).toBe('2026-10-21T09:00:00.000Z')
  })

  it('제목이 없으면 주차로 이름을 붙인다', () => {
    const [card] = computeMyTurn({ bundles: [makeBundle({ week: '2026-W44', title: null, statuses: ['arrived'] })], starts: [], now: NOW })
    expect(card.title).toBe('2026-W44 기획')
  })

  it('이유 칩은 종류별로 세어 많은 순 최대 3개다', () => {
    const bundle = makeBundle()
    bundle.items = [
      makeItem('arrived', { bundleId: bundle.id, rationaleKinds: ['trend', 'season'] }),
      makeItem('reviewing', { bundleId: bundle.id, rationaleKinds: ['trend', 'weather'] }),
      makeItem('arrived', { bundleId: bundle.id, rationaleKinds: ['signal', 'trend'] }),
      makeItem('scheduled', { bundleId: bundle.id, rationaleKinds: ['pattern', 'pattern', 'pattern'] }), // 결정 전이 아니라 세지 않는다
    ]
    const [card] = computeMyTurn({ bundles: [bundle], starts: [], now: NOW })
    expect(card.reasonChips).toEqual([
      { kind: 'trend', count: 3 },
      { kind: 'season', count: 1 },
      { kind: 'weather', count: 1 },
    ])
  })

  it('이유가 없으면 칩은 빈 배열이다', () => {
    expect(computeMyTurn({ bundles: [makeBundle({ statuses: ['arrived'] })], starts: [], now: NOW })[0].reasonChips).toEqual([])
  })
})

describe('문제 카드', () => {
  it('실패 항목이 있는 묶음마다 한 장이고 건수는 실패 항목 수다', () => {
    const bundle = makeBundle({ id: 'b2', statuses: ['scheduled', 'failed', 'failed'] })
    const cards = computeMyTurn({ bundles: [bundle], starts: [], now: NOW })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ kind: 'problem', reason: 'failed_items', count: 2, deadlineIso: null, href: '/admin/ops-inbox/b2' })
  })

  it('한 묶음에 결정 전 항목과 실패 항목이 같이 있으면 두 장이다', () => {
    const cards = computeMyTurn({ bundles: [makeBundle({ statuses: ['arrived', 'failed'] })], starts: [], now: NOW })
    expect(cards.map((c) => c.kind)).toEqual(['problem', 'decide'])
  })

  it('멈춘 루틴 시작 기록마다 한 장이고 제목은 「루틴이 멈췄어요」, 건수는 1이다', () => {
    const stalled = makeStart({ id: 's1', startedAt: '2026-10-28T08:00:00+09:00' })
    const cards = computeMyTurn({ bundles: [], starts: [stalled], now: NOW })
    expect(cards).toEqual([
      { id: 'stalled:s1', kind: 'problem', reason: 'routine_stalled', title: '루틴이 멈췄어요', count: 1, deadlineIso: null, reasonChips: [], href: '/admin/ops-inbox' },
    ])
  })

  it('3시간이 안 됐거나 묶음과 이어진 시작 기록은 카드가 없다', () => {
    const fresh = makeStart({ startedAt: '2026-10-28T11:00:00+09:00' })
    const linked = makeStart({ startedAt: '2026-10-28T01:00:00+09:00', bundleId: 'b1' })
    expect(computeMyTurn({ bundles: [], starts: [fresh, linked], now: NOW })).toEqual([])
  })
})

describe('정렬', () => {
  it('문제가 먼저, 결정 필요는 마감이 이른 순, 문제는 최근 순이다', () => {
    const decideLate = makeBundle({ id: 'late', week: '2026-W44', statuses: ['arrived'] })
    const decideEarly = makeBundle({ id: 'early', week: '2026-W43', statuses: ['arrived'] })
    const failedOld = makeBundle({ id: 'failed-old', receivedAt: '2026-10-20T10:00:00+09:00', week: '2026-W43', statuses: ['failed'] })
    const failedNew = makeBundle({ id: 'failed-new', receivedAt: '2026-10-27T10:00:00+09:00', statuses: ['failed'] })
    const stalled = makeStart({ id: 'st', startedAt: '2026-10-28T08:00:00+09:00' })
    const cards = computeMyTurn({ bundles: [decideLate, decideEarly, failedOld, failedNew], starts: [stalled], now: NOW })
    expect(cards.map((c) => c.id)).toEqual(['stalled:st', 'failed:failed-new', 'failed:failed-old', 'decide:early', 'decide:late'])
  })
})

describe('시험 묶음', () => {
  const sample = makeBundle({ isSample: true, statuses: ['arrived', 'failed'] })

  it('기본은 카드가 없다', () => {
    expect(computeMyTurn({ bundles: [sample], starts: [], now: NOW })).toEqual([])
  })

  it('includeSample이면 카드가 있다', () => {
    expect(computeMyTurn({ bundles: [sample], starts: [], now: NOW, includeSample: true })).toHaveLength(2)
  })
})

describe('myTurnCount', () => {
  it('카드 수다', () => {
    const cards = computeMyTurn({ bundles: [makeBundle({ statuses: ['arrived', 'failed'] })], starts: [makeStart({ startedAt: '2026-10-28T08:00:00+09:00' })], now: NOW })
    expect(myTurnCount(cards)).toBe(3)
    expect(myTurnCount([])).toBe(0)
  })
})
