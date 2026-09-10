/**
 * 게이트미션 계열 선택지 — JAM! 카테고리 포함 계약 회귀 (티켓 20260910_2055 AC5)
 *
 * `/admin/gate-missions`의 계열 선택지는 원래 "**계열 키(family_key)가 발급된 계열만**"
 * 고를 수 있다 — 일반 활동 배지는 가진다. 그런데 JAM! 카테고리(`admin_category='jam'`)
 * 배지는 활동 종목이 없어 `family_key`를 발급하지 않는다(`buildFamilyKey`의 전제인
 * activityType이 없음). `family_key`가 비어 있으면 `badge-families.ts`의
 * `groupBadgesIntoFamilies`가 `familyKeyOf()`의 `#name:` 폴백 키로만 묶고, 그 결과
 * `BadgeFamily.familyKey`는 null로 남는다 — 원래의 `.filter((f) => !!f.familyKey)` 그대로면
 * JAM! 배지는 **드롭다운에 아예 뜨지 않는다.**
 *
 * `loadOwnedFamilyTiers`(`visibility-server.ts`)는 이미 이 `#name:` 폴백 키를
 * `family_key IS NULL` + 이름 매칭으로 평가하도록 만들어져 있으므로(일반 "계열 키 없음"
 * 배지의 게이트 판정과 같은 경로), 어드민 화면의 필터만 풀어주면 된다 — 이 테스트는 그
 * 예외 분기가 실제로 있는지 소스 대조로 지킨다.
 *
 * page.tsx는 서버 컴포넌트(next/headers 의존)라 직접 렌더 테스트가 무겁다 —
 * `api/admin/badges/__tests__/route-contract.test.ts`와 같은 소스 대조 방식을 쓴다.
 *
 * 실행: `npx vitest run src/app/admin/gate-missions/__tests__/gate-family-options-contract.test.ts`
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

const pageCode = codeOf('src/app/admin/gate-missions/page.tsx')

describe('families 조립 — family_key 없어도 admin_category=jam이면 예외로 포함한다', () => {
  it("필터가 !!f.familyKey 단독이 아니라 f.adminCategory === 'jam'도 OR로 받는다", () => {
    const filterLine = pageCode.match(/\.filter\(\(f\) => [^\n]*\)/)
    expect(filterLine).not.toBeNull()
    expect(filterLine![0]).toContain('f.familyKey')
    expect(filterLine![0]).toContain("f.adminCategory === 'jam'")
  })

  it('familyKey가 비어 있으면 계열 키(f.key, #name: 폴백)로 대체한다 — 빈 문자열이 아니다', () => {
    expect(pageCode).toMatch(/familyKey:\s*\(f\.familyKey\s*\?\?\s*f\.key\)/)
  })

  it('GateFamilyOption에 adminCategory를 실어 화면이 라벨을 구분할 수 있게 한다', () => {
    expect(pageCode).toMatch(/adminCategory:\s*f\.adminCategory/)
  })
})
