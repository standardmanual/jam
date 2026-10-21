/**
 * 보관 기간 상수 — DB 함수(마이그레이션 263)와 보관 표(262)가 앱과 같은 값을 쓰는지 고정한다 (티켓 20261021_1249 1회)
 *
 * 복사와 기간 판정은 SQL 함수가 하고 앱은 미리보기에서 건수를 셀 때만 같은 기간을 쓴다. 두 곳이 갈라지면 미리보기가 실제 복사 건수와 달라진다.
 * 그래서 SQL 파일을 읽어 종류별 INTERVAL과 보관 표의 종류 목록이 `retention.ts`와 같은지 확인한다.
 * 법무 확인(티켓 20260929_1303)에서 기간이 바뀌면 이 시험이 SQL과 상수 중 고치지 않은 쪽을 잡는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/retention.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { RETAINED_KINDS, RETENTION_MONTHS, retentionSince } from '../retention'

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations')
const prepareSql = readFileSync(path.join(MIGRATIONS, '263_prepare_account_deletion.sql'), 'utf8')
const tableSql = readFileSync(path.join(MIGRATIONS, '262_retained_records.sql'), 'utf8')

describe('보관 기간 상수 ↔ 마이그레이션', () => {
  it('보관 표의 kind CHECK가 앱의 종류 목록과 같다(262)', () => {
    const match = tableSql.match(/CHECK \(kind IN \(([^)]*)\)\)/)
    expect(match).not.toBeNull()
    const kinds = (match?.[1] ?? '').split(',').map((k) => k.trim().replace(/'/g, ''))
    expect([...kinds].sort()).toEqual([...RETAINED_KINDS].sort())
  })

  it('준비 함수의 종류별 복사 문장이 앱의 기간(개월)과 같은 INTERVAL만 쓴다(263)', () => {
    const statements = prepareSql.split('INSERT INTO public.retained_records').slice(1)
    expect(statements).toHaveLength(RETAINED_KINDS.length)

    const seen: string[] = []
    for (const statement of statements) {
      const kind = statement.match(/SELECT '([a-z_]+)'/)?.[1]
      expect(kind).toBeDefined()
      seen.push(kind as string)

      // 보관 만료 시각 계산과 «이미 기간이 지난 기록은 복사하지 않는다» 조건, 두 군데에 INTERVAL이 있다
      const months = [...statement.matchAll(/INTERVAL '(\d+) months'/g)].map((m) => Number(m[1]))
      expect(months).toHaveLength(2)
      for (const value of months) expect(value).toBe(RETENTION_MONTHS[kind as keyof typeof RETENTION_MONTHS])
    }
    expect([...seen].sort()).toEqual([...RETAINED_KINDS].sort())
  })
})

describe('retentionSince', () => {
  it('기준 시각에서 개월 수만큼 앞선 시각을 ISO로 돌려준다', () => {
    const now = new Date('2026-10-21T03:00:00.000Z')
    expect(retentionSince(now, 6)).toBe('2026-04-21T03:00:00.000Z')
    expect(retentionSince(now, 3)).toBe('2026-07-21T03:00:00.000Z')
  })

  it('받은 Date를 바꾸지 않는다', () => {
    const now = new Date('2026-10-21T03:00:00.000Z')
    retentionSince(now, 6)
    expect(now.toISOString()).toBe('2026-10-21T03:00:00.000Z')
  })
})
