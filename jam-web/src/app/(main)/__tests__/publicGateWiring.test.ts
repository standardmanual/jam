/**
 * 서버 페이지의 공개 판정 배선 (티켓 20261001_1418)
 *
 * 판정 함수(`itembook/visibility`·`combine/visibility`)는 단위 테스트가 있지만 서버 컴포넌트는 렌더하지 않아,
 * 페이지에서 호출 줄이 지워져도 CI가 통과했다. 소스 구조로 «어떤 판정이 어디에 걸려 있는가»를 고정한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/__tests__/publicGateWiring.test.ts"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 주석을 걷고 공백을 한 칸으로 줄인 페이지 소스 */
function pageCode(rel: string): string {
  return readFileSync(join(__dirname, '..', rel, 'page.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

describe('/collections/[id] — 공개 전 컬렉션은 404', () => {
  const code = pageCode('collections/[id]')
  it('없는 컬렉션과 열람 불가 컬렉션 모두 notFound()다', () => {
    expect(code).toContain('if (!bookRaw) notFound()')
    expect(code).toContain('if (!isItemBookViewable(book, hasIssuedRecord, nowIso)) notFound()')
  })
  it('공개 전일 때만 발급 기록을 읽어 열람 판정에 넘긴다', () => {
    expect(code).toContain('if (!isItemBookLaunched(book, nowIso)) {')
    expect(code).toMatch(/\.from\('issued_item_books'\)\s*\.select\('item_book_id'\)\s*\.eq\('item_book_id', id\)/)
    expect(code).toContain('hasIssuedRecord = !!issuedRaw')
  })
})

describe('/combine — 레시피 공개 판정', () => {
  const code = pageCode('combine')
  it('운영자도 일반 유저와 같이 공개 중인 레시피만 본다 (티켓 20261110_1030)', () => {
    expect(code).toContain('const releasedRecipes = filterReleasedRecipes(recipes)')
    expect(code).not.toContain('isAdmin')
  })
  it('공개 전 레시피를 구분하는 releaseAt을 내려보내지 않는다 (티켓 20261110_1030)', () => {
    expect(code).not.toContain('releaseAt')
  })
  it('슬롯·보상 조회와 화면 목록이 같은 필터 결과(visibleRecipe*)를 따라온다', () => {
    expect(code).toContain('const visibleRecipeRows = filterRecipesWithLiveResults(releasedRecipes, resultBadgeWindows)')
    expect(code).toContain('const visibleRecipeIds = visibleRecipeRows.map((r) => r.id)')
    expect(code).toContain(".in('recipe_id', visibleRecipeIds)")
    expect(code).toContain('visibleRecipeRows.map((r) => ({')
    expect(code).not.toMatch(/publicRecipe(Rows|Ids)/)
  })
})

describe('/badges — 컬렉션 탭은 내가 개체를 가진 컬렉션만', () => {
  const code = pageCode('badges')
  it('보유 아이템 배지의 item_book_id로만 컬렉션을 읽는다(가진 것 없는 컬렉션은 목록에 없다)', () => {
    expect(code).toMatch(/\.in\('id', ownedBadgeIds\)\s*\.eq\('type', 'item'\)\s*\.not\('item_book_id', 'is', null\)/)
    expect(code).toContain(".from('item_books').select('*').in('id', bookIds)")
  })
})

describe('/badges/[id] — 컬렉션 카드는 열람 가능할 때만', () => {
  const code = pageCode('badges/[id]')
  it('카드 대상이 /collections/[id]에서 404가 되지 않도록 같은 판정(isItemBookViewable)으로 거른다', () => {
    expect(code).toContain(
      'isItemBookViewable(itemBookCandidate, allItemInventory.length > 0, new Date().toISOString()) ? itemBookCandidate : null',
    )
  })
})
