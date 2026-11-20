/**
 * 제목 속 칩 — 제목 문자열을 «글자 조각»과 «칩 조각»으로 쪼갠다 (티켓 20261120_2144).
 *
 * 값만 받는 순수 함수다(DB·조회·훅 없음). 제목 문자열은 그대로 두고(기호 삽입 없음) 칩으로 만들 낱말은 목록으로 따로 받는다.
 * 모든 조각의 `text`를 이어 붙이면 제목 원문과 같다(보조 기술이 제목을 한 문장으로 읽는다).
 *
 * 규칙 (PRD §6 「개편 규격」 «제목 속 칩»):
 * - 낱말 목록은 앞의 2개만 쓴다(`MAX_TITLE_CHIPS`). 3개 이상이면 뒤는 버린다. 앞뒤를 가르는 기준은 «입력한 목록의 순서»다
 *   (비었거나 제목에 없는 낱말도 자리를 차지한다. 목록을 저장하는 쪽이 이미 2개 이하로 저장한다).
 * - 빈 문자열(공백뿐인 낱말 포함)은 무시한다. 제목에 없는 낱말은 무시한다.
 * - 같은 낱말이 제목에 여러 번 나오면 처음 나온 곳만 칩으로 만든다.
 * - 낱말끼리 겹치면(«문경»과 «문경새재») 제목에서 먼저 시작하는 쪽을 쓰고, 같은 자리에서 시작하면 목록에서 앞선 쪽을 쓴다. 겹치는 쪽은 무시한다.
 * - 쓸 낱말이 없으면 제목 전체를 글자 조각 하나로 돌려준다(빈 제목은 빈 배열).
 */

export const MAX_TITLE_CHIPS = 2

export type TitlePiece =
  | { type: 'text'; text: string }
  /** `wordIndex`는 입력 낱말 목록에서의 위치다(낱말마다 색을 받을 때 짝을 맞추는 값). */
  | { type: 'chip'; text: string; wordIndex: number }

export function splitTitleByWords(title: string, words: readonly string[]): TitlePiece[] {
  if (title.length === 0) return []

  const candidates: { start: number; end: number; wordIndex: number }[] = []
  words.slice(0, MAX_TITLE_CHIPS).forEach((word, wordIndex) => {
    if (word.trim().length === 0) return
    const start = title.indexOf(word)
    if (start === -1) return
    candidates.push({ start, end: start + word.length, wordIndex })
  })

  // 제목에서 먼저 시작하는 쪽부터, 같은 자리면 목록에서 앞선 쪽부터 확정하고 겹치는 쪽은 버린다.
  candidates.sort((a, b) => a.start - b.start || a.wordIndex - b.wordIndex)
  const accepted: typeof candidates = []
  for (const candidate of candidates) {
    const last = accepted[accepted.length - 1]
    if (last && candidate.start < last.end) continue
    accepted.push(candidate)
  }

  if (accepted.length === 0) return [{ type: 'text', text: title }]

  const pieces: TitlePiece[] = []
  let cursor = 0
  for (const { start, end, wordIndex } of accepted) {
    if (start > cursor) pieces.push({ type: 'text', text: title.slice(cursor, start) })
    pieces.push({ type: 'chip', text: title.slice(start, end), wordIndex })
    cursor = end
  }
  if (cursor < title.length) pieces.push({ type: 'text', text: title.slice(cursor) })
  return pieces
}
