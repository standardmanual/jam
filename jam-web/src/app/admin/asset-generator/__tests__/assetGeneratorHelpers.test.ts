import { describe, expect, it } from 'vitest'
import type { ImageLayerConfig } from '@/lib/asset-generator'
import {
  INITIAL_RIBBON_LAYER,
  buildExportFileName,
  clampDurationSeconds,
  computeEffectiveStartColor,
  createImageLayer,
  deselectIfRemoved,
  generateRandomSeed,
  moveImageLayer,
  removeImageLayer,
  resolveStageSize,
} from '../assetGeneratorHelpers'

function makeImageLayer(id: string, assetUrl = `blob:${id}`): ImageLayerConfig {
  return {
    type: 'image',
    id,
    assetUrl,
    xPct: 50,
    yPct: 50,
    widthPct: 30,
    heightPct: 30,
    rotationDeg: 0,
    opacityPct: 100,
  }
}

describe('resolveStageSize (티켓 20260924_2156, 원본 applyAspect 302줄과 동일해야 한다)', () => {
  it('1:1은 1280 × 1280', () => {
    expect(resolveStageSize('1:1')).toEqual({ width: 1280, height: 1280 })
  })

  it('4:5는 1024 × 1280', () => {
    expect(resolveStageSize('4:5')).toEqual({ width: 1024, height: 1280 })
  })

  it('9:16은 720 × 1280 (반올림)', () => {
    expect(resolveStageSize('9:16')).toEqual({ width: 720, height: 1280 })
  })
})

describe('computeEffectiveStartColor (PRD §6 컬러 규칙)', () => {
  it('연결이 켜져 있으면 배경색을 따른다', () => {
    expect(
      computeEffectiveStartColor({ linkStartToBackground: true, backgroundColor: '#111111', startColor: '#222222' })
    ).toBe('#111111')
  })

  it('연결이 꺼져 있으면 직접 고른 시작 색을 쓴다', () => {
    expect(
      computeEffectiveStartColor({ linkStartToBackground: false, backgroundColor: '#111111', startColor: '#222222' })
    ).toBe('#222222')
  })
})

describe('clampDurationSeconds (원본 readSeconds 515줄과 동일해야 한다)', () => {
  it('1~60 사이 값은 반올림만 한다', () => {
    expect(clampDurationSeconds(12.4)).toBe(12)
    expect(clampDurationSeconds(12.6)).toBe(13)
  })

  it('0 이하이거나 숫자가 아니면 기본값 5초', () => {
    expect(clampDurationSeconds(0)).toBe(5)
    expect(clampDurationSeconds(-3)).toBe(5)
    expect(clampDurationSeconds(Number.NaN)).toBe(5)
  })

  it('1보다 작으면 1로, 60보다 크면 60으로 자른다', () => {
    expect(clampDurationSeconds(0.2)).toBe(1)
    expect(clampDurationSeconds(120)).toBe(60)
  })
})

describe('generateRandomSeed', () => {
  it('주입한 난수 함수를 그대로 써서 0~1e9 사이 정수를 만든다', () => {
    expect(generateRandomSeed(() => 0)).toBe(0)
    expect(generateRandomSeed(() => 0.999999)).toBe(999999000)
  })
})

describe('buildExportFileName (원본 fileName 503줄과 동일해야 한다)', () => {
  it('비율의 콜론을 x로 바꾸고 타임스탬프·확장자를 붙인다', () => {
    const date = new Date(2026, 8, 24, 9, 5, 3) // 2026-09-24 09:05:03 (로컬 시각)
    expect(buildExportFileName('4:5', 'png', date)).toBe('jam-asset_4x5_20260924-090503.png')
  })
})

describe('INITIAL_RIBBON_LAYER (원본 state 초깃값 161~167줄과 값이 같아야 한다)', () => {
  it('기본값이 프로토타입과 일치한다', () => {
    expect(INITIAL_RIBBON_LAYER).toEqual({
      type: 'ribbon',
      source: { kind: 'letter', letter: 'J' },
      sizePct: 22,
      blurPct: 0,
      rotationDeg: 0,
      followPath: false,
      direction: 'h',
      backgroundColor: '#ff1a00',
      startColor: '#ff1a00',
      endColor: '#ff4dff',
      linkStartToBackground: true,
      irregularityPct: 35,
      seed: 7,
      speed: 1500,
      gap: 14,
      count: 260,
    })
  })
})

describe('createImageLayer (레이어 식별 재작업, 티켓 20260924_2157)', () => {
  it('빈 문자열이 아닌 id를 발급하고 order 필드는 없다', () => {
    const layer = createImageLayer('blob:a')
    expect(typeof layer.id).toBe('string')
    expect(layer.id.length).toBeGreaterThan(0)
    expect(layer).not.toHaveProperty('order')
  })

  it('호출할 때마다 서로 다른 id를 발급한다', () => {
    const a = createImageLayer('blob:a')
    const b = createImageLayer('blob:a')
    expect(a.id).not.toBe(b.id)
  })
})

describe('moveImageLayer (id 기반 스왑, 티켓 20260924_2157 재작업)', () => {
  it('경계: 맨 위 레이어를 위로 이동하면 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'a', 'up')
    expect(result).toBe(layers)
  })

  it('경계: 맨 아래 레이어를 아래로 이동하면 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'c', 'down')
    expect(result).toBe(layers)
  })

  it('존재하지 않는 id는 원본을 그대로 돌려준다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b')]
    const result = moveImageLayer(layers, 'z', 'up')
    expect(result).toBe(layers)
  })

  it('스왑: 맨 아래 레이어를 위로 이동하면 바로 위 레이어와 자리를 바꾼다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = moveImageLayer(layers, 'c', 'up')
    expect(result.map((l) => l.id)).toEqual(['a', 'c', 'b'])
  })

  it('스왑 뒤에도 선택된 레이어는 같은 레이어 객체를 그대로 가리킨다', () => {
    // 재현(리뷰 재작업 사유): A·B·C 중 가운데 B(id='b')를 선택한 상태에서 맨 아래 C를 위로
    // 이동하면, 이전(인덱스 기반) 구현은 선택 인덱스 1이 이제 C를 가리켜 버그가 났다.
    // id 기반에서는 selectedId='b'가 배열 위치와 무관하므로 문제가 생기지 않는다.
    const b = makeImageLayer('b')
    const layers = [makeImageLayer('a'), b, makeImageLayer('c')]
    const selectedId = 'b'
    const result = moveImageLayer(layers, 'c', 'up')
    const selectedAfterMove = result.find((l) => l.id === selectedId)
    expect(selectedAfterMove).toBe(b)
  })
})

describe('removeImageLayer (순수 배열 제거, 티켓 20260924_2157 재작업)', () => {
  it('id가 일치하는 레이어만 제거한다', () => {
    const layers = [makeImageLayer('a'), makeImageLayer('b'), makeImageLayer('c')]
    const result = removeImageLayer(layers, 'b')
    expect(result.map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('존재하지 않는 id를 지우려 하면 배열 내용이 그대로다', () => {
    const layers = [makeImageLayer('a')]
    const result = removeImageLayer(layers, 'z')
    expect(result.map((l) => l.id)).toEqual(['a'])
  })
})

describe('deselectIfRemoved (삭제된 레이어가 선택돼 있었으면 해제, 티켓 20260924_2157 재작업)', () => {
  it('삭제한 레이어가 선택돼 있었으면 선택을 해제한다', () => {
    expect(deselectIfRemoved('b', 'b')).toBeNull()
  })

  it('삭제한 레이어가 선택된 레이어가 아니면 선택을 그대로 둔다', () => {
    expect(deselectIfRemoved('b', 'c')).toBe('b')
  })

  it('아무것도 선택돼 있지 않았으면 그대로 null이다', () => {
    expect(deselectIfRemoved(null, 'c')).toBeNull()
  })
})
