/**
 * 패턴 사전 마이그레이션 210·211과 상수·생성 타입의 일치 (티켓 20261001_2056, 상위 20260930_1503 ①)
 *
 * 지키는 것:
 * - 210에 테이블 3개의 `CREATE TABLE`이 있고, 상태·출처·추정/확정 CHECK 값이 `constants.ts`와 같다
 * - 세 테이블에 RLS가 켜지고 정책(`CREATE POLICY`)은 0건이다(서비스 롤 전용)
 * - 210·211에 `-- 되돌림 SQL` 블록이 있다
 * - 211은 `ADD COLUMN IF NOT EXISTS` 두 개만 있고 CHECK·REFERENCES가 없다
 * - 패턴 번호 형식이 `P01`·`P18`·`P100`을 받고 `P1`·`p01`·`T01`·`P1a`를 거절한다
 * - 생성 타입(`database.generated.ts`)에 새 테이블 3개와 두 칸이 있고, 테이블 칸이 SQL과 같다
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OPS_PATTERN_NO_PATTERN,
  OPS_PATTERN_ORIGINS,
  OPS_PATTERN_STATUSES,
  OPS_PATTERN_STATUS_LABELS,
  OPS_TASTE_BASES,
} from '../constants'

/** 마이그레이션 파일 이름. 번호가 밀리면 여기만 바꾼다. */
const PATTERNS_MIGRATION = '210_ops_patterns.sql'
const PATTERN_NO_MIGRATION = '211_today_pattern_no.sql'

const MIGRATIONS_DIR = join(__dirname, '../../../../../supabase/migrations')
const GENERATED_TYPES = join(__dirname, '../../../../types/database.generated.ts')

const PATTERN_TABLES = ['ops_patterns', 'ops_pattern_taste_signals', 'ops_pattern_common_rules'] as const

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

/** `--` 주석을 뺀 SQL. 주석에 적힌 문장이 검사에 걸리지 않게 한다. */
function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** 문자열 리터럴(`COMMENT ON ... IS '...'`의 설명문 등)을 비운 SQL. 설명문에 적힌 낱말이 구문 검사에 걸리지 않게 한다. */
function withoutStringLiterals(sql: string): string {
  return sql.replace(/'[^']*'/g, "''")
}

/** 이름 있는 CHECK 하나에서 `IN (...)` 값 목록을 읽는다. */
function checkInValues(sql: string, constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\s*\\w+ IN \\(([^)]*)\\)`).exec(sql)
  if (!match) throw new Error(`${constraint} CHECK를 찾지 못했다`)
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
}

/** `CREATE TABLE ... (` 본문에서 칸 이름을 읽는다(제약 줄은 뺀다). */
function sqlColumns(sql: string, table: string): string[] {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table} (`)
  if (start === -1) throw new Error(`${table} CREATE TABLE을 찾지 못했다`)
  const end = sql.indexOf('\n);', start)
  const body = sql.slice(start, end).split('\n').slice(1)
  const columns: string[] = []
  for (const line of body) {
    const match = /^ {2}([a-z_]+)\s+[A-Z]/.exec(line)
    if (match && match[1] !== 'constraint') columns.push(match[1])
  }
  return columns
}

/** 생성 타입에서 테이블 하나의 블록(`name: {` ~ 다음 같은 들여쓰기 `}`)을 자른다. */
function generatedTableBlock(types: string, table: string): string {
  const start = types.indexOf(`      ${table}: {\n`)
  if (start === -1) throw new Error(`database.generated.ts에 ${table}가 없다`)
  const end = types.indexOf('\n      }\n', start)
  return types.slice(start, end)
}

/** 생성 타입 블록에서 Row의 키를 읽는다. */
function generatedRowKeys(block: string): string[] {
  const rowStart = block.indexOf('        Row: {\n')
  const rowEnd = block.indexOf('\n        }\n', rowStart)
  return [...block.slice(rowStart, rowEnd).matchAll(/^ {10}([a-z_]+): /gm)].map((m) => m[1])
}

describe('마이그레이션 210 (패턴 사전 테이블 3개)', () => {
  const sql = readMigration(PATTERNS_MIGRATION)
  const code = withoutComments(sql)

  it.each(PATTERN_TABLES)('%s의 CREATE TABLE이 있다', (table) => {
    expect(code).toContain(`CREATE TABLE IF NOT EXISTS public.${table} (`)
  })

  it('만드는 테이블이 3개뿐이고 기존 테이블은 바꾸지 않는다', () => {
    expect(code.match(/CREATE TABLE/g)).toHaveLength(3)
    expect(code).not.toMatch(/ALTER TABLE public\.(?!ops_pattern)/)
    expect(code).not.toMatch(/\bINSERT\b|\bUPDATE\b|(?<!ON )\bDELETE\b/)
  })

  it('상태 CHECK 값이 constants와 같다', () => {
    expect(checkInValues(code, 'ops_patterns_status_check')).toEqual([...OPS_PATTERN_STATUSES])
  })

  it('출처 CHECK 값이 constants와 같다', () => {
    expect(checkInValues(code, 'ops_patterns_origin_check')).toEqual([...OPS_PATTERN_ORIGINS])
  })

  it('추정/확정 CHECK 값이 constants와 같다', () => {
    expect(checkInValues(code, 'ops_pattern_taste_signals_basis_check')).toEqual([...OPS_TASTE_BASES])
  })

  it('패턴 번호 CHECK가 constants의 정규식과 같다', () => {
    expect(code).toContain(`CHECK (pattern_no ~ '${OPS_PATTERN_NO_PATTERN.source}')`)
  })

  it('상태마다 한국어 이름표가 있다', () => {
    expect(Object.keys(OPS_PATTERN_STATUS_LABELS).sort()).toEqual([...OPS_PATTERN_STATUSES].sort())
  })

  it.each(PATTERN_TABLES)('%s에 RLS가 켜진다', (table) => {
    expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`))
  })

  it('정책을 만들지 않는다(서비스 롤 전용)', () => {
    expect(code).not.toMatch(/CREATE POLICY/i)
  })

  it('되돌림 SQL 블록이 있고 취향 신호 → 패턴 → 공통 규칙 순서로 지운다', () => {
    expect(sql).toMatch(/^-- 되돌림 SQL$/m)
    const rollback = sql.slice(sql.indexOf('-- 되돌림 SQL'))
    const order = ['ops_pattern_taste_signals', 'ops_patterns', 'ops_pattern_common_rules'].map((table) =>
      rollback.indexOf(`DROP TABLE IF EXISTS public.${table};`),
    )
    expect(order.every((index) => index !== -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('마이그레이션 211 (카드·카드 이벤트 패턴 칸)', () => {
  const sql = readMigration(PATTERN_NO_MIGRATION)
  const code = withoutComments(sql)

  it('ADD COLUMN IF NOT EXISTS pattern_no가 두 테이블에 하나씩만 있다', () => {
    expect(code.match(/ADD COLUMN/g)).toHaveLength(2)
    expect(code).toContain('ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS pattern_no TEXT NULL;')
    expect(code).toContain('ALTER TABLE public.today_card_events ADD COLUMN IF NOT EXISTS pattern_no TEXT NULL;')
  })

  it('CHECK·REFERENCES·인덱스를 두지 않는다', () => {
    const statements = withoutStringLiterals(code)
    expect(statements).not.toMatch(/\bCHECK\b/i)
    expect(statements).not.toMatch(/\bREFERENCES\b/i)
    expect(statements).not.toMatch(/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i)
  })

  it('되돌림 SQL 블록이 있다', () => {
    expect(sql).toMatch(/^-- 되돌림 SQL$/m)
    expect(sql).toContain('DROP COLUMN IF EXISTS pattern_no;')
  })
})

describe('패턴 번호 형식', () => {
  it.each(['P01', 'P18', 'P19', 'P100'])('%s를 받는다', (value) => {
    expect(OPS_PATTERN_NO_PATTERN.test(value)).toBe(true)
  })

  it.each(['P1', 'p01', 'T01', 'P1a', 'P', '', ' P01', 'P01 '])('%j를 거절한다', (value) => {
    expect(OPS_PATTERN_NO_PATTERN.test(value)).toBe(false)
  })
})

describe('생성 타입(database.generated.ts)', () => {
  const types = readFileSync(GENERATED_TYPES, 'utf8')

  it.each(PATTERN_TABLES)('%s의 Row 칸이 마이그레이션 210의 칸과 같다', (table) => {
    const columns = sqlColumns(withoutComments(readMigration(PATTERNS_MIGRATION)), table)
    expect(columns.length).toBeGreaterThan(0)
    expect([...generatedRowKeys(generatedTableBlock(types, table))].sort()).toEqual([...columns].sort())
  })

  it.each(['today_cards', 'today_card_events'])('%s에 pattern_no가 Row는 필수 null 허용, Insert·Update는 선택이다', (table) => {
    const block = generatedTableBlock(types, table)
    expect(block.match(/^ {10}pattern_no: string \| null$/gm)).toHaveLength(1)
    expect(block.match(/^ {10}pattern_no\?: string \| null$/gm)).toHaveLength(2)
  })
})
