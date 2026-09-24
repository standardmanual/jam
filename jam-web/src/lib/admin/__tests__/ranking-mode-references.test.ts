/**
 * ranking-mode-references.ts — 랭킹 규칙을 쓰는 활성·미종료 투데이 카드 집계 유닛테스트
 * (티켓 20260924_0947)
 */
import { describe, it, expect } from 'vitest'
import {
  fetchLiveCardsByMode,
  formatRankingModeBlockedMessage,
  groupLiveCardsByMode,
  isLiveCard,
  type RankingModeReferenceClient,
  type RankingModeReferenceQuery,
} from '../ranking-mode-references'

const NOW = new Date('2026-09-24T03:00:00.000Z')
const FUTURE = '2026-10-01T00:00:00.000Z'
const PAST = '2026-09-01T00:00:00.000Z'

type Card = Parameters<typeof groupLiveCardsByMode>[0][number]

const card = (id: string, modeId: string | null, isActive: boolean, endsAt: string): Card => ({
  id,
  title: `카드 ${id}`,
  ranking_mode_id: modeId,
  is_active: isActive,
  ends_at: endsAt,
})

describe('isLiveCard', () => {
  it('활성이고 종료 시각이 지나지 않은 카드만 참이다', () => {
    expect(isLiveCard({ is_active: true, ends_at: FUTURE }, NOW)).toBe(true)
    expect(isLiveCard({ is_active: false, ends_at: FUTURE }, NOW)).toBe(false)
    expect(isLiveCard({ is_active: true, ends_at: PAST }, NOW)).toBe(false)
    expect(isLiveCard({ is_active: true, ends_at: NOW.toISOString() }, NOW)).toBe(false)
  })
})

describe('groupLiveCardsByMode', () => {
  it('활성·미종료 카드만 규칙별로 센다', () => {
    const grouped = groupLiveCardsByMode(
      [
        card('a', 'm1', true, FUTURE),
        card('b', 'm1', true, FUTURE),
        card('c', 'm1', false, FUTURE), // 비활성 — 세지 않음
        card('d', 'm1', true, PAST), // 이미 종료 — 세지 않음
        card('e', 'm2', true, FUTURE),
        card('f', null, true, FUTURE), // 규칙 없는 카드
      ],
      NOW
    )

    expect(grouped.get('m1')?.map((c) => c.id)).toEqual(['a', 'b'])
    expect(grouped.get('m2')?.map((c) => c.id)).toEqual(['e'])
    expect(grouped.size).toBe(2)
  })
})

/** PostgREST 흉내 스텁 — 조건을 실제로 걸러 주어, 조회 조건이 빠지면 테스트가 깨지게 한다 */
function createStubClient(rows: Card[]) {
  const calls: { inValues: string[]; range: [number, number] }[] = []
  const client: RankingModeReferenceClient = {
    from: () => ({
      select: () => {
        let onlyActive = false
        let endsAfter = ''
        let inValues: string[] = []
        const query: RankingModeReferenceQuery = {
          eq: (column, value) => {
            if (column === 'is_active' && value === true) onlyActive = true
            return query
          },
          gt: (column, value) => {
            if (column === 'ends_at') endsAfter = value
            return query
          },
          in: (_column, values) => {
            inValues = values
            return query
          },
          order: () => query,
          range: async (from, to) => {
            calls.push({ inValues: [...inValues], range: [from, to] })
            const filtered = rows
              .filter((r) => r.ranking_mode_id && inValues.includes(r.ranking_mode_id))
              .filter((r) => !onlyActive || r.is_active)
              .filter((r) => !endsAfter || new Date(r.ends_at) > new Date(endsAfter))
            return { data: filtered.slice(from, to + 1) as unknown as Record<string, unknown>[], error: null }
          },
        }
        return query
      },
    }),
  }
  return { client, calls }
}

describe('fetchLiveCardsByMode', () => {
  it('요청한 규칙 ID가 전부 키로 있고, 쓰는 카드가 없으면 빈 배열이다', async () => {
    const { client } = createStubClient([card('a', 'm1', true, FUTURE)])
    const result = await fetchLiveCardsByMode(client, ['m1', 'm2'], NOW)

    expect(result.get('m1')).toEqual([{ id: 'a', title: '카드 a' }])
    expect(result.get('m2')).toEqual([])
  })

  it('비활성·종료된 카드는 조회 조건에서 걸러 세지 않는다', async () => {
    const { client } = createStubClient([
      card('live', 'm1', true, FUTURE),
      card('off', 'm1', false, FUTURE),
      card('done', 'm1', true, PAST),
    ])
    const result = await fetchLiveCardsByMode(client, ['m1'], NOW)

    expect(result.get('m1')?.map((c) => c.id)).toEqual(['live'])
  })

  it('규칙 ID가 없으면 조회하지 않는다', async () => {
    const { client, calls } = createStubClient([])
    const result = await fetchLiveCardsByMode(client, [], NOW)

    expect(result.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('규칙 ID를 200개씩 나눠 조회하고 결과를 합친다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `m${i}`)
    const { client, calls } = createStubClient([card('first', 'm0', true, FUTURE), card('last', 'm449', true, FUTURE)])
    const result = await fetchLiveCardsByMode(client, ids, NOW)

    expect(calls.map((c) => c.inValues.length)).toEqual([200, 200, 50])
    expect(result.get('m0')?.map((c) => c.id)).toEqual(['first'])
    expect(result.get('m449')?.map((c) => c.id)).toEqual(['last'])
  })

  it('조회가 실패하면 throw한다(삭제 보호가 fail-closed로 다루도록)', async () => {
    const failing: RankingModeReferenceClient = {
      from: () => ({
        select: () => {
          const query: RankingModeReferenceQuery = {
            eq: () => query,
            gt: () => query,
            in: () => query,
            order: () => query,
            range: async () => ({ data: null, error: { message: 'boom' } }),
          }
          return query
        },
      }),
    }

    await expect(fetchLiveCardsByMode(failing, ['m1'], NOW)).rejects.toThrow('boom')
  })
})

describe('formatRankingModeBlockedMessage', () => {
  it('건수와 카드 제목을 안내한다', () => {
    const message = formatRankingModeBlockedMessage([
      { id: 'a', title: '이주의 챔피언' },
      { id: 'b', title: '주말 라이딩' },
    ])

    expect(message).toContain('2건')
    expect(message).toContain('"이주의 챔피언", "주말 라이딩"')
  })

  it('제목은 5개까지만 적고 나머지는 건수로 줄인다', () => {
    const cards = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, title: `카드${i}` }))
    const message = formatRankingModeBlockedMessage(cards)

    expect(message).toContain('7건')
    expect(message).toContain('"카드4" 외 2건')
    expect(message).not.toContain('카드5')
  })
})
