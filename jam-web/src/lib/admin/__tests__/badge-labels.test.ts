/**
 * 어드민 공용 라벨 맵 — JAM! 카테고리 판별 회귀 (티켓 20260910_2055)
 *
 * `admin_category` 컬럼은 체크인 배지 전용 `category`(지점 카테고리)와 이름이 비슷하지만
 * 완전히 별개다. 판별 함수가 이 둘을 섞지 않는지, 모르는 값이 들어와도 화면이 비지
 * 않는지를 지킨다.
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-labels.test.ts`
 */
import { ADMIN_CATEGORIES, ADMIN_CATEGORY_LABEL, adminCategoryLabel, isJamCategoryBadge } from '../badge-labels'

describe('isJamCategoryBadge — admin_category 컬럼으로 직접 판별한다', () => {
  it("admin_category가 'jam'이면 true", () => {
    expect(isJamCategoryBadge('jam')).toBe(true)
  })

  it('null·undefined·다른 문자열은 false — 지점 카테고리 값과 섞이지 않는다', () => {
    expect(isJamCategoryBadge(null)).toBe(false)
    expect(isJamCategoryBadge(undefined)).toBe(false)
    // 지점 카테고리(poi_categories.slug)의 실제 값 예시 — 우연히 같은 값이어도 안 섞인다
    expect(isJamCategoryBadge('hiking-trail')).toBe(false)
  })
})

describe('adminCategoryLabel — 모르는 값이 들어와도 화면이 비지 않는다', () => {
  it('화이트리스트 값은 정의된 한글 라벨을 돌려준다', () => {
    for (const c of ADMIN_CATEGORIES) {
      expect(adminCategoryLabel(c)).toBe(ADMIN_CATEGORY_LABEL[c])
    }
    expect(adminCategoryLabel('jam')).toBe('JAM!')
  })

  it('값이 없으면 null, 화이트리스트 밖 값은 원시값을 그대로 돌려준다', () => {
    expect(adminCategoryLabel(null)).toBeNull()
    expect(adminCategoryLabel(undefined)).toBeNull()
    expect(adminCategoryLabel('__future_category__')).toBe('__future_category__')
  })
})
