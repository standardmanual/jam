import {
  TRIBE_REFERENCE_SOURCES,
  classifyReferenceDeletion,
  collectTribeReferences,
  summarizeReference,
} from '../reference-guards'
import { fetchTribeListCounts, tribeDeleteBlockReason } from '../tribe-list'

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

describe('트라이브 삭제 보호 — 미션 참가 대상과 챕터 이름 (티켓 20261019_1318 2회)', () => {
  it('mission_allowed_tribes(FK RESTRICT)는 삭제를 막는 참조이고, chapter_names(CASCADE 설정값)는 안내만이다', () => {
    expect(TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'mission_allowed_tribes')).toMatchObject({
      location: 'mission_allowed_tribes.tribe_id',
      blocks: true,
    })
    expect(TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'chapter_names')).toMatchObject({
      location: 'chapter_names.tribe_id',
      blocks: false,
    })
  })

  it('참가 대상으로 둔 미션이 있는 트라이브는 삭제가 막히고 사유에 미션 수가 나온다', async () => {
    const supabase = createStubSupabase({
      mission_allowed_tribes: [
        { mission_id: 'm1', tribe_id: 't1' },
        { mission_id: 'm2', tribe_id: 't1' },
      ],
    })
    const { counts, error } = await collectTribeReferences(supabase, ['t1', 't2'])
    expect(error).toBeNull()
    expect(counts.get('t1')?.mission_allowed_tribes).toBe(2)
    expect(counts.get('t2')?.mission_allowed_tribes).toBe(0)

    const { deletable, skipped } = classifyReferenceDeletion(
      ['t1', 't2'],
      counts,
      TRIBE_REFERENCE_SOURCES,
      (summary) => `연결된 참조 ${summary.blockingTotal}건(${summary.hitLabels})`
    )
    expect(deletable).toEqual(['t2'])
    expect(skipped[0].reason).toContain('참가 대상으로 둔 미션 2건')
  })

  it('챕터 이름만 있으면 삭제를 막지 않는다(안내 문구에는 들어간다)', async () => {
    const supabase = createStubSupabase({
      chapter_names: [
        { tribe_id: 't1', chapter_no: 1 },
        { tribe_id: 't1', chapter_no: 2 },
      ],
    })
    const { counts } = await collectTribeReferences(supabase, ['t1'])
    const summary = summarizeReference(TRIBE_REFERENCE_SOURCES, counts.get('t1')!)
    expect(summary.blockingTotal).toBe(0)
    expect(summary.noticeLabels).toBe('챕터 이름 2건')
  })

  it.each(['mission_allowed_tribes', 'chapter_names'])('%s 조회가 실패하면 error를 채운다(fail-closed)', async (table) => {
    const { error } = await collectTribeReferences(createStubSupabase({}, table), ['t1'])
    expect(error).toContain(table)
  })
})

describe('fetchTribeListCounts — 목록의 막는 참조 건수에 참가 대상 미션이 들어간다', () => {
  /** 목록 집계가 쓰는 모양(`select().in().order().range()`, `select()` 전체, `select(.., {head}).eq()`)만 흉내 내는 스텁 */
  function listStub(tables: Record<string, Row[]>) {
    return {
      from(table: string) {
        const rows = tables[table] ?? []
        const filters: Array<(r: Row) => boolean> = []
        let head = false
        const apply = () => rows.filter((r) => filters.every((f) => f(r)))
        const builder: Record<string, unknown> = {
          select: (_cols: string, options?: { head?: boolean }) => {
            head = Boolean(options?.head)
            return builder
          },
          is: (column: string, value: unknown) => (filters.push((r) => (r[column] ?? null) === value), builder),
          in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
          eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), builder),
          order: () => builder,
          range: async (from: number, to: number) => ({ data: apply().slice(from, to + 1), error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(head ? { count: apply().length, error: null } : { data: apply(), error: null }).then(resolve),
        }
        return builder
      },
    } as unknown as Parameters<typeof fetchTribeListCounts>[0]
  }

  it('참가 대상으로 둔 미션 수를 blockingCounts에 담고, 삭제 불가 사유 문구에 나온다', async () => {
    const supabase = listStub({
      mission_allowed_tribes: [
        { mission_id: 'm1', tribe_id: 't1' },
        { mission_id: 'm2', tribe_id: 't1' },
        { mission_id: 'm3', tribe_id: 't2' },
      ],
    })
    const { blockingCounts } = await fetchTribeListCounts(supabase, ['t1', 't2', 't3'])
    expect(blockingCounts.t1.mission_allowed_tribes).toBe(2)
    expect(blockingCounts.t2.mission_allowed_tribes).toBe(1)
    expect(blockingCounts.t3.mission_allowed_tribes).toBe(0)
    expect(tribeDeleteBlockReason(blockingCounts.t1)).toContain('참가 대상으로 둔 미션 2건')
    expect(tribeDeleteBlockReason(blockingCounts.t3)).toBeNull()
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
