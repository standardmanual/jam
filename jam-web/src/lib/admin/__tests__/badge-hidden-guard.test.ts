/**
 * 배지 양식의 숨김·가지 검증 (티켓 20261018_1816 1회, 운영 로직 10.2·10.3절)
 *
 * 고정하는 것: 마이그레이션 243의 DB 제약 4개와 같은 규칙. 숨김은 액티비티만, 포인트 0, 등급 Common만(레벨형은 등급 없음),
 * 가지는 일곱 가지 또는 비움. 숨김이 아니면 아무것도 검사하지 않는다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BRANCH_KEYS,
  BRANCH_LABEL,
  findBranchKeyError,
  findHiddenBadgeError,
  normalizeBranchKey,
  normalizeIsHidden,
  parseBranchKey,
} from '../badge-hidden-guard'

const OK = { isHidden: true, type: 'activity', rarity: 'common', pointReward: 0 }

describe('BRANCH_KEYS', () => {
  it('마이그레이션 243의 badges_branch_key_known 목록과 같다', () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/243_badges_hidden_and_branch.sql'), 'utf-8')
    const listed = sql.match(/branch_key IN \(([^)]*)\)/)?.[1]
    expect(listed, '마이그레이션에서 가지 목록을 찾지 못했다').toBeTruthy()
    const fromSql = [...listed!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...BRANCH_KEYS]).toEqual(fromSql)
  })

  it('가지마다 어드민 표기가 있다', () => {
    for (const key of BRANCH_KEYS) expect(BRANCH_LABEL[key]).toBeTruthy()
  })
})

describe('parseBranchKey·findBranchKeyError·normalizeBranchKey', () => {
  it('비움(null·undefined·빈 문자열·공백)은 분류 없음이다', () => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(parseBranchKey(raw)).toBeNull()
      expect(findBranchKeyError(raw)).toBeNull()
      expect(normalizeBranchKey(raw)).toBeNull()
    }
  })

  it('일곱 가지는 그대로 통과한다', () => {
    for (const key of BRANCH_KEYS) {
      expect(findBranchKeyError(key)).toBeNull()
      expect(normalizeBranchKey(key)).toBe(key)
    }
  })

  it('목록 밖의 값·문자열이 아닌 값은 막고 null로 정규화한다', () => {
    for (const raw of ['Rhythm', 'running', 3, true, {}]) {
      expect(parseBranchKey(raw)).toBe('invalid')
      expect(findBranchKeyError(raw)).toContain('가지 값')
      expect(normalizeBranchKey(raw)).toBeNull()
    }
  })
})

describe('findHiddenBadgeError', () => {
  it('숨김 액티비티 · Common · 포인트 0은 통과한다', () => {
    expect(findHiddenBadgeError(OK)).toBeNull()
  })

  it('등급이 없는 레벨형 숨김 배지는 통과한다', () => {
    expect(findHiddenBadgeError({ ...OK, rarity: null })).toBeNull()
  })

  it('숨김이 아니면 종류·등급·포인트가 무엇이어도 검사하지 않는다', () => {
    for (const isHidden of [false, undefined, null, 'true', 1]) {
      expect(findHiddenBadgeError({ isHidden, type: 'item', rarity: 'mystic', pointReward: 100 })).toBeNull()
    }
  })

  it('액티비티가 아닌 숨김 배지는 막는다', () => {
    for (const type of ['item', 'checkin']) {
      expect(findHiddenBadgeError({ ...OK, type })).toContain('액티비티 배지에만')
    }
  })

  it('Common이 아닌 등급의 숨김 배지는 막는다', () => {
    for (const rarity of ['rare', 'epic', 'mystic']) {
      expect(findHiddenBadgeError({ ...OK, rarity })).toContain('Common')
    }
  })

  it('포인트가 0이 아닌 숨김 배지는 막는다', () => {
    expect(findHiddenBadgeError({ ...OK, pointReward: 10 })).toContain('포인트 보상은 0')
  })
})

describe('normalizeIsHidden', () => {
  it('불리언 true만 숨김이다', () => {
    expect(normalizeIsHidden(true)).toBe(true)
    for (const raw of [false, undefined, null, 'true', 1]) expect(normalizeIsHidden(raw)).toBe(false)
  })
})
