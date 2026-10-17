import {
  ITEM_BOOK_REFERENCE_SOURCES,
  classifyReferenceDeletion,
  collectItemBookReferences,
  summarizeReference,
} from '../reference-guards'

/**
 * 컬렉션 삭제 가드 — 등급별 완성 기록(티켓 20261016_2340 3회-나).
 * `user_item_book_tier_completions`는 컬렉션 삭제 시 CASCADE라, 가드에 없으면 유저의 등급별 완성 기록이
 * 조용히 사라진다. 그래서 삭제를 막는 참조로 센다.
 */

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
  } as unknown as Parameters<typeof collectItemBookReferences>[0]
}

describe('컬렉션 삭제 보호 — user_item_book_tier_completions', () => {
  it('등급별 완성 기록은 삭제를 막는 참조(CASCADE)다', () => {
    const source = ITEM_BOOK_REFERENCE_SOURCES.find((s) => s.key === 'user_item_book_tier_completions')
    expect(source).toMatchObject({ location: 'user_item_book_tier_completions.item_book_id', blocks: true })
  })

  it('등급별 완성 기록이 있는 컬렉션은 삭제가 막히고 사유에 기록 건수가 나온다', async () => {
    const supabase = createStubSupabase({
      user_item_book_tier_completions: [
        { item_book_id: 'b1', tier: 'common' },
        { item_book_id: 'b1', tier: 'rare' },
        { item_book_id: 'b2', tier: 'common' },
      ],
    })
    const { counts, error } = await collectItemBookReferences(supabase, ['b1', 'b3'])
    expect(error).toBeNull()
    expect(counts.get('b1')?.user_item_book_tier_completions).toBe(2)
    expect(counts.get('b3')?.user_item_book_tier_completions).toBe(0)

    const { deletable, skipped } = classifyReferenceDeletion(
      ['b1', 'b3'],
      counts,
      ITEM_BOOK_REFERENCE_SOURCES,
      (summary) => `${summary.blockingTotal}건(${summary.hitLabels})`
    )
    expect(deletable).toEqual(['b3'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].id).toBe('b1')
    expect(skipped[0].reason).toContain('컬렉션 등급별 완성 기록')
  })

  it('다른 막는 참조(옛 완성 기록)의 집계는 그대로다', async () => {
    const supabase = createStubSupabase({
      user_item_book_completions: [{ item_book_id: 'b1' }],
      user_item_book_slots: [{ item_book_id: 'b1' }, { item_book_id: 'b1' }],
    })
    const { counts } = await collectItemBookReferences(supabase, ['b1'])
    expect(counts.get('b1')).toMatchObject({
      user_item_book_slots: 2,
      user_item_book_completions: 1,
      user_item_book_tier_completions: 0,
    })
    expect(summarizeReference(ITEM_BOOK_REFERENCE_SOURCES, counts.get('b1')!).blockingTotal).toBe(3)
  })

  it('등급별 완성 기록 조회가 실패하면 error를 채운다(fail-closed — 삭제를 진행하지 않는다)', async () => {
    const supabase = createStubSupabase({}, 'user_item_book_tier_completions')
    const { error } = await collectItemBookReferences(supabase, ['b1'])
    expect(error).toContain('user_item_book_tier_completions')
  })
})
