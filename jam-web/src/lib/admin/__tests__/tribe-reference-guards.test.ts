import {
  TRIBE_REFERENCE_SOURCES,
  classifyReferenceDeletion,
  collectTribeReferences,
  summarizeReference,
} from '../reference-guards'
import { tribeDeleteBlockReason } from '../tribe-list'

type Row = Record<string, unknown>

/** `from(table).select(col).in(col, ids).range(a, b)` 체인만 흉내 내는 스텁 */
function createStubSupabase(tables: Record<string, Row[]>, failTable?: string) {
  return {
    from(table: string) {
      return {
        select: () => ({
          in: (column: string, ids: string[]) => ({
            range: async (from: number, to: number) => {
              if (table === failTable) return { data: null, error: { message: `${table} 실패` } }
              const rows = (tables[table] ?? []).filter((r) => ids.includes(String(r[column])))
              return { data: rows.slice(from, to + 1), error: null }
            },
          }),
        }),
      }
    },
  } as unknown as Parameters<typeof collectTribeReferences>[0]
}

describe('트라이브 삭제 보호 — users.tribe_id (티켓 20260924_0945)', () => {
  it('users.tribe_id는 삭제를 막는 참조다', () => {
    const source = TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'users')
    expect(source).toMatchObject({ location: 'users.tribe_id', blocks: true })
  })

  it('유저가 고른 트라이브는 삭제가 막히고 사유에 유저 수가 나온다', async () => {
    const supabase = createStubSupabase({
      users: [
        { tribe_id: 't1' },
        { tribe_id: 't1' },
        { tribe_id: 't1' },
        { tribe_id: 't2' },
      ],
    })
    const { counts, error } = await collectTribeReferences(supabase, ['t1', 't3'])
    expect(error).toBeNull()
    expect(counts.get('t1')?.users).toBe(3)
    expect(counts.get('t3')?.users).toBe(0)

    const { deletable, skipped } = classifyReferenceDeletion(
      ['t1', 't3'],
      counts,
      TRIBE_REFERENCE_SOURCES,
      (summary) => `연결된 참조 ${summary.blockingTotal}건(${summary.hitLabels})`
    )
    expect(deletable).toEqual(['t3'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].id).toBe('t1')
    expect(skipped[0].reason).toContain('이 트라이브를 고른 유저 3명')
  })

  it('유저 조회가 실패하면 error를 채운다(fail-closed — 삭제를 진행하지 않는다)', async () => {
    const supabase = createStubSupabase({}, 'users')
    const { error } = await collectTribeReferences(supabase, ['t1'])
    expect(error).toContain('users')
  })

  it('소속 배지·컬렉션(SET NULL)만 있으면 삭제를 막지 않는다', async () => {
    const supabase = createStubSupabase({ badges: [{ tribe_id: 't1' }], item_books: [{ tribe_id: 't1' }] })
    const { counts } = await collectTribeReferences(supabase, ['t1'])
    const summary = summarizeReference(TRIBE_REFERENCE_SOURCES, counts.get('t1')!)
    expect(summary.blockingTotal).toBe(0)
    expect(summary.total).toBe(2)
  })
})

describe('tribeDeleteBlockReason — 목록의 "삭제 불가 사유" 칸', () => {
  it('막는 참조가 없으면 null이다', () => {
    expect(tribeDeleteBlockReason({ tribe_adjacency: 0, user_drop_state: 0, users: 0 })).toBeNull()
  })

  it('막는 참조만 건수와 함께 나열한다(소속 배지·컬렉션은 넣지 않는다)', () => {
    const reason = tribeDeleteBlockReason({ users: 3, user_drop_state: 12, badges: 40, item_books: 5 })
    expect(reason).toContain('이 트라이브를 고른 유저 3명')
    expect(reason).toContain('유저 드랍 상태(최근 드랍 계열) 12건')
    expect(reason).not.toContain('소속')
  })
})
