/**
 * lib/chapter/source-id — 챕터 점수의 결정적 원천 id (티켓 20261019_1315)
 *
 * 고정하는 것:
 * - 같은 입력이면 항상 같은 UUID다(고정 시험 벡터). 값이 바뀌면 이미 센 점수와 키가 달라져 이중 가산이 생기므로 벡터를 바꾸는 일은 곧 호환성 파괴다.
 * - UUID 형식(8-4-4-4-12 소문자 16진수, 버전 8, 변종 10xx)이다.
 * - 입력 순서가 다르면, 조각의 경계가 다르면, 네임스페이스가 다르면, 조각이 하나 더 있으면 값이 다르다.
 * - 빈 네임스페이스·조각 없음·빈 조각은 던진다(서로 다른 입력이 같은 값으로 모이는 것을 막는다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/source-id.test.ts
 */
import { describe, it, expect } from 'vitest'
import { deterministicSourceId } from '../source-id'

const USER = '11111111-1111-4111-8111-111111111111'
const BADGE = '22222222-2222-4222-8222-222222222222'

describe('deterministicSourceId — 고정 벡터', () => {
  it.each([
    [['badge_receive', USER, BADGE], '8689dc9f-6ad2-8a55-8dd9-04737a1783f9'],
    [['badge_receive', BADGE, USER], 'e3ace85e-a2a2-819e-b943-ce3ce9323c07'],
    [['collection_complete', 'user-1', 'book-1', 'common'], '708f1669-354d-818a-8c66-e104d64e9292'],
    [['badge_receive', 'u', 'b', '12345'], 'c2a6f491-39fe-82a6-92d2-d032ce81ba0a'],
    [['badge_receive', 'u', 'b'], '7efd4177-b241-82ea-ad9f-9fcb1b7a9cc9'],
  ] as const)('%j → %s', (input, expected) => {
    const [namespace, ...parts] = input
    expect(deterministicSourceId(namespace, ...parts)).toBe(expected)
  })

  it('같은 입력을 몇 번 불러도 같다', () => {
    const first = deterministicSourceId('badge_receive', USER, BADGE)
    for (let i = 0; i < 5; i += 1) expect(deterministicSourceId('badge_receive', USER, BADGE)).toBe(first)
  })
})

describe('deterministicSourceId — 형식', () => {
  it('UUID 형식이고 버전 8, 변종 10xx다(DB uuid 열에 들어간다)', () => {
    for (const parts of [[USER, BADGE], ['a'], ['x', 'y', 'z']]) {
      const id = deterministicSourceId('ns', ...parts)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })
})

describe('deterministicSourceId — 구별', () => {
  it('입력 순서가 다르면 값이 다르다', () => {
    expect(deterministicSourceId('badge_receive', USER, BADGE)).not.toBe(deterministicSourceId('badge_receive', BADGE, USER))
  })

  it('조각의 경계만 다른 입력은 값이 다르다(구분자 충돌이 없다)', () => {
    expect(deterministicSourceId('ns', 'a', 'bc')).not.toBe(deterministicSourceId('ns', 'ab', 'c'))
    expect(deterministicSourceId('ns', 'a|b', 'c')).not.toBe(deterministicSourceId('ns', 'a', 'b|c'))
    expect(deterministicSourceId('a', 'bc')).not.toBe(deterministicSourceId('ab', 'c'))
  })

  it('네임스페이스가 다르면 값이 다르다', () => {
    expect(deterministicSourceId('badge_receive', USER, BADGE)).not.toBe(deterministicSourceId('collection_complete', USER, BADGE))
  })

  it('조각이 하나 더 있으면 값이 다르다(첫 획득과 반복형 회차의 id가 구분된다)', () => {
    expect(deterministicSourceId('badge_receive', USER, BADGE)).not.toBe(deterministicSourceId('badge_receive', USER, BADGE, '12345'))
  })
})

describe('deterministicSourceId — 잘못된 입력', () => {
  it('빈 네임스페이스·조각 없음·빈 조각은 던진다', () => {
    expect(() => deterministicSourceId('', USER)).toThrow()
    expect(() => deterministicSourceId('ns')).toThrow()
    expect(() => deterministicSourceId('ns', USER, '')).toThrow()
  })
})
