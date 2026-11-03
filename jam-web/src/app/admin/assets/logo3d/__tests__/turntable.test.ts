/**
 * 3D 모드 동영상의 턴테이블 회전 (티켓 20261103_1737)
 *
 * 고정하는 것: 첫 프레임과 마지막 프레임이 같은 자세, 한 바퀴 360°, 진행률에 비례한 일정한 속도,
 * 범위 밖 시간·진행률 처리, 동영상 크기·길이 규칙이 Shape 모드와 같은 공용 함수라는 것.
 */
import { describe, expect, it } from 'vitest'
import { VIDEO_SEC } from '../../shapeStudioConfig'
import { videoBitrate, videoSizeFor } from '../../videoRecording'
import { wrapDegrees } from '../logo3dConfig'
import { TURNTABLE_DEGREES, turntableProgress, turntableRotY } from '../turntable'

describe('turntableRotY', () => {
  it('0프레임은 지금 회전값 그대로 시작한다', () => {
    expect(turntableRotY(22, 0)).toBe(22)
    expect(turntableRotY(-90, 0)).toBe(-90)
  })

  it('마지막 프레임은 시작 각도 + 360°라 화면에서 시작과 같은 자세다', () => {
    for (const start of [22, 0, -180, 180, -37]) {
      const last = turntableRotY(start, 1)
      expect(last - start).toBe(TURNTABLE_DEGREES)
      expect(wrapDegrees(last)).toBeCloseTo(wrapDegrees(start), 9)
    }
  })

  it('한 바퀴는 360°이고 진행률에 비례해 일정하게 돈다', () => {
    expect(TURNTABLE_DEGREES).toBe(360)
    expect(turntableRotY(0, 0.25)).toBe(90)
    expect(turntableRotY(0, 0.5)).toBe(180)
    const frames = Array.from({ length: 31 }, (_, i) => turntableRotY(22, i / 30))
    const steps = frames.slice(1).map((v, i) => v - frames[i])
    for (const step of steps) expect(step).toBeCloseTo(12, 9)
  })

  it('범위 밖 진행률은 0~1로 자른다(녹화가 길어져도 한 바퀴를 넘지 않는다)', () => {
    expect(turntableRotY(22, -0.5)).toBe(22)
    expect(turntableRotY(22, 1.7)).toBe(382)
  })
})

describe('turntableProgress', () => {
  it('경과 시간 / 길이로 0~1을 만든다', () => {
    expect(turntableProgress(0, VIDEO_SEC)).toBe(0)
    expect(turntableProgress(VIDEO_SEC / 2, VIDEO_SEC)).toBe(0.5)
    expect(turntableProgress(VIDEO_SEC, VIDEO_SEC)).toBe(1)
    expect(turntableProgress(VIDEO_SEC + 3, VIDEO_SEC)).toBe(1)
    expect(turntableProgress(-1, VIDEO_SEC)).toBe(0)
  })

  it('길이가 0 이하면 끝난 것으로 본다', () => {
    expect(turntableProgress(1, 0)).toBe(1)
  })

  it('녹화 시작과 끝의 회전값이 같다(길이는 에셋 동영상 길이 VIDEO_SEC)', () => {
    const start = 22
    const first = turntableRotY(start, turntableProgress(0, VIDEO_SEC))
    const last = turntableRotY(start, turntableProgress(VIDEO_SEC, VIDEO_SEC))
    expect(wrapDegrees(last)).toBeCloseTo(wrapDegrees(first), 9)
    expect(VIDEO_SEC).toBe(15)
  })
})

describe('videoSizeFor (Shape·3D 공용 크기 규칙)', () => {
  it('긴 변을 기준으로 비율에 맞춰 짧은 변을 정하고 두 변을 짝수로 맞춘다', () => {
    expect(videoSizeFor(1080, '1:1')).toEqual({ width: 1080, height: 1080 })
    expect(videoSizeFor(1080, '16:9')).toEqual({ width: 1080, height: 608 })
    expect(videoSizeFor(1080, '9:16')).toEqual({ width: 608, height: 1080 })
    expect(videoSizeFor(1080, '4:5')).toEqual({ width: 864, height: 1080 })
    expect(videoSizeFor(720, '9:16')).toEqual({ width: 404, height: 720 })
    expect(videoSizeFor(1440, '4:5')).toEqual({ width: 1152, height: 1440 })
  })

  it('모든 비율·크기에서 두 변이 짝수다', () => {
    for (const ratio of ['1:1', '4:5', '9:16', '16:9']) {
      for (const size of [720, 1080, 1440]) {
        const { width, height } = videoSizeFor(size, ratio)
        expect(width % 2).toBe(0)
        expect(height % 2).toBe(0)
      }
    }
  })

  it('비트레이트는 30fps 기준 픽셀 수에 비례한다', () => {
    expect(videoBitrate(1080, 1080)).toBe(Math.round(1080 * 1080 * 30 * 0.14))
  })
})
