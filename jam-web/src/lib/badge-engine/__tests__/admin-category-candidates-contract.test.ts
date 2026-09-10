/**
 * 시뮬레이터/동기화 후보 조회 — JAM! 카테고리 제외 계약 회귀 (티켓 20260910_2055)
 *
 * `evaluateBadgesDetailed`는 `strava_activities` 이력 기반이라 `admin_category='jam'`
 * 배지(팔로워 수 등 서비스 사용량 조건)는 이 경로로 **절대 발급되지 않는다** —
 * `evaluateConditionDetailed`가 항상 "평가 가능한 조건 없음"으로 fail 처리한다
 * (`mission-reward-gate.test.ts`가 그 동작을 지킨다). 그 결과 이 배지들은 매번
 * `missed`(미획득) 목록에 쌓여 시뮬레이터·동기화 로그에서 실제 활동 배지 결과를 가린다.
 *
 * 이 테스트는 **후보 조회 단계에서 아예 제외**하는지를 소스 대조로 지킨다 — DB 모킹까지
 * 갖춘 end-to-end 테스트는 `badge-engine-v5.test.ts`가 이미 다루는 다른 축(가입 앵커·
 * 무한레벨·반복형 등)과 맥락이 달라 별도 파일로 둔다. `mission_reward`(같은 자리, 같은
 * 이유로 제외)와 나란히 있어야 회귀를 잡기 쉽다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/admin-category-candidates-contract.test.ts`
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const indexCode = codeOf('src/lib/badge-engine/index.ts')

describe('evaluateBadgesDetailed 후보 조회 — admin_category=jam 제외 (AC7)', () => {
  it('mission_reward와 같은 줄에서 admin_category !== \'jam\'도 함께 거른다', () => {
    // mission_reward 필터링 줄 바로 다음(또는 같은 필터 체인)에서 admin_category를 함께
    // 거르는지 — 별도 쿼리·별도 필터링 경로를 새로 만들지 않았는지 확인한다.
    const filterBlock = indexCode.match(/const allBadges = \(allBadgesRaw[\s\S]*?\?\? null/)
    expect(filterBlock).not.toBeNull()
    expect(filterBlock![0]).toContain("mission_reward")
    expect(filterBlock![0]).toContain("admin_category")
    expect(filterBlock![0]).toContain("!== 'jam'")
  })
})
