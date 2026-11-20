/**
 * 제목 속 칩 쪼개기 (티켓 20261120_2144)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/titleChips.test.ts
 */
import { describe, it, expect } from 'vitest'
import { splitTitleByWords, MAX_TITLE_CHIPS, type TitlePiece } from '../titleChips'

const join = (pieces: TitlePiece[]) => pieces.map((p) => p.text).join('')
const chips = (pieces: TitlePiece[]) => pieces.filter((p) => p.type === 'chip').map((p) => p.text)

describe('splitTitleByWords', () => {
  it('낱말이 제목에 있으면 그 자리를 칩 조각으로 쪼갠다', () => {
    expect(splitTitleByWords('이번 주말 문경에서 달려요', ['문경'])).toEqual([
      { type: 'text', text: '이번 주말 ' },
      { type: 'chip', text: '문경', wordIndex: 0 },
      { type: 'text', text: '에서 달려요' },
    ])
  })

  it('제목 맨 앞·맨 끝 낱말은 빈 글자 조각을 만들지 않는다', () => {
    expect(splitTitleByWords('문경 달리기 완주', ['문경', '완주'])).toEqual([
      { type: 'chip', text: '문경', wordIndex: 0 },
      { type: 'text', text: ' 달리기 ' },
      { type: 'chip', text: '완주', wordIndex: 1 },
    ])
  })

  it('낱말이 제목에 없으면 무시하고, 모두 무시되면 제목 전체를 글자 조각 하나로 돌려준다', () => {
    expect(splitTitleByWords('주말 달리기', ['문경'])).toEqual([{ type: 'text', text: '주말 달리기' }])
  })

  it('목록이 비면 제목만 돌려준다', () => {
    expect(splitTitleByWords('주말 달리기', [])).toEqual([{ type: 'text', text: '주말 달리기' }])
  })

  it('빈 제목은 빈 배열이다', () => {
    expect(splitTitleByWords('', ['문경'])).toEqual([])
  })

  it('낱말은 앞의 2개만 쓴다', () => {
    const pieces = splitTitleByWords('가 나 다 라', ['가', '나', '다'])
    expect(MAX_TITLE_CHIPS).toBe(2)
    expect(chips(pieces)).toEqual(['가', '나'])
  })

  it('같은 낱말이 제목에 여러 번 나오면 처음 나온 곳만 칩이 된다', () => {
    const pieces = splitTitleByWords('달리기 또 달리기', ['달리기'])
    expect(chips(pieces)).toEqual(['달리기'])
    expect(pieces[0]).toEqual({ type: 'chip', text: '달리기', wordIndex: 0 })
    expect(pieces[1]).toEqual({ type: 'text', text: ' 또 달리기' })
  })

  it('같은 낱말을 목록에 두 번 넣어도 한 번만 칩이 된다', () => {
    expect(chips(splitTitleByWords('문경 여행', ['문경', '문경']))).toEqual(['문경'])
  })

  it('낱말끼리 겹치면 제목에서 먼저 시작하는 쪽을 쓴다', () => {
    expect(chips(splitTitleByWords('A문경새재', ['문경새재', 'A문']))).toEqual(['A문'])
  })

  it('«문경»과 «문경새재»처럼 같은 자리에서 시작하면 목록에서 앞선 쪽을 쓴다', () => {
    expect(chips(splitTitleByWords('문경새재 걷기', ['문경', '문경새재']))).toEqual(['문경'])
    expect(chips(splitTitleByWords('문경새재 걷기', ['문경새재', '문경']))).toEqual(['문경새재'])
  })

  it('겹치지 않는 두 낱말은 둘 다 칩이 되고 wordIndex로 목록 위치를 알 수 있다', () => {
    const pieces = splitTitleByWords('서울 부산 달리기', ['부산', '서울'])
    expect(pieces.filter((p) => p.type === 'chip')).toEqual([
      { type: 'chip', text: '서울', wordIndex: 1 },
      { type: 'chip', text: '부산', wordIndex: 0 },
    ])
  })

  it('빈 문자열·공백뿐인 낱말은 무시한다', () => {
    expect(splitTitleByWords('주말 달리기', ['', '  '])).toEqual([{ type: 'text', text: '주말 달리기' }])
    expect(chips(splitTitleByWords('주말 달리기', ['', '달리기']))).toEqual(['달리기'])
  })

  it.each([
    ['이번 주말 문경에서 달려요', ['문경']],
    ['문경 달리기 완주', ['문경', '완주']],
    ['달리기 또 달리기', ['달리기']],
    ['주말 달리기', ['없는말']],
    ['A문경새재', ['문경새재', 'A문']],
    ['가 나 다', ['가', '나', '다']],
  ])('조각을 이어 붙이면 제목 원문과 같다: %s', (title, words) => {
    expect(join(splitTitleByWords(title, words))).toBe(title)
  })
})
