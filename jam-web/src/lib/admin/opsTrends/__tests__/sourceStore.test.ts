/**
 * 트렌드 출처 저장소 (티켓 20261026_2033 1회차)
 *
 * 서비스 클라이언트는 메모리 안의 가짜다. 지키는 것:
 * - 목록: `no` 순, 끈 출처 제외 옵션, `lastReadAt` 계산(가장 늦은 묶음·문자열/숫자 번호·시험 묶음 제외·인용 없음 null)
 * - 등록·수정: 이름 중복은 `duplicate`, 없는 행은 `not_found`, 위치 비우기는 종류로 판정, `created_by`는 결과에 없음
 * - 수정: 저장소 폴더 출처의 위치가 허용 폴더 밖이면 `folder_not_allowed`(저장 안 함), 허용 폴더면 저장, 다른 종류는 그대로
 * - 읽기·쓰기 실패는 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsTrends/__tests__/sourceStore.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createTrendSource, listTrendSources, updateTrendSource } from '../sourceStore'

type Row = Record<string, unknown>

const state: {
  sources: Row[]
  bundles: Row[]
  failTable: string | null
  nextNo: number
} = { sources: [], bundles: [], failTable: null, nextNo: 1 }

function source(overrides: Row = {}): Row {
  const no = state.nextNo++
  return {
    id: `00000000-0000-4000-8000-${String(no).padStart(12, '0')}`,
    no,
    name: `출처${no}`,
    kind: 'hashtag',
    location: `#tag${no}`,
    enabled: true,
    created_at: '2026-10-20T00:00:00.000Z',
    updated_at: '2026-10-20T00:00:00.000Z',
    created_by: 'admin-1',
    ...overrides,
  }
}

/** 체인 끝(await·single·maybeSingle)에서 결과를 내는 가짜 쿼리. */
function fakeService() {
  const make = (table: string) => {
    const rows = () => (table === 'ops_trend_sources' ? state.sources : state.bundles)
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let sortKey: string | null = null
    let ascending = true
    let limit = Infinity
    const fail = () => (state.failTable === table ? { data: null, error: { code: 'XX000', message: 'boom secret' } } : null)

    const run = () => {
      const failed = fail()
      if (failed) return failed
      if (mode === 'insert') {
        const dup = state.sources.some(
          (s) => String(s.name).trim().toLowerCase() === String(payload.name).trim().toLowerCase()
        )
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        const row = source({ ...payload })
        state.sources.push(row)
        return { data: [row], error: null }
      }
      let matched = rows().filter((r) => filters.every((f) => f(r)))
      if (mode === 'update') {
        if (
          payload.name !== undefined &&
          state.sources.some(
            (s) =>
              !matched.includes(s) &&
              String(s.name).trim().toLowerCase() === String(payload.name).trim().toLowerCase()
          )
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        matched.forEach((r) => Object.assign(r, payload))
      }
      if (sortKey) {
        const key = sortKey
        matched = [...matched].sort((a, b) => {
          const av = a[key] as number | string
          const bv = b[key] as number | string
          return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1)
        })
      }
      return { data: matched.slice(0, limit), error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: Row) => {
        mode = 'insert'
        payload = p
        return builder
      },
      update: (p: Row) => {
        mode = 'update'
        payload = p
        return builder
      },
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value)
        return builder
      },
      gte: (col: string, value: string) => {
        filters.push((r) => Date.parse(String(r[col])) >= Date.parse(value))
        return builder
      },
      not: (col: string, op: string, value: unknown) => {
        if (op === 'is' && value === null) filters.push((r) => r[col] !== null && r[col] !== undefined)
        return builder
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        sortKey = col
        ascending = opts?.ascending !== false
        return builder
      },
      limit: (n: number) => {
        limit = n
        return builder
      },
      single: async () => {
        const result = run()
        if (result.error) return { data: null, error: result.error }
        return { data: (result.data as Row[])[0] ?? null, error: null }
      },
      maybeSingle: async () => {
        const result = run()
        if (result.error) return { data: null, error: result.error }
        return { data: (result.data as Row[])[0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }
  return { from: make } as never
}

const NOW = Date.now()
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  state.sources = []
  state.bundles = []
  state.failTable = null
  state.nextNo = 1
})

describe('listTrendSources', () => {
  it('no 순으로 돌려주고 created_by를 싣지 않는다', async () => {
    state.sources.push(source({ no: 3 }), source({ no: 1 }), source({ no: 2 }))
    const list = await listTrendSources(fakeService(), { includeDisabled: true })
    expect(list.map((s) => s.no)).toEqual([1, 2, 3])
    expect(JSON.stringify(list)).not.toContain('created_by')
    expect(JSON.stringify(list)).not.toContain('admin-1')
  })

  it('includeDisabled가 false면 꺼진 출처를 뺀다', async () => {
    state.sources.push(source(), source({ enabled: false }))
    expect(await listTrendSources(fakeService(), { includeDisabled: false })).toHaveLength(1)
    expect(await listTrendSources(fakeService(), { includeDisabled: true })).toHaveLength(2)
  })

  it('lastReadAt은 출처 번호가 든 묶음 중 가장 늦은 받은 시각이다(문자열·숫자 번호 모두)', async () => {
    state.sources.push(source(), source(), source())
    state.bundles.push(
      { received_at: daysAgo(10), is_sample: false, trends: [{ source_ids: [1, 2] }] },
      { received_at: daysAgo(3), is_sample: false, trends: [{ source_ids: ['1'] }, { source_ids: [] }] },
      { received_at: daysAgo(5), is_sample: false, trends: [{ source_ids: [2] }] }
    )
    const list = await listTrendSources(fakeService(), { includeDisabled: true })
    expect(list.find((s) => s.no === 1)?.lastReadAt).toBe(daysAgo(3))
    expect(list.find((s) => s.no === 2)?.lastReadAt).toBe(daysAgo(5))
    expect(list.find((s) => s.no === 3)?.lastReadAt).toBeNull()
  })

  it('시험 묶음·60일이 지난 묶음·trends가 없는 묶음은 무시한다', async () => {
    state.sources.push(source())
    state.bundles.push(
      { received_at: daysAgo(1), is_sample: true, trends: [{ source_ids: [1] }] },
      { received_at: daysAgo(90), is_sample: false, trends: [{ source_ids: [1] }] },
      { received_at: daysAgo(2), is_sample: false, trends: null }
    )
    const list = await listTrendSources(fakeService(), { includeDisabled: true })
    expect(list[0].lastReadAt).toBeNull()
  })

  it('withLastReadAt이 false면 묶음 테이블을 읽지 않는다', async () => {
    state.sources.push(source())
    state.failTable = 'ops_bundles'
    const list = await listTrendSources(fakeService(), { includeDisabled: false, withLastReadAt: false })
    expect(list).toHaveLength(1)
  })

  it('출처 읽기 실패와 묶음 읽기 실패는 던진다', async () => {
    state.sources.push(source())
    state.failTable = 'ops_trend_sources'
    await expect(listTrendSources(fakeService(), { includeDisabled: true })).rejects.toThrow()
    state.failTable = 'ops_bundles'
    await expect(listTrendSources(fakeService(), { includeDisabled: true })).rejects.toThrow()
  })
})

describe('createTrendSource', () => {
  it('등록하면 번호가 붙은 출처를 돌려준다', async () => {
    const result = await createTrendSource(fakeService(), { name: '러닝', kind: 'hashtag', location: '#러닝' }, 'admin-9')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toMatchObject({ no: 1, name: '러닝', kind: 'hashtag', location: '#러닝', enabled: true })
      expect(JSON.stringify(result.source)).not.toContain('admin-9')
    }
    expect(state.sources[0].created_by).toBe('admin-9')
  })

  it('같은 이름(대소문자·공백 무시)은 duplicate이고 던지지 않는다', async () => {
    await createTrendSource(fakeService(), { name: 'Run', kind: 'channel', location: 'a' }, 'a')
    const result = await createTrendSource(fakeService(), { name: ' run ', kind: 'channel', location: 'b' }, 'a')
    expect(result).toEqual({ ok: false, code: 'duplicate' })
  })

  it('그 밖의 실패는 던진다', async () => {
    state.failTable = 'ops_trend_sources'
    await expect(
      createTrendSource(fakeService(), { name: 'x', kind: 'channel', location: 'a' }, 'a')
    ).rejects.toThrow()
  })
})

describe('updateTrendSource', () => {
  it('끄기와 이름 바꾸기가 반영된다', async () => {
    const row = source()
    state.sources.push(row)
    const result = await updateTrendSource(fakeService(), row.id as string, { enabled: false, name: '새 이름' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.source).toMatchObject({ enabled: false, name: '새 이름', no: 1 })
    expect(row.updated_at).not.toBe('2026-10-20T00:00:00.000Z')
  })

  it('다른 출처와 이름이 겹치면 duplicate', async () => {
    const a = source({ name: 'A' })
    state.sources.push(a, source({ name: 'B' }))
    expect(await updateTrendSource(fakeService(), a.id as string, { name: 'b' })).toEqual({ ok: false, code: 'duplicate' })
  })

  it('없는 행은 not_found', async () => {
    expect(await updateTrendSource(fakeService(), 'nope', { enabled: false })).toEqual({ ok: false, code: 'not_found' })
    expect(await updateTrendSource(fakeService(), 'nope', { location: '' })).toEqual({ ok: false, code: 'not_found' })
  })

  it('직접 올린 자료가 아닌 출처의 위치를 비우면 location_required, 직접 올린 자료는 비울 수 있다', async () => {
    const tag = source({ kind: 'hashtag' })
    const manual = source({ kind: 'manual_upload', location: 'inbox' })
    state.sources.push(tag, manual)
    expect(await updateTrendSource(fakeService(), tag.id as string, { location: '' })).toEqual({
      ok: false,
      code: 'location_required',
    })
    expect(tag.location).toBe('#tag1')
    const result = await updateTrendSource(fakeService(), manual.id as string, { location: '' })
    expect(result.ok).toBe(true)
    expect(manual.location).toBe('')
  })

  it('쓰기 실패는 던진다', async () => {
    state.failTable = 'ops_trend_sources'
    await expect(updateTrendSource(fakeService(), 'x', { enabled: true })).rejects.toThrow()
  })

  describe('저장소 폴더(repo_folder) 출처', () => {
    const FOLDER = 'docs/operations/trendresearch/'

    it('허용 폴더 밖 위치로 바꾸면 folder_not_allowed이고 저장하지 않는다', async () => {
      const row = source({ kind: 'repo_folder', location: FOLDER })
      state.sources.push(row)
      for (const location of ['docs/tickets/', '../x/', '/etc/', 'docs\\operations\\trendresearch\\']) {
        expect(await updateTrendSource(fakeService(), row.id as string, { location })).toEqual({
          ok: false,
          code: 'folder_not_allowed',
        })
      }
      expect(row.location).toBe(FOLDER)
    })

    it('허용 폴더 위치로는 저장하고, 이름·끄기와 함께 보내도 된다', async () => {
      const row = source({ kind: 'repo_folder', location: FOLDER })
      state.sources.push(row)
      const result = await updateTrendSource(fakeService(), row.id as string, {
        location: FOLDER,
        name: '리서치 폴더',
        enabled: false,
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.source).toMatchObject({ kind: 'repo_folder', location: FOLDER, name: '리서치 폴더', enabled: false })
    })

    it('위치를 비우면 허용 폴더 검사보다 먼저 location_required다', async () => {
      const row = source({ kind: 'repo_folder', location: FOLDER })
      state.sources.push(row)
      expect(await updateTrendSource(fakeService(), row.id as string, { location: '' })).toEqual({
        ok: false,
        code: 'location_required',
      })
      expect(row.location).toBe(FOLDER)
    })

    it('위치를 보내지 않는 수정(끄기·이름)은 위치를 건드리지 않고 그대로 된다', async () => {
      const row = source({ kind: 'repo_folder', location: FOLDER })
      state.sources.push(row)
      const result = await updateTrendSource(fakeService(), row.id as string, { enabled: false })
      expect(result.ok).toBe(true)
      expect(row.location).toBe(FOLDER)
    })

    it('다른 종류는 허용 폴더 목록과 상관없이 위치를 바꿀 수 있다', async () => {
      const tag = source({ kind: 'hashtag' })
      state.sources.push(tag)
      const result = await updateTrendSource(fakeService(), tag.id as string, { location: 'docs/tickets/' })
      expect(result.ok).toBe(true)
      expect(tag.location).toBe('docs/tickets/')
    })

    it('없는 행에 위치를 보내면 not_found, 종류 읽기 실패는 던진다', async () => {
      expect(await updateTrendSource(fakeService(), 'nope', { location: FOLDER })).toEqual({ ok: false, code: 'not_found' })
      state.failTable = 'ops_trend_sources'
      await expect(updateTrendSource(fakeService(), 'x', { location: FOLDER })).rejects.toThrow()
    })
  })
})
