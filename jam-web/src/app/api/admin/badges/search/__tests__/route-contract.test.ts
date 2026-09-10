/**
 * 어드민 배지 검색 API — admin_category 포함 계약 회귀 (티켓 20260910_2055 AC6)
 *
 * `/admin/itembooks`의 "필수 액티비티 배지" 검색은 이 라우트를 그대로 쓴다
 * (`ItemBookForm.tsx` → `BadgeSearchSelect.tsx`). JAM! 카테고리 배지는 시뮬레이터·
 * activity-badge-image와 달리 **제외하지 않는다** — 게이트미션과 같은 정책으로, 검색
 * 결과·라벨에 구분 표시만 붙여 정상 노출·선택 가능해야 한다(AC6). 이 라우트가
 * `admin_category`를 응답에서 빠뜨리면 `BadgeSearchSelect`가 구분 라벨을 붙일 재료 자체가
 * 없어진다.
 *
 * 실행: `npx vitest run src/app/api/admin/badges/search/__tests__/route-contract.test.ts`
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

const routeCode = codeOf('src/app/api/admin/badges/search/route.ts')

describe('GET /api/admin/badges/search — admin_category를 제외하지 않고 그대로 내려준다', () => {
  it('select() 컬럼 목록에 admin_category가 있다', () => {
    const selectLine = routeCode.match(/\.select\('[^']*'\)/)
    expect(selectLine).not.toBeNull()
    expect(selectLine![0]).toContain('admin_category')
  })

  it("admin_category를 걸러내는 필터(.eq/.neq/.is 등)를 추가하지 않았다 — 제외하지 않는 정책", () => {
    expect(routeCode).not.toMatch(/admin_category['"]?\s*,\s*['"]jam['"]/)
    expect(routeCode).not.toContain("admin_category', 'jam'")
    expect(routeCode).not.toContain("'admin_category.neq")
    expect(routeCode).not.toContain("'admin_category.is")
  })
})
