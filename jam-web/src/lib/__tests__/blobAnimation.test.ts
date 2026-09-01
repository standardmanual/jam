/**
 * 블롭 애니메이션 파라미터 정규화 테스트 (20260901_1944).
 *
 * 이 값은 jsonb 컬럼에서 그대로 올라오므로 스키마 검증이 없다. 배경은 장식이라 잘못된 데이터
 * 하나로 상세화면이 죽으면 안 되고, 반대로 범위를 벗어난 값이 그대로 렌더러에 들어가면
 * 반지름·blur가 폭주한다 — 두 경계를 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  BLOB_ANIMATION_RANGES,
  DEFAULT_BLOB_ANIMATION,
  blobBlurRadiusPx,
  blobCycleSeconds,
  opaqueBlobFill,
  parseBlobAnimation,
} from '@/lib/blobAnimation'

/** sRGB 상대 휘도 (WCAG 2.x) */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** 흰 텍스트(`--color-text` = #ffffff)와 주어진 면색의 명도대비 */
function contrastWithWhite(rgb: { r: number; g: number; b: number }): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05)
}

describe('애니메이션 없음으로 판정되는 값', () => {
  it.each([[null], [undefined], [0], ['blob'], [[]], [{}], [{ type: 'shader' }]])(
    '%o 은 null이다',
    (value) => {
      expect(parseBlobAnimation(value)).toBeNull()
    }
  )
})

describe('정상 파라미터', () => {
  it('저장된 값을 그대로 돌려준다', () => {
    expect(parseBlobAnimation(DEFAULT_BLOB_ANIMATION)).toEqual(DEFAULT_BLOB_ANIMATION)
  })

  it('JSON 왕복(직렬화 → 파싱) 후에도 동일하다', () => {
    const roundTripped = JSON.parse(JSON.stringify(DEFAULT_BLOB_ANIMATION))
    expect(parseBlobAnimation(roundTripped)).toEqual(DEFAULT_BLOB_ANIMATION)
  })
})

describe('깨진 필드 보정', () => {
  it('범위를 벗어난 숫자는 범위 안으로 클램프한다', () => {
    const parsed = parseBlobAnimation({
      ...DEFAULT_BLOB_ANIMATION,
      speed: 999,
      blur: -5,
      scale: 12,
      seed: 1000,
    })
    expect(parsed?.speed).toBe(BLOB_ANIMATION_RANGES.speed.max)
    expect(parsed?.blur).toBe(BLOB_ANIMATION_RANGES.blur.min)
    expect(parsed?.scale).toBe(BLOB_ANIMATION_RANGES.scale.max)
    expect(parsed?.seed).toBe(BLOB_ANIMATION_RANGES.seed.max)
  })

  it('숫자가 아닌 값은 기본값으로 되돌린다', () => {
    const parsed = parseBlobAnimation({ ...DEFAULT_BLOB_ANIMATION, speed: 'fast', blur: null })
    expect(parsed?.speed).toBe(DEFAULT_BLOB_ANIMATION.speed)
    expect(parsed?.blur).toBe(DEFAULT_BLOB_ANIMATION.blur)
  })

  it('색상은 항상 4개이고, 형식이 어긋난 자리만 기본 색으로 메운다', () => {
    const parsed = parseBlobAnimation({
      ...DEFAULT_BLOB_ANIMATION,
      colors: ['#000000', 'red', '#ABCDEF'],
      bgColor: 'white',
    })
    expect(parsed?.colors).toEqual([
      '#000000',
      DEFAULT_BLOB_ANIMATION.colors[1],
      '#abcdef',
      DEFAULT_BLOB_ANIMATION.colors[3],
    ])
    expect(parsed?.bgColor).toBe(DEFAULT_BLOB_ANIMATION.bgColor)
  })

  it('예전 speed 범위(0.1~5)로 저장된 값도 새 범위 안으로 클램프한다', () => {
    // 슬라이더 범위를 0.25~2.5로 좁힌 뒤에도 기존 DB 값이 렌더러·슬라이더와 어긋나면 안 된다.
    expect(parseBlobAnimation({ ...DEFAULT_BLOB_ANIMATION, speed: 0.1 })?.speed).toBe(
      BLOB_ANIMATION_RANGES.speed.min
    )
    expect(parseBlobAnimation({ ...DEFAULT_BLOB_ANIMATION, speed: 5 })?.speed).toBe(
      BLOB_ANIMATION_RANGES.speed.max
    )
  })
})

describe('블롭이 덮지 않은 면(= bgColor)의 기본 대비', () => {
  /**
   * 주의 — 이 테스트가 고정하는 것은 **블롭이 없는 곳**의 대비다. 텍스트 바로 뒤 최상단 레이어는
   * 대개 블롭이고, 밝은 팔레트 색(`#ffe5d1`)이 지날 때는 1.9:1까지 떨어진다. 그 구간의 실질
   * 가독성은 `getBadgeThemedTextStyle`의 텍스트 그림자가 지탱한다(이 모듈의 책임이 아니다).
   * 여기서 막는 회귀는 "기본 배경색이 흰색이라 블롭 사이 여백에서 배지명이 통째로 사라지던 것"이다.
   */
  it('기본 배경색은 카드 안 흰 텍스트와 WCAG AA(4.5:1)를 넘는 대비를 갖는다', () => {
    expect(contrastWithWhite(hexToRgb(DEFAULT_BLOB_ANIMATION.bgColor))).toBeGreaterThan(4.5)
  })
})

describe('prefers-reduced-transparency 경로의 블롭 면색', () => {
  /**
   * 예전에는 이 신호에서 알파만 0.7 → 1.0으로 올렸고, 그러면 밝은 팔레트 색이 더 밝아져 흰
   * 텍스트 대비가 오히려 악화됐다(접근성 역행). 지금은 색을 배경색 쪽으로 미리 섞어 결과 색이
   * "일반 경로에서 블롭 한 장이 배경 위에 놓인 합성색"과 같아지도록 한다.
   */
  const { bgColor } = DEFAULT_BLOB_ANIMATION

  it.each(DEFAULT_BLOB_ANIMATION.colors)('%s — 일반 경로 1겹 합성색과 동일하다', (hex) => {
    const fg = hexToRgb(hex)
    const bg = hexToRgb(bgColor)
    const expected = {
      r: Math.round(bg.r + (fg.r - bg.r) * 0.7),
      g: Math.round(bg.g + (fg.g - bg.g) * 0.7),
      b: Math.round(bg.b + (fg.b - bg.b) * 0.7),
    }
    expect(opaqueBlobFill(hex, bgColor)).toEqual(expected)
  })

  it.each(DEFAULT_BLOB_ANIMATION.colors)(
    '%s — 흰 텍스트 대비가 알파만 올리던 예전 방식보다 나아진다',
    (hex) => {
      // 예전 방식 = 팔레트 색 그대로 알파 1.0
      const before = contrastWithWhite(hexToRgb(hex))
      const after = contrastWithWhite(opaqueBlobFill(hex, bgColor))
      expect(after).toBeGreaterThanOrEqual(before)
    }
  )

  it.each(DEFAULT_BLOB_ANIMATION.colors)(
    '%s — 흰 텍스트 대비가 일반 경로(알파 0.7 1겹)보다 나빠지지 않는다',
    (hex) => {
      const fg = hexToRgb(hex)
      const bg = hexToRgb(bgColor)
      const normalPath = {
        r: bg.r + (fg.r - bg.r) * 0.7,
        g: bg.g + (fg.g - bg.g) * 0.7,
        b: bg.b + (fg.b - bg.b) * 0.7,
      }
      // 반올림 오차(채널당 최대 0.5)만 허용한다.
      expect(contrastWithWhite(opaqueBlobFill(hex, bgColor))).toBeGreaterThan(
        contrastWithWhite(normalPath) - 0.01
      )
    }
  )
})

describe('blur 반경 계산 (20260902_0629 — CSS filter 전환 후에도 계산식은 동일)', () => {
  it('minDim·blur에 선형 비례한다(× 0.15)', () => {
    expect(blobBlurRadiusPx(0.5, 400, false)).toBeCloseTo(0.5 * 400 * 0.15, 5)
    expect(blobBlurRadiusPx(1, 400, false)).toBeCloseTo(blobBlurRadiusPx(0.5, 400, false) * 2, 5)
  })

  it('opaque(reduced-transparency)에서는 절반으로 줄어든다', () => {
    const normal = blobBlurRadiusPx(DEFAULT_BLOB_ANIMATION.blur, 400, false)
    const opaque = blobBlurRadiusPx(DEFAULT_BLOB_ANIMATION.blur, 400, true)
    expect(opaque).toBeCloseTo(normal / 2, 5)
  })

  it('blur가 0이면 반경도 0이다', () => {
    expect(blobBlurRadiusPx(0, 400, false)).toBe(0)
  })
})

describe('속도 라벨용 주기 계산', () => {
  it('속도가 빠를수록 한 바퀴 시간이 짧아지고, 배수만큼 반비례한다', () => {
    expect(blobCycleSeconds(1)).toBeCloseTo(4 * Math.PI, 5)
    expect(blobCycleSeconds(2)).toBeCloseTo(blobCycleSeconds(1) / 2, 5)
  })
})
