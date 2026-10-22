import { describe, expect, it } from 'vitest'
import { isVideoUrl } from '../cardMedia'

describe('isVideoUrl — 동영상 URL 판별', () => {
  it('mp4, webm, mov, m4v, ogg 확장자를 동영상으로 판별한다', () => {
    expect(isVideoUrl('https://example.com/video.mp4')).toBe(true)
    expect(isVideoUrl('https://example.com/video.webm')).toBe(true)
    expect(isVideoUrl('https://example.com/video.mov')).toBe(true)
    expect(isVideoUrl('https://example.com/video.m4v')).toBe(true)
    expect(isVideoUrl('https://example.com/video.ogg')).toBe(true)
  })

  it('대소문자를 구분하지 않는다', () => {
    expect(isVideoUrl('https://example.com/video.MP4')).toBe(true)
    expect(isVideoUrl('https://example.com/video.WEBM')).toBe(true)
  })

  it('쿼리 파라미터나 해시가 붙어 있어도 올바르게 판별한다', () => {
    expect(isVideoUrl('https://example.com/video.mp4?v=1729600000')).toBe(true)
    expect(isVideoUrl('https://example.com/video.webm?t=10&token=abc#section')).toBe(true)
    expect(isVideoUrl('/uploads/motion.mp4?v=1')).toBe(true)
  })

  it('이미지 URL은 false를 반환한다', () => {
    expect(isVideoUrl('https://example.com/image.png')).toBe(false)
    expect(isVideoUrl('https://example.com/image.webp')).toBe(false)
    expect(isVideoUrl('https://example.com/image.jpg')).toBe(false)
    expect(isVideoUrl('https://example.com/image.svg')).toBe(false)
  })

  it('빈 값이나 공백, null, undefined는 false를 반환한다', () => {
    expect(isVideoUrl(null)).toBe(false)
    expect(isVideoUrl(undefined)).toBe(false)
    expect(isVideoUrl('')).toBe(false)
    expect(isVideoUrl('   ')).toBe(false)
  })
})
