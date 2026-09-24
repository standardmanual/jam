import { describe, expect, it } from 'vitest'
import {
  INITIAL_RIBBON_LAYER,
  buildExportFileName,
  clampDurationSeconds,
  computeEffectiveStartColor,
  generateRandomSeed,
  resolveStageSize,
} from '../assetGeneratorHelpers'

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
