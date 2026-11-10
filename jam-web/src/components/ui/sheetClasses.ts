import type { CSSProperties } from 'react'

/**
 * 바텀시트 안에서 같이 쓰는 클래스 (티켓 20261110_2150, 캔버스 «JAM! 바텀시트» 기준).
 * `BottomSheet`는 포털·훅이 있어 시험에서 대역으로 바뀌므로, 호출부가 가져다 쓰는 값은 이 모듈에 따로 둔다.
 */

/** 시트 안 버튼의 세로 패딩 — 높이 56px(위아래 15px + 1px 테두리 + 줄 높이 24px). `Button` 기본 py-[13px](높이 52px)를 `!`로 덮는다. */
export const SHEET_BUTTON_CLASS = 'py-[15px]!'

/** 시트 본문 문장의 행간 — 16px 글자에 1.4배(22px). 문단 사이 간격은 `gap-1`(4px)이다. */
export const SHEET_TEXT_LEADING = 'leading-[1.4]'

/** 시트 안 값 행(`ListRow tone="flat"` 라벨+값)의 높이 — 위아래 8px, 최소 높이 44px 해제(누르는 행이 아니다). 행 사이 선은 `separator`로 긋는다. */
export const SHEET_VALUE_ROW_STYLE = {
  '--list-row-padding-y': '8px',
  '--touch-target-min': '0px',
} as CSSProperties
