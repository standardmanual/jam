/**
 * 고르기 화면 진입 판정 (티켓 20261021_1247 1회, 사용자 결정 1)
 *
 * 고정하는 것
 *  - 판정 기준은 `tribe_id` 하나다. 트라이브가 있으면 홈으로 보낸다. 완료 시각(`onboarding_completed_at`)은 보지 않는다 —
 *    공용 DB에는 완료 시각은 있는데 트라이브가 없는 계정이 있고, 그 계정이 홈으로 되돌려지면 `(main)` 레이아웃 게이트와 서로 보내는 반복이 생긴다.
 *  - 트라이브가 없고 아이디가 있으면 곧장 트라이브 단계다(아이디·이름·프로필 이미지를 그대로 이어받는다).
 *  - 트라이브도 아이디도 없으면 아이디 단계부터다. 행이 없어도 같다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(onboarding)/onboarding/__tests__/onboarding-entry.test.ts"
 */
import { describe, it, expect } from 'vitest'
import { resolveOnboardingEntry, type OnboardingUserRow } from '../onboarding-entry'

const row = (overrides: Partial<OnboardingUserRow> & Record<string, unknown> = {}): OnboardingUserRow => ({
  username: 'runner',
  display_name: '러너',
  avatar_url: 'https://example.com/a.png',
  tribe_id: null,
  ...overrides,
})

describe('resolveOnboardingEntry', () => {
  it('트라이브가 있으면 홈으로 보낸다', () => {
    expect(resolveOnboardingEntry(row({ tribe_id: 'tribe-1' }))).toEqual({ kind: 'home' })
  })

  it('완료 시각이 있어도 트라이브가 없으면 홈으로 보내지 않는다(트라이브 단계로 간다)', () => {
    const entry = resolveOnboardingEntry(row({ onboarding_completed_at: '2026-09-20T00:00:00.000Z' }))

    expect(entry.kind).toBe('tribe')
  })

  it('완료 시각이 없어도 트라이브가 있으면 홈으로 보낸다', () => {
    const entry = resolveOnboardingEntry(row({ tribe_id: 'tribe-1', onboarding_completed_at: null }))

    expect(entry).toEqual({ kind: 'home' })
  })

  it('트라이브가 없고 아이디가 있으면 곧장 트라이브 단계이며 아이디·이름·프로필 이미지를 이어받는다', () => {
    expect(resolveOnboardingEntry(row())).toEqual({
      kind: 'tribe',
      username: 'runner',
      displayName: '러너',
      avatarUrl: 'https://example.com/a.png',
    })
  })

  it('이름이 비어 있으면 빈 문자열로 이어받는다', () => {
    const entry = resolveOnboardingEntry(row({ display_name: null }))

    expect(entry).toMatchObject({ kind: 'tribe', displayName: '' })
  })

  it('트라이브도 아이디도 없으면 아이디 단계부터다', () => {
    expect(resolveOnboardingEntry(row({ username: null }))).toEqual({
      kind: 'account',
      avatarUrl: 'https://example.com/a.png',
    })
  })

  it('users 행이 없어도 아이디 단계부터다', () => {
    expect(resolveOnboardingEntry(null)).toEqual({ kind: 'account', avatarUrl: null })
    expect(resolveOnboardingEntry(undefined)).toEqual({ kind: 'account', avatarUrl: null })
  })

  it('tribe_id가 빈 문자열이면 트라이브가 없는 것이다', () => {
    expect(resolveOnboardingEntry(row({ tribe_id: '' })).kind).toBe('tribe')
    expect(resolveOnboardingEntry(row({ tribe_id: '', username: null })).kind).toBe('account')
  })
})
