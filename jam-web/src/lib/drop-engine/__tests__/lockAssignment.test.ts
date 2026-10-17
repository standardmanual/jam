/**
 * lib/drop-engine/lockAssignment — 잠김 배정 순수 판정 (티켓 20261018_0051)
 *
 * 고정하는 것: 잠김으로 만든 배지는 어느 경로든 늘 잠긴다(난수 미사용) · `sync`·`capsule`은 설정 확률로 잠김을 정한다
 * (확률 0은 절대, 1은 늘) · `designated`는 무작위로 잠그지 않는다 · 필요한 양은 배지 값이 우선이고 없으면 등급 최소값이다
 * · 이 파일은 서버 전용 모듈을 가져오지 않는다(클라이언트 번들 경계).
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/lockAssignment.test.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { assignLock, minUnlockRequired, resolveUnlockRequired, type LockAssignInput } from '../lockAssignment'

const policy = DEFAULT_JAM_POLICY

const input = (overrides: Partial<LockAssignInput> = {}): LockAssignInput => ({
  alwaysLocked: false,
  unlockRequired: null,
  rarity: 'common',
  route: 'sync',
  ...overrides,
})

describe('assignLock — 잠김으로 만든 배지', () => {
  it.each(['sync', 'capsule', 'designated'] as const)('%s 경로에서도 늘 잠기고 난수를 쓰지 않는다', (route) => {
    const rand = vi.fn(() => 0.999)
    const result = assignLock(input({ alwaysLocked: true, route }), { ...policy, locked_roll_probability: 0 }, rand)
    expect(result).toEqual({ locked: true, lockReason: 'badge_locked', unlockRequired: 30 })
    expect(rand).not.toHaveBeenCalled()
  })
})

describe('assignLock — 확률 경로(sync·capsule)', () => {
  it.each(['sync', 'capsule'] as const)('%s: 난수가 확률보다 작으면 잠기고(rolled) 같거나 크면 열린 채다', (route) => {
    expect(assignLock(input({ route }), policy, () => 0.2499)).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 30 })
    expect(assignLock(input({ route }), policy, () => 0.25)).toEqual({ locked: false, lockReason: null, unlockRequired: null })
    expect(assignLock(input({ route }), policy, () => 0.9)).toEqual({ locked: false, lockReason: null, unlockRequired: null })
  })

  it('확률 0%는 난수가 0이어도 절대 잠기지 않는다', () => {
    const zero = { ...policy, locked_roll_probability: 0 }
    expect(assignLock(input(), zero, () => 0).locked).toBe(false)
    expect(assignLock(input({ route: 'capsule' }), zero, () => 0).locked).toBe(false)
  })

  it('확률 100%는 난수가 1에 가까워도 늘 잠긴다', () => {
    const one = { ...policy, locked_roll_probability: 1 }
    expect(assignLock(input(), one, () => 0.999999).locked).toBe(true)
    expect(assignLock(input({ route: 'capsule' }), one, () => 0.999999).locked).toBe(true)
  })

  it('난수는 한 번만 부른다', () => {
    const rand = vi.fn(() => 0.5)
    assignLock(input(), policy, rand)
    expect(rand).toHaveBeenCalledTimes(1)
  })
})

describe('assignLock — 운영자 지정 경로', () => {
  it('확률 100%여도 무작위로 잠그지 않고 난수도 쓰지 않는다', () => {
    const rand = vi.fn(() => 0)
    const result = assignLock(input({ route: 'designated' }), { ...policy, locked_roll_probability: 1 }, rand)
    expect(result).toEqual({ locked: false, lockReason: null, unlockRequired: null })
    expect(rand).not.toHaveBeenCalled()
  })
})

describe('여는 데 필요한 양', () => {
  it('배지 값이 없으면 등급 최소값이다 (Common 30, Rare 60, Epic 120, Mystic 240)', () => {
    expect(minUnlockRequired('common', policy)).toBe(30)
    expect(minUnlockRequired('rare', policy)).toBe(60)
    expect(minUnlockRequired('epic', policy)).toBe(120)
    expect(minUnlockRequired('mystic', policy)).toBe(240)
    for (const [rarity, min] of [['common', 30], ['rare', 60], ['epic', 120], ['mystic', 240]] as const) {
      expect(assignLock(input({ alwaysLocked: true, rarity }), policy, () => 0).unlockRequired).toBe(min)
    }
  })

  it('배지 값이 있으면 그 값이 우선이다', () => {
    const result = assignLock(input({ alwaysLocked: true, rarity: 'rare', unlockRequired: 90 }), policy, () => 0)
    expect(result).toEqual({ locked: true, lockReason: 'badge_locked', unlockRequired: 90 })
    const rolled = assignLock(input({ rarity: 'epic', unlockRequired: 500 }), policy, () => 0)
    expect(rolled).toEqual({ locked: true, lockReason: 'rolled', unlockRequired: 500 })
  })

  it('정책의 최소값을 바꾸면 따라간다', () => {
    expect(minUnlockRequired('mystic', { ...policy, locked_min_mystic: 300 })).toBe(300)
  })

  it('배지 값이 양의 정수가 아니면(0·음수·소수) 등급 최소값으로 대체한다', () => {
    expect(resolveUnlockRequired(0, 'rare', policy)).toBe(60)
    expect(resolveUnlockRequired(-5, 'rare', policy)).toBe(60)
    expect(resolveUnlockRequired(12.5, 'rare', policy)).toBe(60)
    expect(resolveUnlockRequired(null, 'rare', policy)).toBe(60)
  })
})

describe('클라이언트·서버 경계', () => {
  it('lockAssignment.ts는 서버 전용 모듈을 정적·동적 어느 쪽으로도 가져오지 않는다', () => {
    const source = readFileSync(fileURLToPath(new URL('../lockAssignment.ts', import.meta.url)), 'utf8')
    const specifiers = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(specifiers.sort()).toEqual(['@/lib/jam/policy', '@/types/database'])
    // 위 두 가져오기는 `import type`이라 런타임에 지워진다 — 값 가져오기가 아니어야 한다
    expect(source).not.toMatch(/^import (?!type\b)/m)
    for (const forbidden of ['@/lib/supabase/server', 'next/headers', 'server-only', 'syncIssueRun', 'issueFollowUp']) {
      expect(source.split('\n').filter((line) => !line.trim().startsWith('*') && line.includes(forbidden))).toEqual([])
    }
  })
})
