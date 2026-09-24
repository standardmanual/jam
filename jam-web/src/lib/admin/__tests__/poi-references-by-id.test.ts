import { collectPoiReferencesById } from '../poi-references'

/**
 * `collectPoiReferencesById`의 절반씩 나눠 찾기(binary narrowing) 전용 스텁 — 참조 6개
 * 테이블 중 `poi_drops`만 실제 값을 갖게 하고 나머지는 항상 0건으로 둔다(판정 로직은
 * `collectPoiReferences`가 이미 담당하므로, 여기서는 "몇 번 왕복했는가"만 관찰한다).
 */
function createStubSupabase(options: {
  poi: { id: string; name: string }[]
  dropsByPoiId?: Record<string, number>
  failReferenceTable?: string
}) {
  const { poi, dropsByPoiId = {}, failReferenceTable } = options
  let poiDropsCalls = 0

  const client = {
    from(table: string) {
      if (table === 'poi') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: poi.filter((p) => ids.includes(p.id)),
              error: null,
            }),
          }),
        }
      }
      if (table === failReferenceTable) {
        return {
          select: () => ({
            in: async () => ({ count: null, error: { message: `${table} 조회 실패` } }),
          }),
        }
      }
      if (table === 'poi_drops') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              poiDropsCalls += 1
              return { count: ids.reduce((sum, id) => sum + (dropsByPoiId[id] ?? 0), 0), error: null }
            },
          }),
        }
      }
      return {
        select: () => ({
          in: async () => ({ count: 0, error: null }),
        }),
      }
    },
  }

  return { client, callCount: () => poiDropsCalls }
}

describe('collectPoiReferencesById', () => {
  it('참조가 없는 POI는 한 번의 묶음 조회로 전원 0건이 된다(개별 왕복 없이)', async () => {
    const poi = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `장소${i}` }))
    const { client, callCount } = createStubSupabase({ poi })

    const result = await collectPoiReferencesById(client as unknown as Parameters<typeof collectPoiReferencesById>[0], poi.map((p) => p.id))

    expect(result.error).toBeNull()
    expect(result.candidates.size).toBe(8)
    for (const p of poi) {
      expect(result.candidates.get(p.id)).toMatchObject({ id: p.id, name: p.name, total: 0 })
    }
    // 묶음 전체가 0건이라 한 번의 집계 조회로 끝난다 — poi마다 개별 조회(8회)하지 않는다
    expect(callCount()).toBe(1)
  })

  it('참조가 있는 POI만 절반씩 나눠 정확한 건수를 찾아낸다', async () => {
    const poi = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `장소${i}` }))
    const { client } = createStubSupabase({ poi, dropsByPoiId: { p5: 3 } })

    const result = await collectPoiReferencesById(client as unknown as Parameters<typeof collectPoiReferencesById>[0], poi.map((p) => p.id))

    expect(result.error).toBeNull()
    expect(result.candidates.get('p5')).toMatchObject({ total: 3 })
    for (const p of poi.filter((x) => x.id !== 'p5')) {
      expect(result.candidates.get(p.id)).toMatchObject({ total: 0 })
    }
  })

  it('존재하지 않는 id는 candidates에 담기지 않는다', async () => {
    const poi = [{ id: 'p1', name: '장소1' }]
    const { client } = createStubSupabase({ poi })

    const result = await collectPoiReferencesById(client as unknown as Parameters<typeof collectPoiReferencesById>[0], ['p1', 'missing'])

    expect(result.candidates.has('p1')).toBe(true)
    expect(result.candidates.has('missing')).toBe(false)
  })

  it('id가 없으면 조회 없이 빈 결과를 돌려준다', async () => {
    const { client, callCount } = createStubSupabase({ poi: [] })
    const result = await collectPoiReferencesById(client as unknown as Parameters<typeof collectPoiReferencesById>[0], [])
    expect(result).toEqual({ candidates: new Map(), error: null })
    expect(callCount()).toBe(0)
  })

  it('참조 조회가 하나라도 실패하면 error를 채운다(fail-closed)', async () => {
    const poi = [{ id: 'p1', name: '장소1' }]
    const { client } = createStubSupabase({ poi, failReferenceTable: 'poi_blocks' })

    const result = await collectPoiReferencesById(client as unknown as Parameters<typeof collectPoiReferencesById>[0], ['p1'])
    expect(result.error).toContain('poi_blocks')
  })
})
