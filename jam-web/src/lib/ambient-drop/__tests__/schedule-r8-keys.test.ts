/**
 * 예약 자원 키 6개가 밸런스 규칙 R8의 경제 수치 키 23개와 겹치지 않는지 (티켓 20261001_2051)
 *
 * 운영툴 항목의 `resource`·`knobs`에 R8 키가 들어 있으면 「경제 수치를 건드린다」는 주의가 뜬다
 * (운영툴 PRD §5.2). 예약 필드 이름이 그 키와 겹치면 평범한 드랍 일정마다 주의가 뜬다. R8 키 목록은
 * `207_ops_rules.sql`의 `economy_keys` 시드가 원천이라 여기서 파일을 읽어 대조한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-r8-keys.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DROP_SCHEDULE_RESOURCE_KEYS } from '../scheduleSpec'

const MIGRATIONS = join(__dirname, '../../../../supabase/migrations')

function economyKeys(): string[] {
  const sql = readFileSync(join(MIGRATIONS, '207_ops_rules.sql'), 'utf8')
  const match = /\('economy_keys',\s*'balance',\s*'(\{[\s\S]*?\})'::jsonb/.exec(sql)
  if (!match) throw new Error('207_ops_rules.sql에서 economy_keys 시드를 찾지 못했어요')
  return (JSON.parse(match[1]) as { keys: string[] }).keys
}

describe('R8 경제 수치 키와 예약 자원 키', () => {
  const keys = economyKeys()

  it('R8 키는 23개이고 중복이 없다 (읽기 방식 확인 — 등급 비율 키가 들어 있다)', () => {
    expect(keys).toHaveLength(23)
    expect(new Set(keys).size).toBe(23)
    expect(keys).toContain('rarity_common')
  })

  it('예약 자원 키는 6개이고 R8 키와 하나도 겹치지 않는다', () => {
    expect(DROP_SCHEDULE_RESOURCE_KEYS).toHaveLength(6)
    const overlap = DROP_SCHEDULE_RESOURCE_KEYS.filter((key) => keys.includes(key))
    expect(overlap).toEqual([])
  })

  it('예약 자원 키는 마이그레이션 209의 칸 이름이다 — 상수와 테이블이 어긋나지 않는다', () => {
    const sql = readFileSync(join(MIGRATIONS, '209_ambient_drop_schedules.sql'), 'utf8')
    const createTable = /CREATE TABLE IF NOT EXISTS public\.ambient_drop_schedules \(([\s\S]*?)\n\);/.exec(sql)
    if (!createTable) throw new Error('209 마이그레이션에서 CREATE TABLE 블록을 찾지 못했어요')
    for (const key of DROP_SCHEDULE_RESOURCE_KEYS) {
      expect(createTable[1]).toMatch(new RegExp(`^\\s+${key}\\s`, 'm'))
    }
  })

  it('예약 테이블의 모든 칸 이름이 R8 키와 겹치지 않는다', () => {
    const sql = readFileSync(join(MIGRATIONS, '209_ambient_drop_schedules.sql'), 'utf8')
    const createTable = /CREATE TABLE IF NOT EXISTS public\.ambient_drop_schedules \(([\s\S]*?)\n\);/.exec(sql)
    if (!createTable) throw new Error('209 마이그레이션에서 CREATE TABLE 블록을 찾지 못했어요')
    const columns = [...createTable[1].matchAll(/^ {2}([a-z_]+)\s+(?:UUID|TEXT|TIMESTAMPTZ|INTEGER|JSONB)/gm)].map((m) => m[1])
    expect(columns.length).toBeGreaterThanOrEqual(19)
    expect(columns.filter((column) => keys.includes(column))).toEqual([])
  })
})
