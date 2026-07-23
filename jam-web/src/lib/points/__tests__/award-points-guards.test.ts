/**
 * points/index — awardPoints() 가드 절 유닛 테스트
 *
 * amount===0과 비정수 amount는 supabase 클라이언트를 만들기 전에 조기 반환되므로
 * 네트워크/모킹 없이 순수하게 테스트 가능하다. RPC 호출 자체(성공/실패 경로)는
 * 이 프로젝트에 mocking 컨벤션이 없어 유닛 테스트 범위 밖 — 수동/통합 검증 대상.
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { awardPoints } from '../index'

describe('awardPoints — 조기 반환 가드 (네트워크 호출 전)', () => {
  it('amount가 0이면 null을 반환하고 원장 행을 만들지 않는다', async () => {
    const result = await awardPoints('00000000-0000-0000-0000-000000000000', 0, 'badge_point_reward')
    expect(result).toBeNull()
  })

  it('amount가 정수가 아니면 null을 반환한다', async () => {
    const result = await awardPoints('00000000-0000-0000-0000-000000000000', 1.5, 'mission_point_reward')
    expect(result).toBeNull()
  })

  it('amount가 NaN이면 null을 반환한다', async () => {
    const result = await awardPoints('00000000-0000-0000-0000-000000000000', Number.NaN, 'admin_grant')
    expect(result).toBeNull()
  })
})
