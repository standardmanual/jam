/**
 * 3D 모드 동영상의 턴테이블 회전 (티켓 20261103_1737, 프레임 번호 기준: 티켓 20261103_2042)
 *
 * 고정하는 것: 0번과 N번 프레임이 같은 자세(정확히 360° 차이), 프레임 번호에 비례한 일정한 각도 증가,
 * 총 프레임 수(30 × VIDEO_SEC), 범위 밖 번호 처리, 동영상 크기·길이 규칙이 Shape 모드와 같은 공용 함수라는 것.
 */
import { describe, expect, it } from 'vitest'
import { VIDEO_SEC } from '../../shapeStudioConfig'
import { videoBitrate, videoSizeFor } from '../../videoRecording'
import { wrapDegrees } from '../logo3dConfig'
import { TURNTABLE_DEGREES, VIDEO_FPS, turntableFrameCount, turntableFrameRotY, turntableRotY } from '../turntable'

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

describe('프레임 번호 기준 회전 (티켓 20261103_2042)', () => {
  it('총 프레임 수 N은 30 × VIDEO_SEC이다', () => {
    expect(VIDEO_FPS).toBe(30)
    expect(VIDEO_SEC).toBe(15)
    expect(turntableFrameCount(VIDEO_FPS, VIDEO_SEC)).toBe(450)
  })

  it('0번과 N번 프레임의 각도 차가 정확히 360°라 같은 자세다', () => {
    const n = turntableFrameCount(VIDEO_FPS, VIDEO_SEC)
    for (const start of [22, 0, -180, 180, -37]) {
      const first = turntableFrameRotY(start, 0, n)
      const last = turntableFrameRotY(start, n, n)
      expect(first).toBe(start)
      expect(last - first).toBe(TURNTABLE_DEGREES)
      expect(wrapDegrees(last)).toBeCloseTo(wrapDegrees(first), 9)
    }
  })

  it('각도는 프레임 번호 i에 비례해 일정하게 는다', () => {
    const n = turntableFrameCount(VIDEO_FPS, VIDEO_SEC)
    expect(turntableFrameRotY(0, n / 2, n)).toBe(180)
    expect(turntableFrameRotY(0, n / 4, n)).toBe(90)
    const frames = Array.from({ length: n + 1 }, (_, i) => turntableFrameRotY(22, i, n))
    const steps = frames.slice(1).map((v, i) => v - frames[i])
    for (const step of steps) expect(step).toBeCloseTo(360 / n, 9)
  })

  it('범위 밖 번호는 0~N으로 자르고, N이 0 이하여도 깨지지 않는다', () => {
    expect(turntableFrameRotY(22, -3, 10)).toBe(22)
    expect(turntableFrameRotY(22, 99, 10)).toBe(382)
    expect(turntableFrameRotY(22, 0, 0)).toBe(382)
    expect(turntableFrameCount(30, 0)).toBe(1)
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
