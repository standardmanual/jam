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
  blobCycleSeconds,
  parseBlobAnimation,
} from '@/lib/blobAnimation'

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

describe('기본 배경색 가독성', () => {
  it('카드 안 흰 텍스트(--color-text = #ffffff)와 WCAG AA(4.5:1)를 넘는 대비를 갖는다', () => {
    // 기본값이 #ffffff였을 때 '애니메이션'을 고르는 즉시 배지명이 사라졌던 회귀를 고정한다.
    const channel = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const hex = DEFAULT_BLOB_ANIMATION.bgColor
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)))
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const contrast = (1.0 + 0.05) / (luminance + 0.05)
    expect(contrast).toBeGreaterThan(4.5)
  })
})

describe('속도 라벨용 주기 계산', () => {
  it('속도가 빠를수록 한 바퀴 시간이 짧아지고, 배수만큼 반비례한다', () => {
    expect(blobCycleSeconds(1)).toBeCloseTo(4 * Math.PI, 5)
    expect(blobCycleSeconds(2)).toBeCloseTo(blobCycleSeconds(1) / 2, 5)
  })
})
