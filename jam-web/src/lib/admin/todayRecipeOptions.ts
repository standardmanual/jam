/**
 * 어드민 투데이 카드 폼의 레시피 선택지 — 티켓 20261006_1218
 *
 * 레시피 공개 카드(`recipe_reveal`)가 가리킬 레시피를 고르는 목록이다. 서버 페이지(`today/new`·`today/[id]/edit`)가
 * 읽은 행을 이 함수로 「이름 · 공개 상태」 한 줄로 바꿔 폼에 넘긴다 — 상태는 어드민 레시피 목록의 「상태」 열과 같은
 * 판정 하나(`recipeStatusDisplay`)를 쓴다. 시각에 기대는 라벨이라 서버에서 만들어 넘긴다(클라이언트에서 만들면
 * 서버 렌더와 하이드레이션 값이 갈릴 수 있다).
 */
import { recipeStatusDisplay } from './recipe-list'
import type { CombinationRecipeRow } from '@/types/database'

/** 선택지에 필요한 레시피 행의 칸 */
export type TodayRecipeOptionRow = Pick<CombinationRecipeRow, 'id' | 'name' | 'valid_from' | 'valid_until'>

export interface TodayRecipeOption {
  id: string
  label: string
}

export const TODAY_RECIPE_OPTION_COLUMNS = 'id, name, valid_from, valid_until'

export function toTodayRecipeOptions(rows: readonly TodayRecipeOptionRow[], now: Date = new Date()): TodayRecipeOption[] {
  return rows.map((row) => ({
    id: row.id,
    label: `${row.name?.trim() || '(이름 없음)'} · ${recipeStatusDisplay(row, now).label}`,
  }))
}
