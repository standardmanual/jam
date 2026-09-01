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
})
