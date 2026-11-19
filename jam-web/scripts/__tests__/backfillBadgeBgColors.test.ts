import { describe, expect, it } from 'vitest'
import { runBackfill } from '../backfill-badge-bg-colors.mjs'

type Row = { id: string; image_url: string | null; bg_colors: string[] | null }

/** supabase-js 체인(select/is/not/order/limit/gt, update/eq/is/select)을 메모리 표로 흉내 낸다 */
function fakeClient(rows: Row[]) {
  return {
    from() {
      const filters: Array<(r: Row) => boolean> = []
      let mode: 'select' | 'update' = 'select'
      let patch: Partial<Row> = {}
      let max = Infinity
      const chain = {
        select() {
          return chain
        },
        update(p: Partial<Row>) {
          mode = 'update'
          patch = p
          return chain
        },
        is(col: keyof Row, v: null) {
          filters.push((r) => r[col] === v)
          return chain
        },
        not(col: keyof Row, _op: string, v: null) {
          filters.push((r) => r[col] !== v)
          return chain
        },
        eq(col: keyof Row, v: unknown) {
          filters.push((r) => r[col] === v)
          return chain
        },
        gt(col: keyof Row, v: string) {
          filters.push((r) => String(r[col]) > v)
          return chain
        },
        order() {
          return chain
        },
        limit(n: number) {
          max = n
          return chain
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          const hit = rows.filter((r) => filters.every((f) => f(r)))
          if (mode === 'update') {
            hit.forEach((r) => Object.assign(r, patch))
            resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
          } else {
            const sorted = [...hit].sort((a, b) => a.id.localeCompare(b.id)).slice(0, max)
            resolve({ data: sorted.map((r) => ({ id: r.id, image_url: r.image_url })), error: null })
          }
        },
      }
      return chain
    },
  }
}

const table = (): Row[] => [
  { id: 'a', image_url: '/badges/a.png', bg_colors: null },
  { id: 'b', image_url: '/badges/b.png', bg_colors: null },
  { id: 'c', image_url: '/badges/c.png', bg_colors: null },
  { id: 'd', image_url: '/badges/d.png', bg_colors: null },
  { id: 'e', image_url: null, bg_colors: null },
  { id: 'f', image_url: '/badges/f.png', bg_colors: ['#112233'] },
]

const extract = async (url: string) => {
  if (url.endsWith('a.png')) return ['#111111', '#222222', '#333333']
  if (url.endsWith('b.png')) return ['#444444']
  if (url.endsWith('c.png')) return []
  return null
}

describe('runBackfill', () => {
  it('--dry-run은 저장하지 않고 분포와 실패 수를 센다', async () => {
    const rows = table()
    const { stats, failures } = await runBackfill({ client: fakeClient(rows), dryRun: true, extract, log: () => {} })
    expect(stats).toMatchObject({ read: 4, saved: 0, c3: 1, c1: 1, empty: 1, failed: 1 })
    expect(failures.map((f: { id: string }) => f.id)).toEqual(['d'])
    expect(rows.find((r) => r.id === 'a')?.bg_colors).toBeNull()
  })

  it('저장하고, 다시 실행하면 성공한 배지는 0건이다(이미지 없는 배지·값이 있는 배지는 건드리지 않는다)', async () => {
    const rows = table()
    const first = await runBackfill({ client: fakeClient(rows), extract, log: () => {} })
    expect(first.stats.saved).toBe(3)
    expect(rows.find((r) => r.id === 'c')?.bg_colors).toEqual([])
    expect(rows.find((r) => r.id === 'e')?.bg_colors).toBeNull()
    expect(rows.find((r) => r.id === 'f')?.bg_colors).toEqual(['#112233'])
    const second = await runBackfill({ client: fakeClient(rows), extract, log: () => {} })
    expect(second.stats.saved).toBe(0)
    expect(second.stats.read).toBe(1) // 실패한 d만 다시 읽는다
  })

  it('--limit만큼만 읽는다', async () => {
    const { stats } = await runBackfill({ client: fakeClient(table()), dryRun: true, limit: 2, extract, log: () => {} })
    expect(stats.read).toBe(2)
  })

  it('계산하는 사이 이미지가 바뀐 배지에는 저장하지 않는다', async () => {
    const rows = table()
    const racing = async (url: string) => {
      rows[0].image_url = '/badges/a-new.png'
      return extract(url)
    }
    const { stats } = await runBackfill({ client: fakeClient(rows), limit: 1, extract: racing, log: () => {} })
    expect(stats.skippedStale).toBe(1)
    expect(rows[0].bg_colors).toBeNull()
  })
})
