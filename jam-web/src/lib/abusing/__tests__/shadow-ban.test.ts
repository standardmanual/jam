/**
 * abusing/shadow-ban — 정책 폴백 방향 회귀 테스트
 *
 * 배경 (티켓 20260831_1259):
 * 1. `DEFAULT_POLICY`의 epic 배율이 `0.0`(차단)인데 운영 행은 `1.00`(차단 꺼짐)이었다.
 *    정책 조회가 한 번만 실패해도 의도적으로 꺼둔 Epic 차단이 켜지는 상태 — 폴백이 장애
 *    대응이 아니라 정책 변경이었다.
 * 2. `shouldAllowDrop`이 `${banLevel}_${rarity}_rate`를 런타임 문자열로 조합하고 결과가 없으면
 *    `?? 1.0`(전면 허용)으로 떨어졌다. 컬럼명 불일치가 곧 차단 해제였고 18일간 무음이었다.
 *
 * 이 파일이 고정하는 불변식:
 * - `DEFAULT_POLICY`는 운영 행의 미러다 (2026-08-31 실측).
 * - 미지 등급은 fail-closed, 값 결여는 `DEFAULT_POLICY` 폴백. 둘 다 `console.error`를 남긴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/shadow-ban.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { BadgeRarity } from '@/types/database'
import { DEFAULT_POLICY, type AbusingPolicy } from '../policy'
import { shouldAllowDrop } from '../shadow-ban'

/** 2026-08-31 12:59 `abusing_policy` id=1 실측값 (읽기 전용 조회) */
const LIVE_RATES = {
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
  hard_mystic_rate: 0.0,
} as const

const livePolicy = (): AbusingPolicy => ({ ...DEFAULT_POLICY, ...LIVE_RATES })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DEFAULT_POLICY — 운영 행의 미러', () => {
  it('배율 8종이 2026-08-31 실측 운영 행과 일치한다', () => {
    for (const [key, value] of Object.entries(LIVE_RATES)) {
      expect(DEFAULT_POLICY[key as keyof AbusingPolicy]).toBe(value)
    }
  })

  it('Epic 차단은 꺼진 상태(1.0)를 유지한다 — 켜는 판단은 별도 티켓', () => {
    // DB를 0.00으로 바꾸는 티켓이 오면 이 기대값도 같은 커밋에서 바꾼다.
    expect(DEFAULT_POLICY.soft_epic_rate).toBe(1.0)
    expect(DEFAULT_POLICY.hard_epic_rate).toBe(1.0)
  })
})

describe('shouldAllowDrop — 정상 경로', () => {
  it('밴이 없으면 정책과 무관하게 항상 허용한다', () => {
    const allZero = Object.fromEntries(
      Object.keys(LIVE_RATES).map((k) => [k, 0])
    ) as unknown as AbusingPolicy
    const policy = { ...DEFAULT_POLICY, ...allZero }
    for (const rarity of ['common', 'rare', 'epic', 'mystic'] as BadgeRarity[]) {
      expect(shouldAllowDrop(rarity, 'none', policy)).toBe(true)
    }
  })

  it('soft 밴 — common·rare·epic 허용, mystic 차단', () => {
    const policy = livePolicy()
    expect(shouldAllowDrop('common', 'soft', policy)).toBe(true)
    expect(shouldAllowDrop('rare', 'soft', policy)).toBe(true)
    expect(shouldAllowDrop('epic', 'soft', policy)).toBe(true)
    expect(shouldAllowDrop('mystic', 'soft', policy)).toBe(false)
  })

  it('hard 밴 — common·epic 허용, rare·mystic 차단', () => {
    const policy = livePolicy()
    expect(shouldAllowDrop('common', 'hard', policy)).toBe(true)
    expect(shouldAllowDrop('epic', 'hard', policy)).toBe(true)
    expect(shouldAllowDrop('rare', 'hard', policy)).toBe(false)
    expect(shouldAllowDrop('mystic', 'hard', policy)).toBe(false)
  })

  it('부분 확률(0 < rate < 1)은 Math.random 롤을 탄다', () => {
    const policy = { ...livePolicy(), soft_rare_rate: 0.3 }
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.29)
    expect(shouldAllowDrop('rare', 'soft', policy)).toBe(true)
    random.mockReturnValue(0.31)
    expect(shouldAllowDrop('rare', 'soft', policy)).toBe(false)
    expect(random).toHaveBeenCalledTimes(2)
  })
})

describe('shouldAllowDrop — 폴백 방향', () => {
  it('맵에 없는 등급은 차단하고 로그를 남긴다 (fail-closed)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const policy = livePolicy()
    // 마이그레이션 115 롤백 구간처럼 DB enum이 TS 타입보다 앞서간 상황
    expect(shouldAllowDrop('legendary' as BadgeRarity, 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('mythic' as BadgeRarity, 'hard', policy)).toBe(false)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(String(spy.mock.calls[0][0])).toContain('legendary')
  })

  it('값이 없으면 DEFAULT_POLICY 값을 쓰고 로그를 남긴다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // hard_rare_rate(기본 0.0) 결여 → 전면 허용이 아니라 여전히 차단
    const withoutHardRare = livePolicy() as unknown as Record<string, unknown>
    delete withoutHardRare.hard_rare_rate
    expect(shouldAllowDrop('rare', 'hard', withoutHardRare as unknown as AbusingPolicy)).toBe(false)

    // soft_epic_rate(기본 1.0) 결여 → 전면 차단이 아니라 여전히 허용
    const withoutSoftEpic = livePolicy() as unknown as Record<string, unknown>
    delete withoutSoftEpic.soft_epic_rate
    expect(shouldAllowDrop('epic', 'soft', withoutSoftEpic as unknown as AbusingPolicy)).toBe(true)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(String(spy.mock.calls[0][0])).toContain('hard_rare_rate')
  })

  it('숫자가 아니거나 NaN이면 DEFAULT_POLICY 값을 쓰고 로그를 남긴다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const nan = { ...livePolicy(), hard_mystic_rate: NaN }
    expect(shouldAllowDrop('mystic', 'hard', nan)).toBe(false)

    const notNumber = { ...livePolicy(), soft_common_rate: null as unknown as number }
    expect(shouldAllowDrop('common', 'soft', notNumber)).toBe(true)

    expect(spy).toHaveBeenCalledTimes(2)
  })
})
