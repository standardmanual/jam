import { approvePendingPois, rejectPendingPois, splitReviewResult } from '../poi-review'

interface RecordedUpdate {
  values: Record<string, unknown>
  inColumn: string
  inValues: string[]
  eqColumn: string | null
  eqValue: unknown
}

type ServiceArg = Parameters<typeof approvePendingPois>[0]

/**
 * 기록형 스텁 — 실제 DB 없이 update 체인(`.update().in().eq().select()`)이 어떤 조건으로
 * 나갔는지만 기록한다(`poi-list-query.test.ts`와 같은 방식). `eq`를 안 거치고 `select`를
 * 부르면 `eqColumn`이 null로 남아, 조건 누락이 테스트에서 바로 드러난다.
 */
function createServiceStub(options: {
  existingRows?: { id: string; category: string }[]
  displayOnMap?: Record<string, boolean>
  updatedIds?: string[]
}) {
  const updates: RecordedUpdate[] = []

  const service = {
    from(table: string) {
      if (table === 'poi_categories') {
        return {
          select: () => ({
            in: async (_column: string, slugs: string[]) => ({
              data: slugs.map((slug) => ({ slug, display_on_map: options.displayOnMap?.[slug] ?? true })),
            }),
          }),
        }
      }
      return {
        select: () => ({ in: async () => ({ data: options.existingRows ?? [] }) }),
        update(values: Record<string, unknown>) {
          const record: RecordedUpdate = { values, inColumn: '', inValues: [], eqColumn: null, eqValue: undefined }
          updates.push(record)
          const selectStep = {
            select: async () => ({
              data: (options.updatedIds ?? record.inValues).map((id) => ({ id })),
              error: null,
            }),
          }
          return {
            in(column: string, values2: string[]) {
              record.inColumn = column
              record.inValues = values2
              return {
                ...selectStep,
                eq(eqColumn: string, eqValue: unknown) {
                  record.eqColumn = eqColumn
                  record.eqValue = eqValue
                  return selectStep
                },
              }
            },
          }
        },
      }
    },
  }

  return { service: service as unknown as ServiceArg, updates }
}

describe('검토 처리 update는 pending_review = true 조건을 건다', () => {
  it('카테고리를 지정한 승인', async () => {
    const { service, updates } = createServiceStub({})
    await approvePendingPois(service, ['a', 'b'], 'cafe')

    expect(updates).toHaveLength(1)
    expect(updates[0].inColumn).toBe('id')
    expect(updates[0].inValues).toEqual(['a', 'b'])
    expect(updates[0].eqColumn).toBe('pending_review')
    expect(updates[0].eqValue).toBe(true)
  })

  it('카테고리 지정 없는 승인 — 노출 여부별로 나뉜 update 전부에 조건이 걸린다', async () => {
    const { service, updates } = createServiceStub({
      existingRows: [
        { id: 'a', category: 'cafe' },
        { id: 'b', category: 'hidden' },
      ],
      displayOnMap: { cafe: true, hidden: false },
    })
    await approvePendingPois(service, ['a', 'b'])

    expect(updates).toHaveLength(2)
    for (const update of updates) {
      expect(update.eqColumn).toBe('pending_review')
      expect(update.eqValue).toBe(true)
    }
  })

  it('거부', async () => {
    const { service, updates } = createServiceStub({})
    await rejectPendingPois(service, ['a'])

    expect(updates).toHaveLength(1)
    expect(updates[0].values).toMatchObject({ pending_review: false, is_active: false })
    expect(updates[0].eqColumn).toBe('pending_review')
    expect(updates[0].eqValue).toBe(true)
  })

  it('조건에 걸리지 않아 갱신되지 않은 id는 updatedIds에 없다', async () => {
    const { service } = createServiceStub({ updatedIds: ['a'] })
    const result = await rejectPendingPois(service, ['a', 'b'])
    expect(result.updatedIds).toEqual(['a'])
  })
})

describe('splitReviewResult', () => {
  it('갱신된 id는 처리, 나머지는 "이미 처리됨"으로 건너뛴다', () => {
    expect(splitReviewResult(['a', 'b', 'c'], ['a', 'c'])).toEqual({
      processed: ['a', 'c'],
      skipped: [{ id: 'b', reason: '이미 처리됨' }],
    })
  })

  it('전부 갱신되면 건너뜀이 없다', () => {
    expect(splitReviewResult(['a'], ['a'])).toEqual({ processed: ['a'], skipped: [] })
  })
})
