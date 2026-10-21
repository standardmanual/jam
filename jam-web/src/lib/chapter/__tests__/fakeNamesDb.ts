/**
 * 챕터 이름 표 시험용 메모리 DB (티켓 20261019_1318 2회). 공용 DB는 부르지 않는다.
 * `lib/chapter/names-table.ts`와 `/api/admin/chapter-names` 시험이 함께 쓴다.
 * 흉내 내는 것: `from(t).select().order()/limit()/in()`, `from(t).upsert()`, `from(t).delete().eq().in()` — 이 표 코드가 쓰는 모양만이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Row = Record<string, unknown>

export interface FakeNamesDb {
  client: SupabaseClient
  tables: Record<string, Row[]>
  /** 부른 순서 — `테이블.동작` */
  calls: string[]
  /** 이 동작은 오류로 끝난다(`테이블.동작`) */
  failOn: Set<string>
}

export function createFakeNamesDb(initial: Record<string, Row[]>): FakeNamesDb {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  const calls: string[] = []
  const failOn = new Set<string>()

  const client = {
    from(table: string) {
      const rows = () => (tables[table] ??= [])
      const state = {
        action: 'select',
        filters: [] as Array<(r: Row) => boolean>,
        sorts: [] as Array<{ column: string; ascending: boolean }>,
        limit: Infinity,
        upsertRows: [] as Row[],
        conflict: '',
      }

      const run = (): { data: unknown; error: { message: string } | null } => {
        const key = `${table}.${state.action}`
        calls.push(key)
        if (failOn.has(key)) return { data: null, error: { message: `${key} 실패` } }
        if (state.action === 'upsert') {
          const keys = state.conflict.split(',')
          for (const incoming of state.upsertRows) {
            const existing = rows().find((r) => keys.every((k) => r[k] === incoming[k]))
            if (existing) Object.assign(existing, incoming)
            else rows().push({ ...incoming })
          }
          return { data: null, error: null }
        }
        if (state.action === 'delete') {
          tables[table] = rows().filter((r) => !state.filters.every((f) => f(r)))
          return { data: null, error: null }
        }
        const picked = rows().filter((r) => state.filters.every((f) => f(r)))
        for (const { column, ascending } of [...state.sorts].reverse()) {
          picked.sort((a, b) => (a[column]! < b[column]! ? -1 : a[column]! > b[column]! ? 1 : 0) * (ascending ? 1 : -1))
        }
        return { data: picked.slice(0, state.limit), error: null }
      }

      const builder: Record<string, unknown> = {
        select: () => builder,
        order: (column: string, options?: { ascending?: boolean }) => {
          state.sorts.push({ column, ascending: options?.ascending !== false })
          return builder
        },
        limit: (n: number) => {
          state.limit = n
          return builder
        },
        in: (column: string, values: unknown[]) => {
          state.filters.push((r) => values.includes(r[column]))
          return builder
        },
        eq: (column: string, value: unknown) => {
          state.filters.push((r) => r[column] === value)
          return builder
        },
        delete: () => {
          state.action = 'delete'
          return builder
        },
        upsert: (incoming: Row[], options: { onConflict: string }) => {
          state.action = 'upsert'
          state.upsertRows = incoming
          state.conflict = options.onConflict
          return builder
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      }
      return builder
    },
  } as unknown as SupabaseClient

  return { client, tables, calls, failOn }
}
