/**
 * 행 전체 클릭 = 상세 이동 판정(순수 함수, 티켓 20260924_0940 상위 티켓 §1-4).
 * DOM 접근은 `data-table.tsx`가 하고, 여기는 그 결과만 받아 "이동할지"만 판정한다 —
 * vitest가 `environment: 'node'`라 DOM 없이 테스트하기 위한 분리다.
 */
export interface RowClickInfo {
  /** 안쪽 요소가 이미 `preventDefault()`를 호출했는지(예: 링크의 자체 처리) */
  defaultPrevented: boolean
  /** `MouseEvent.button` — 0이 주 버튼(왼쪽 클릭) */
  button: number
  /** 클릭 지점(`event.target`)이 실제로 행 DOM(`currentTarget`) 안에 있는지.
   *  포털 대화상자(AlertDialog 등)의 클릭이 React 트리를 타고 올라와 행의 onClick까지
   *  버블링되는 경우를 막는다 — 실제 DOM containment로만 판정 가능하다 */
  targetInsideRow: boolean
  /** 클릭 지점 또는 그 조상이 상호작용 요소(`a`·`button`·`input`·`label`·
   *  `[role=switch]`·`[role=checkbox]`)인지 */
  targetIsInteractive: boolean
  /** 현재 텍스트를 드래그로 선택 중인지(`window.getSelection()`이 비어 있지 않음) */
  hasTextSelection: boolean
}

/** 위 조건을 모두 통과해야만 행 클릭을 "상세 이동"으로 본다 */
export function shouldNavigateOnRowClick(info: RowClickInfo): boolean {
  if (info.defaultPrevented) return false
  if (info.button !== 0) return false
  if (!info.targetInsideRow) return false
  if (info.targetIsInteractive) return false
  if (info.hasTextSelection) return false
  return true
}
