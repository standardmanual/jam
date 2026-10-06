/**
 * 어드민 투데이 카드 폼의 레시피 선택지 (티켓 20261006_1218)
 *
 * 선택지는 「이름 · 공개 상태」 한 줄이다. 상태는 어드민 레시피 목록의 「상태」 열과 같은 판정(`recipeStatusDisplay`)을 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/todayRecipeOptions.test.ts
 */
import { describe, it, expect } from 'vitest'
import { TODAY_RECIPE_OPTION_COLUMNS, toTodayRecipeOptions } from '../todayRecipeOptions'
import { RECIPE_LIST_COLUMNS } from '../recipe-list'

/** 2026-10-05 12:00 KST */
const NOW = new Date('2026-10-05T03:00:00Z')

describe('toTodayRecipeOptions', () => {
  it('공개 전·공개 중·종료 레시피를 이름과 공개 상태 한 줄로 만든다. 순서와 id는 그대로다', () => {
    const options = toTodayRecipeOptions(
      [
        { id: 'r1', name: '가을 믹스', valid_from: '2026-10-09T15:00:00Z', valid_until: null },
        { id: 'r2', name: '여름 믹스', valid_from: '2026-07-01T00:00:00Z', valid_until: null },
        { id: 'r3', name: '봄 믹스', valid_from: '2026-03-01T00:00:00Z', valid_until: '2026-04-01T00:00:00Z' },
      ],
      NOW
    )

    expect(options).toEqual([
      { id: 'r1', label: '가을 믹스 · 공개 예정 2026.10.10 00:00' },
      { id: 'r2', label: '여름 믹스 · 공개 중' },
      { id: 'r3', label: '봄 믹스 · 종료됨' },
    ])
  })

  it('이름이 없는 레시피는 「(이름 없음)」으로 보이고, 공개 시각이 없으면 공개 중이다', () => {
    expect(toTodayRecipeOptions([{ id: 'r1', name: null, valid_from: null, valid_until: null }], NOW)).toEqual([
      { id: 'r1', label: '(이름 없음) · 공개 중' },
    ])
    expect(toTodayRecipeOptions([{ id: 'r2', name: '  ', valid_from: null, valid_until: null }], NOW)[0].label).toBe('(이름 없음) · 공개 중')
  })

  it('행이 없으면 빈 목록이다', () => {
    expect(toTodayRecipeOptions([], NOW)).toEqual([])
  })

  it('읽는 칸은 어드민 레시피 목록이 쓰는 칸의 일부다(이름·공개 시각·종료 시각)', () => {
    const listColumns = RECIPE_LIST_COLUMNS.split(',').map((c) => c.trim())
    for (const column of TODAY_RECIPE_OPTION_COLUMNS.split(',').map((c) => c.trim())) expect(listColumns).toContain(column)
  })
})
