import {
  ITEM_BOOK_REFERENCE_SOURCES,
  TRIBE_REFERENCE_SOURCES,
  classifyReferenceDeletion,
  collectItemBookReferences,
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

describe('트라이브 삭제 보호 — 미션 참가 대상 (티켓 20261019_1318 2회)', () => {
  it('mission_allowed_tribes(FK RESTRICT)는 삭제를 막는 참조이고, 챕터 이름 표(chapter_names)는 보호 목록에 없다(티켓 20261021_1539)', () => {
    expect(TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'mission_allowed_tribes')).toMatchObject({
      location: 'mission_allowed_tribes.tribe_id',
      blocks: true,
    })
    expect(TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'chapter_names')).toBeUndefined()
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

  it('챕터 이름 표는 읽지 않는다(표가 남아 있어도 참조 조회에 들어가지 않는다)', async () => {
    const supabase = createStubSupabase({ chapter_names: [{ tribe_id: 't1', chapter_no: 1 }] }, 'chapter_names')
    const { counts, error } = await collectTribeReferences(supabase, ['t1'])
    expect(error).toBeNull()
    expect(Object.keys(counts.get('t1')!)).not.toContain('chapter_names')
  })

  it('mission_allowed_tribes 조회가 실패하면 error를 채운다(fail-closed)', async () => {
    const { error } = await collectTribeReferences(createStubSupabase({}, 'mission_allowed_tribes'), ['t1'])
    expect(error).toContain('mission_allowed_tribes')
  })
})

describe('트라이브 삭제 보호 — 어드민 트라이브 변경 이력 (티켓 20261021_1247 2회)', () => {
  it('user_tribe_changes(FK NO ACTION)는 삭제를 막는 참조다', () => {
    expect(TRIBE_REFERENCE_SOURCES.find((s) => s.key === 'user_tribe_changes')).toMatchObject({
      label: '트라이브 변경 이력',
      location: 'user_tribe_changes.from_tribe_id / to_tribe_id',
      blocks: true,
    })
  })

  it('이력의 «바뀌기 전»이나 «바뀐» 트라이브로 남아 있으면 삭제가 막히고 사유에 이력 건수가 나온다', async () => {
    const supabase = createStubSupabase({
      user_tribe_changes: [
        { from_tribe_id: 't1', to_tribe_id: 't2' },
        { from_tribe_id: 't3', to_tribe_id: 't1' },
        { from_tribe_id: 't3', to_tribe_id: 't2' },
      ],
    })
    const { counts, error } = await collectTribeReferences(supabase, ['t1', 't2', 't4'])
    expect(error).toBeNull()
    expect(counts.get('t1')?.user_tribe_changes).toBe(2) // 한 건은 from, 한 건은 to
    expect(counts.get('t2')?.user_tribe_changes).toBe(2)
    expect(counts.get('t4')?.user_tribe_changes).toBe(0)

    const { deletable, skipped } = classifyReferenceDeletion(
      ['t1', 't2', 't4'],
      counts,
      TRIBE_REFERENCE_SOURCES,
      (summary) => `연결된 참조 ${summary.blockingTotal}건(${summary.hitLabels})`
    )
    expect(deletable).toEqual(['t4'])
    expect(skipped.map((x) => x.id)).toEqual(['t1', 't2'])
    expect(skipped[0].reason).toContain('트라이브 변경 이력 2건')
  })

  it('이력 조회가 실패하면 열마다 error를 채운다(fail-closed — 삭제를 진행하지 않는다)', async () => {
    const { error } = await collectTribeReferences(createStubSupabase({}, 'user_tribe_changes'), ['t1'])
    expect(error).toContain('user_tribe_changes(from_tribe_id)')
    expect(error).toContain('user_tribe_changes(to_tribe_id)')
  })

  it('이력이 없는 트라이브는 막는 참조가 0이다', async () => {
    const { counts } = await collectTribeReferences(createStubSupabase({}), ['t1'])
    const summary = summarizeReference(TRIBE_REFERENCE_SOURCES, counts.get('t1')!)
    expect(summary.blockingTotal).toBe(0)
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

describe('fetchTribeListCounts — 목록의 막는 참조 건수에 트라이브 변경 이력이 들어간다 (티켓 20261021_1247 2회)', () => {
  /** `select().in().order().range()` 체인만 흉내 내는 스텁(`countRowsByKey`가 쓰는 모양) */
  function changesStub(rows: Row[]) {
    return {
      from(table: string) {
        const source = table === 'user_tribe_changes' ? rows : []
        const filters: Array<(r: Row) => boolean> = []
        const builder: Record<string, unknown> = {
          select: () => builder,
          is: () => builder,
          eq: () => builder,
          in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
          order: () => builder,
          range: async (from: number, to: number) => ({ data: source.filter((r) => filters.every((f) => f(r))).slice(from, to + 1), error: null }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
        }
        return builder
      },
    } as unknown as Parameters<typeof fetchTribeListCounts>[0]
  }

  it('두 열 어느 쪽이든 대상 트라이브를 가리키면 그 트라이브의 건수로 센다', async () => {
    const { blockingCounts } = await fetchTribeListCounts(
      changesStub([
        { id: 'c1', from_tribe_id: 't1', to_tribe_id: 't2' },
        { id: 'c2', from_tribe_id: 't3', to_tribe_id: 't1' },
      ]),
      ['t1', 't2', 't4']
    )
    expect(blockingCounts.t1.user_tribe_changes).toBe(2)
    expect(blockingCounts.t2.user_tribe_changes).toBe(1)
    expect(blockingCounts.t4.user_tribe_changes).toBe(0)
    expect(tribeDeleteBlockReason(blockingCounts.t1)).toContain('트라이브 변경 이력 2건')
    expect(tribeDeleteBlockReason(blockingCounts.t4)).toBeNull()
  })
})

describe('tribeDeleteBlockReason — 목록의 "삭제 불가 사유" 칸', () => {
  it('막는 참조가 없으면 null이다', () => {
    expect(tribeDeleteBlockReason({ tribe_adjacency: 0, users: 0 })).toBeNull()
  })

  it('막는 참조만 건수와 함께 나열한다(소속 배지·컬렉션은 넣지 않는다)', () => {
    const reason = tribeDeleteBlockReason({ users: 3, user_tribe_changes: 12, badges: 40, item_books: 5 })
    expect(reason).toContain('이 트라이브를 고른 유저 3명')
    expect(reason).toContain('트라이브 변경 이력 12건')
    expect(reason).not.toContain('소속')
  })
})

describe('옛 드랍 엔진의 user_drop_state 열은 삭제를 막는 참조가 아니다 (티켓 20261022_0938 2회)', () => {
  it('트라이브·컬렉션의 참조 목록에 user_drop_state가 없다', () => {
    expect(TRIBE_REFERENCE_SOURCES.map((s) => s.key)).not.toContain('user_drop_state')
    expect(ITEM_BOOK_REFERENCE_SOURCES.map((s) => s.key)).not.toContain('user_drop_state')
    expect(TRIBE_REFERENCE_SOURCES.map((s) => s.location).join(' ')).not.toContain('user_drop_state')
    expect(ITEM_BOOK_REFERENCE_SOURCES.map((s) => s.location).join(' ')).not.toContain('user_drop_state')
  })

  it('트라이브·컬렉션 참조를 모을 때 user_drop_state를 열지 않는다(열이 지워져도 조회 오류가 나지 않는다)', async () => {
    const opened: string[] = []
    const supabase = {
      from(table: string) {
        opened.push(table)
        return { select: () => ({ in: () => ({ range: async () => ({ data: [], error: null }) }) }) }
      },
    }
    const tribes = await collectTribeReferences(supabase as unknown as Parameters<typeof collectTribeReferences>[0], ['t1'])
    const books = await collectItemBookReferences(supabase as unknown as Parameters<typeof collectItemBookReferences>[0], ['b1'])
    expect(tribes.error).toBeNull()
    expect(books.error).toBeNull()
    expect(opened).not.toContain('user_drop_state')
    expect(opened.length).toBeGreaterThan(0)
  })

  it('목록 건수에서도 user_drop_state를 세지 않는다', async () => {
    const opened: string[] = []
    const builder = (table: string) => {
      opened.push(table)
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        eq: () => b,
        is: () => b,
        order: () => b,
        range: async () => ({ data: [], error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
      }
      return b
    }
    const { blockingCounts } = await fetchTribeListCounts(
      { from: builder } as unknown as Parameters<typeof fetchTribeListCounts>[0],
      ['t1']
    )
    expect(opened).not.toContain('user_drop_state')
    expect(Object.keys(blockingCounts.t1)).not.toContain('user_drop_state')
  })
})
