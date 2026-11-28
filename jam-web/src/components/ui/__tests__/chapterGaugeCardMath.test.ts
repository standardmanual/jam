/**
 * 챕터 게이지 카드 수치 (티켓 20261127_1733)
 *
 * 고정하는 것
 *  - 채움 정도: 필요량이 없으면(챕터 10) 가득, 0 이하·숫자가 아니면 0, 범위 밖 값은 0~1로 자른다.
 *  - 채움 길이 = 칩 폭 44 + (트랙 안쪽 폭 - 44) × 정도. 정도가 0이어도 칩 폭 아래로 내려가지 않는다.
 *  - 숫자 자리: 채움 길이가 «칩 44 + 간격 4 + 글자 수 × 12.5 + 12» 이상이면 안, 아니면 밖. 경계값 양쪽.
 *  - 필요 잼 영역(12 + 글자 수 × 10 + 8, 마지막 챕터 0): 바깥 자리는 영역과 안 겹칠 때만, 닿으면 안쪽 클램프(오른쪽 여백을 키움).
 *  - 필요 잼 숫자 걸침: 안 걸침·일부·전부. 글자 150% + 360px 조합에서도 필요 잼 영역을 침범하지 않는다.
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
  collectedNumberPlacement,
  insideNumberNeededPx,
  insideNumberRightPaddingPx,
  moveDurationMs,
  requiredNumberCover,
  requiredReservedPx,
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
    expect(collectedNumberPlacement(inner, chapterFillRatio(494, 2344), 3)).toBe('inside')
    expect(collectedNumberPlacement(inner, chapterFillRatio(493, 2344), 3)).toBe('outside')
  })
  it('글자 폭을 키워 받으면(기준 글자 크기 확대) 필요 길이와 경계가 따라 움직인다', () => {
    // 125% 확대: 글자 폭 12.5 × 1.25
    const wide = 12.5 * 1.25
    expect(insideNumberNeededPx(3, wide)).toBe(44 + 4 + 3 * wide + 12)
    // 100%에서는 안인 494가 확대하면 밖이 된다(숫자가 칩을 덮지 않게)
    expect(collectedNumberPlacement(298, chapterFillRatio(494, 2344), 3, wide)).toBe('outside')
    expect(collectedNumberPlacement(298, chapterFillRatio(494, 2344), 3)).toBe('inside')
  })
  it('채움 길이가 필요 길이와 정확히 같으면 안이다', () => {
    // 1글자 숫자의 필요 길이(72.5)에 채움 길이가 닿는 정도를 거꾸로 구한다
    const needed = insideNumberNeededPx(1)
    const inner = 244
    const ratio = (needed - CHAPTER_CHIP_WIDTH_PX) / (inner - CHAPTER_CHIP_WIDTH_PX)
    expect(fillWidthPx(inner, ratio)).toBeCloseTo(needed, 10)
    expect(collectedNumberPlacement(inner, ratio + 0.0001, 1)).toBe('inside')
    expect(collectedNumberPlacement(inner, ratio - 0.0001, 1)).toBe('outside')
  })
  it('값 0은 밖이고, 가득은 안이다(5자리 숫자도)', () => {
    expect(collectedNumberPlacement(298, 0, 1)).toBe('outside')
    expect(collectedNumberPlacement(298, 1, 6)).toBe('inside')
  })
  it('트랙 폭을 모르면 밖이다', () => {
    expect(collectedNumberPlacement(0, 1, 1)).toBe('outside')
    expect(collectedNumberPlacement(Number.NaN, 1, 1)).toBe('outside')
  })
})

describe('필요 잼 영역', () => {
  it('12 + 글자 수 × 글자 폭 + 8이고 마지막 챕터(0자)는 0이다', () => {
    expect(requiredReservedPx(3)).toBe(12 + 30 + 8)
    expect(requiredReservedPx(7, 10)).toBe(12 + 70 + 8)
    expect(requiredReservedPx(0)).toBe(0)
  })
})

describe('모은 잼 숫자 자리 — 필요 잼 영역', () => {
  const W = 298
  it('채움 안에 둘 폭이 안 되고 바깥 자리도 영역에 닿으면 안쪽(클램프)이다', () => {
    // 글자 150% + 안쪽 300px: 모은 잼 5자(93.75px), 필요 잼 7자(105px) → 영역 125, 바깥 오른쪽 끝 한도 175
    const inner = 300
    const cw = 12.5 * 1.5
    const rw = 10 * 1.5
    const at = (fillEnd: number) => (fillEnd - 44) / (inner - 44)
    // 바깥: 채움 끝 + 8 + 93.75 ≤ 175 → 채움 끝 ≤ 73.25
    expect(collectedNumberPlacement(inner, at(73.25), 5, cw, 7, rw)).toBe('outside')
    expect(collectedNumberPlacement(inner, at(73.4), 5, cw, 7, rw)).toBe('inside')
    // 영역이 없으면 같은 채움 끝도 바깥이다
    expect(collectedNumberPlacement(inner, at(73.4), 5, cw, 0, rw)).toBe('outside')
  })
  it('바깥 자리는 필요 잼 숫자와 8px 이상 떨어진다', () => {
    const inner = 298
    const ratio = chapterFillRatio(40, 870)
    const fillEnd = fillWidthPx(inner, ratio)
    expect(collectedNumberPlacement(inner, ratio, 2, 12.5, 3, 10)).toBe('outside')
    const numberRight = fillEnd + 8 + 2 * 12.5
    const requiredLeft = inner - 12 - 3 * 10
    expect(requiredLeft - numberRight).toBeGreaterThanOrEqual(8)
  })
  it('필요 잼 숫자가 없으면(마지막 챕터) 영역이 없어 바깥은 트랙 끝까지 쓸 수 있다', () => {
    expect(collectedNumberPlacement(W, 0.5, 2, 12.5, 0, 10)).toBe('inside')
    expect(collectedNumberPlacement(W, 1, 5, 12.5, 0, 10)).toBe('inside')
  })
  it('값 0은 바깥이다(필요 잼 영역이 있어도)', () => {
    expect(collectedNumberPlacement(W, 0, 1, 12.5, 3, 10)).toBe('outside')
  })
  it('글자 150% + 360px(안쪽 약 300) + 5자리 조합: 안쪽이어도 필요 잼 영역을 침범하지 않는다', () => {
    const inner = 300
    const cw = 12.5 * 1.5
    const rw = 10 * 1.5
    const ratio = chapterFillRatio(890, 900)
    expect(collectedNumberPlacement(inner, ratio, 3, cw, 3, rw)).toBe('inside')
    // «890»(3자): 오른쪽 끝 = 채움 끝 - 여백. 필요 잼 «900» 영역 = 12 + 45 + 8 = 65 → 235 이하
    const pad = insideNumberRightPaddingPx(inner, ratio, 3, rw)
    expect(fillWidthPx(inner, ratio) - pad).toBeLessThanOrEqual(inner - requiredReservedPx(3, rw) + 1e-9)
  })
})

describe('안쪽 숫자의 오른쪽 여백', () => {
  it('기본은 12다', () => {
    expect(insideNumberRightPaddingPx(298, 0.5, 3, 10)).toBe(12)
    expect(insideNumberRightPaddingPx(298, 1, 0, 10)).toBe(12)
  })
  it('채움 끝이 필요 잼 영역에 닿으면 채움 끝 - (트랙 폭 - 영역)까지 커진다', () => {
    // 8xx/870: 채움 끝 ≈ 44 + 254 × (850/870) = 292.2, 영역 50 → 248 → 여백 ≈ 44.2
    const ratio = chapterFillRatio(850, 870)
    const pad = insideNumberRightPaddingPx(298, ratio, 3, 10)
    expect(pad).toBeCloseTo(fillWidthPx(298, ratio) - 248, 8)
    expect(pad).toBeGreaterThan(12)
    // 숫자 오른쪽 끝(채움 끝 - 여백) = 영역 왼쪽 끝 → 두 숫자 사이는 8 이상(영역의 8이 간격이다)
    expect(fillWidthPx(298, ratio) - pad).toBeCloseTo(248, 8)
  })
  it('트랙 폭을 모르면 12다', () => {
    expect(insideNumberRightPaddingPx(0, 1, 3, 10)).toBe(12)
  })
})

describe('필요 잼 숫자 걸침', () => {
  const W = 298
  // «870»: 숫자 구간 = [298 - 12 - 30, 298 - 12] = [256, 286]
  const at = (fillEnd: number) => (fillEnd - 44) / (W - 44)
  it('채움 끝이 숫자 시작 이하이면 안 걸친다', () => {
    expect(requiredNumberCover(W, 0.2, 3, 10)).toBe('none')
    expect(requiredNumberCover(W, at(256), 3, 10)).toBe('none')
  })
  it('채움 끝이 숫자 중간이면 일부 걸친다', () => {
    expect(requiredNumberCover(W, at(270), 3, 10)).toBe('partial')
    expect(requiredNumberCover(W, at(285.9), 3, 10)).toBe('partial')
  })
  it('채움 끝이 숫자 끝 이상이면 전부 걸친다(가득 포함)', () => {
    expect(requiredNumberCover(W, at(286), 3, 10)).toBe('full')
    expect(requiredNumberCover(W, 1, 3, 10)).toBe('full')
  })
  it('숫자가 없거나(마지막 챕터) 폭을 모르면 none이다', () => {
    expect(requiredNumberCover(W, 1, 0, 10)).toBe('none')
    expect(requiredNumberCover(0, 1, 3, 10)).toBe('none')
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
