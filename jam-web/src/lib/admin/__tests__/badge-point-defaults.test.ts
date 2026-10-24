/**
 * lib/admin/badge-point-defaults — 새 배지의 포인트 기본값 (티켓 20261022_1135 1회)
 *
 * 고정하는 것
 *  - 숨김이면 등급·레벨형과 관계없이 0이다(마이그레이션 243의 badges_hidden_no_points).
 *  - 레벨형이면 레벨형 값이고, 아니면 등급 값이다. 등급마다 정책의 해당 칸을 읽는다(칸을 바꿔 읽지 않는다).
 *  - 일괄 값을 바꾸면 기본값이 따라 바뀐다(코드에 값을 박아 두지 않는다).
 *  - 등급도 레벨형도 아니면(비정상 입력) 값을 지어내지 않고 0이다.
 * 서버 모듈을 가져오지 않는 순수 함수다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-point-defaults.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 일괄 값 상수를 가져오는 `pointPolicy.ts`가 서비스 클라이언트를 가져온다 — 이 시험은 DB를 쓰지 않는다
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { defaultPointFor } from '../badge-point-defaults'
import { DEFAULT_BADGE_POINT_POLICY, type BadgePointPolicy } from '@/lib/badge/pointPolicy'

/** 칸마다 다른 값을 줘서 엉뚱한 칸을 읽으면 드러나게 한다 */
const POLICY: BadgePointPolicy = { common_points: 11, rare_points: 22, epic_points: 55, mystic_points: 111, leveled_points: 7 }

describe('defaultPointFor', () => {
  it('등급형은 등급 값이다(칸을 바꿔 읽지 않는다)', () => {
    expect(defaultPointFor({ rarity: 'common', isLeveled: false, isHidden: false }, POLICY)).toBe(11)
    expect(defaultPointFor({ rarity: 'rare', isLeveled: false, isHidden: false }, POLICY)).toBe(22)
    expect(defaultPointFor({ rarity: 'epic', isLeveled: false, isHidden: false }, POLICY)).toBe(55)
    expect(defaultPointFor({ rarity: 'mystic', isLeveled: false, isHidden: false }, POLICY)).toBe(111)
  })

  it('운영 로직의 기본 일괄 값은 Common 10 · Rare 20 · Epic 50 · Mystic 100 · 레벨형 10이다', () => {
    const at = (rarity: 'common' | 'rare' | 'epic' | 'mystic') =>
      defaultPointFor({ rarity, isLeveled: false, isHidden: false }, DEFAULT_BADGE_POINT_POLICY)
    expect([at('common'), at('rare'), at('epic'), at('mystic')]).toEqual([10, 20, 50, 100])
    expect(defaultPointFor({ rarity: null, isLeveled: true, isHidden: false }, DEFAULT_BADGE_POINT_POLICY)).toBe(10)
  })

  it('레벨형이면 레벨형 값이다(등급 값이 아니다)', () => {
    expect(defaultPointFor({ rarity: null, isLeveled: true, isHidden: false }, POLICY)).toBe(7)
    // 양식은 레벨형으로 바꿔도 등급 state를 남겨 두므로 등급이 같이 와도 레벨형 값이 먼저다
    expect(defaultPointFor({ rarity: 'mystic', isLeveled: true, isHidden: false }, POLICY)).toBe(7)
  })

  it('숨김이면 0이다 — 등급형이든 레벨형이든, 일괄 값이 얼마든', () => {
    for (const rarity of ['common', 'rare', 'epic', 'mystic'] as const) {
      expect(defaultPointFor({ rarity, isLeveled: false, isHidden: true }, POLICY), rarity).toBe(0)
    }
    expect(defaultPointFor({ rarity: null, isLeveled: true, isHidden: true }, POLICY)).toBe(0)
  })

  it('일괄 값을 바꾸면 기본값이 따라 바뀐다', () => {
    const changed: BadgePointPolicy = { ...POLICY, rare_points: 30, leveled_points: 0 }
    expect(defaultPointFor({ rarity: 'rare', isLeveled: false, isHidden: false }, changed)).toBe(30)
    expect(defaultPointFor({ rarity: null, isLeveled: true, isHidden: false }, changed)).toBe(0)
  })

  it('등급도 레벨형도 아니면 0이다(값을 지어내지 않는다)', () => {
    expect(defaultPointFor({ rarity: null, isLeveled: false, isHidden: false }, POLICY)).toBe(0)
    expect(defaultPointFor({ rarity: 'legendary' as never, isLeveled: false, isHidden: false }, POLICY)).toBe(0)
  })
})

describe('서버 모듈을 가져오지 않는다', () => {
  it('값을 가져오는 import가 없고 타입 import만 있다(클라이언트 번들에 서버 모듈이 들어가지 않는다)', () => {
    const source = readFileSync(join(__dirname, '..', 'badge-point-defaults.ts'), 'utf-8')
    const imports = [...source.matchAll(/^import .*$/gm)].map((match) => match[0])
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line, line).toMatch(/^import type /)
  })
})
