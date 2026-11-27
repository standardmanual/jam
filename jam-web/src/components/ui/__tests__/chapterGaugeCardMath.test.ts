/**
 * 챕터 게이지 카드 수치 (티켓 20261127_1733)
 *
 * 고정하는 것
 *  - 채움 정도: 필요량이 없으면(챕터 10) 가득, 0 이하·숫자가 아니면 0, 범위 밖 값은 0~1로 자른다.
 *  - 채움 길이 = 칩 폭 44 + (트랙 안쪽 폭 - 44) × 정도. 정도가 0이어도 칩 폭 아래로 내려가지 않는다.
 *  - 숫자 자리: 채움 길이가 «칩 44 + 간격 4 + 글자 수 × 12.5 + 12» 이상이면 안, 아니면 밖. 경계값 양쪽.
 *  - 숫자 글자: 천 단위 쉼표, 소수 버림, 음수·숫자 아님은 0.
 *  - 이동 시간: 거리에 비례해 700~1500ms.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/chapterGaugeCardMath.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  CHAPTER_CHIP_WIDTH_PX,
  ENTRY_DELAY_MS,
  ENTRY_MS,
  MOVE_MAX_MS,
  MOVE_MIN_MS,
  chapterFillRatio,
  fillWidthPx,
  formatGemCount,
  insideNumberNeededPx,
  moveDurationMs,
  numberPlacement,
} from '../chapterGaugeCardMath'

describe('채움 정도', () => {
  it('필요량이 없으면(챕터 10) 가득이다', () => {
    expect(chapterFillRatio(0, null)).toBe(1)
    expect(chapterFillRatio(1200, null)).toBe(1)
  })
  it('채운 양 ÷ 필요량이고 0~1로 자른다', () => {
    expect(chapterFillRatio(0, 2344)).toBe(0)
    expect(chapterFillRatio(1172, 2344)).toBe(0.5)
    expect(chapterFillRatio(2344, 2344)).toBe(1)
    expect(chapterFillRatio(5000, 2344)).toBe(1)
    expect(chapterFillRatio(-5, 2344)).toBe(0)
  })
  it('필요량이 0 이하이거나 숫자가 아니면 0이다', () => {
    expect(chapterFillRatio(10, 0)).toBe(0)
    expect(chapterFillRatio(10, -3)).toBe(0)
    expect(chapterFillRatio(10, Number.NaN)).toBe(0)
    expect(chapterFillRatio(Number.NaN, 100)).toBe(0)
  })
})

describe('채움 길이', () => {
  it('정도 0은 칩 폭, 정도 1은 트랙 안쪽 폭이다', () => {
    expect(fillWidthPx(298, 0)).toBe(CHAPTER_CHIP_WIDTH_PX)
    expect(fillWidthPx(298, 1)).toBe(298)
    expect(fillWidthPx(298, 0.5)).toBe(44 + (298 - 44) / 2)
  })
  it('트랙이 칩보다 좁아도 칩 폭 아래로 내려가지 않는다', () => {
    expect(fillWidthPx(30, 1)).toBe(CHAPTER_CHIP_WIDTH_PX)
  })
})

describe('모은 잼 숫자 자리', () => {
  it('필요 길이는 칩 44 + 간격 4 + 글자 수 × 12.5 + 12다', () => {
    expect(insideNumberNeededPx(1)).toBe(44 + 4 + 12.5 + 12)
    expect(insideNumberNeededPx(5)).toBe(44 + 4 + 62.5 + 12)
  })
  it('경계: 3글자 숫자는 트랙 안쪽 298px에서 494/2,344부터 안, 493부터 밖이다', () => {
    const inner = 298
    expect(numberPlacement(inner, chapterFillRatio(494, 2344), 3)).toBe('inside')
    expect(numberPlacement(inner, chapterFillRatio(493, 2344), 3)).toBe('outside')
  })
  it('글자 폭을 키워 받으면(기준 글자 크기 확대) 필요 길이와 경계가 따라 움직인다', () => {
    // 125% 확대: 글자 폭 12.5 × 1.25
    const wide = 12.5 * 1.25
    expect(insideNumberNeededPx(3, wide)).toBe(44 + 4 + 3 * wide + 12)
    // 100%에서는 안인 494가 확대하면 밖이 된다(숫자가 칩을 덮지 않게)
    expect(numberPlacement(298, chapterFillRatio(494, 2344), 3, wide)).toBe('outside')
    expect(numberPlacement(298, chapterFillRatio(494, 2344), 3)).toBe('inside')
  })
  it('채움 길이가 필요 길이와 정확히 같으면 안이다', () => {
    // 1글자 숫자의 필요 길이(72.5)에 채움 길이가 닿는 정도를 거꾸로 구한다
    const needed = insideNumberNeededPx(1)
    const inner = 244
    const ratio = (needed - CHAPTER_CHIP_WIDTH_PX) / (inner - CHAPTER_CHIP_WIDTH_PX)
    expect(fillWidthPx(inner, ratio)).toBeCloseTo(needed, 10)
    expect(numberPlacement(inner, ratio + 0.0001, 1)).toBe('inside')
    expect(numberPlacement(inner, ratio - 0.0001, 1)).toBe('outside')
  })
  it('값 0은 밖이고, 가득은 안이다(5자리 숫자도)', () => {
    expect(numberPlacement(298, 0, 1)).toBe('outside')
    expect(numberPlacement(298, 1, 6)).toBe('inside')
  })
  it('트랙 폭을 모르면 밖이다', () => {
    expect(numberPlacement(0, 1, 1)).toBe('outside')
    expect(numberPlacement(Number.NaN, 1, 1)).toBe('outside')
  })
})

describe('숫자 글자', () => {
  it('천 단위 쉼표를 넣는다', () => {
    expect(formatGemCount(0)).toBe('0')
    expect(formatGemCount(465)).toBe('465')
    expect(formatGemCount(2344)).toBe('2,344')
    expect(formatGemCount(123456)).toBe('123,456')
  })
  it('소수는 버리고 음수·숫자 아님은 0이다', () => {
    expect(formatGemCount(1500.9)).toBe('1,500')
    expect(formatGemCount(-3)).toBe('0')
    expect(formatGemCount(Number.NaN)).toBe('0')
  })
})

describe('모션 시간', () => {
  it('진입은 260ms 쉰 뒤 1,500ms다', () => {
    expect(ENTRY_DELAY_MS).toBe(260)
    expect(ENTRY_MS).toBe(1500)
  })
  it('이동 시간은 거리에 비례해 700~1500ms 안이다', () => {
    expect(moveDurationMs(0.3, 0.3)).toBe(MOVE_MIN_MS)
    expect(moveDurationMs(0, 1)).toBe(MOVE_MAX_MS)
    expect(moveDurationMs(1, 0)).toBe(MOVE_MAX_MS)
    expect(moveDurationMs(0, 0.5)).toBe(1100)
  })
})
