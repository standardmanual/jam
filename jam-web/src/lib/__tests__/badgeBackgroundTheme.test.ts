/**
 * 배지 배경 테마 계산기 회귀 테스트 (20260819_012).
 *
 * 배경은 티켓 20260819_011에서 확정한 "단일 배경 레이어" 한 곳에서만 그려지고, 그 레이어가
 * 무엇을 그릴지는 전부 이 세 함수가 결정한다. 영상 배경(20260819_012)을 추가하면서 나머지 세
 * 모드(배경 없음 / 단색 / 정적 이미지)가 그대로인지 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  getBadgeBackgroundAnimation,
  getBadgeBackgroundStyle,
  getBadgeBackgroundVideoUrl,
  hasBadgeBackgroundTheme,
  type BadgeBackgroundThemeSource,
} from '@/lib/badgeBackgroundTheme'
import { DEFAULT_BLOB_ANIMATION } from '@/lib/blobAnimation'

const EMPTY: BadgeBackgroundThemeSource = {
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_video_url: null,
}

describe('배경 없는 배지 (회귀)', () => {
  it('스타일이 비어 있고 테마도 아니며 영상도 없다', () => {
    expect(getBadgeBackgroundStyle(EMPTY)).toEqual({})
    expect(hasBadgeBackgroundTheme(EMPTY)).toBe(false)
    expect(getBadgeBackgroundVideoUrl(EMPTY)).toBeNull()
  })

  it('background_shader_id만 있으면 여전히 배경 없음으로 취급한다', () => {
    const badge = { ...EMPTY, background_shader_id: 'aurora' }
    expect(getBadgeBackgroundStyle(badge)).toEqual({})
    expect(hasBadgeBackgroundTheme(badge)).toBe(false)
  })
})

describe('단색 배경 (회귀)', () => {
  const badge = { ...EMPTY, background_color: '#1a1a1a' }

  it('배경색만 반환하고 영상은 없다', () => {
    expect(getBadgeBackgroundStyle(badge)).toEqual({ backgroundColor: '#1a1a1a' })
    expect(hasBadgeBackgroundTheme(badge)).toBe(true)
    expect(getBadgeBackgroundVideoUrl(badge)).toBeNull()
  })
})

describe('정적 제너레이터 배경 (회귀)', () => {
  const badge = { ...EMPTY, background_image_url: 'https://cdn.example/bg.png' }

  it('20260819_011에서 확정한 100% auto + 세로 repeat 규칙을 유지한다', () => {
    expect(getBadgeBackgroundStyle(badge)).toEqual({
      backgroundImage: 'url(https://cdn.example/bg.png)',
      backgroundSize: '100% auto',
      backgroundPosition: 'top center',
      backgroundRepeat: 'repeat',
    })
    expect(hasBadgeBackgroundTheme(badge)).toBe(true)
    expect(getBadgeBackgroundVideoUrl(badge)).toBeNull()
  })

  it('배경색이 함께 남아 있어도 이미지가 우선한다', () => {
    const both = { ...badge, background_color: '#ff0000' }
    expect(getBadgeBackgroundStyle(both).backgroundColor).toBeUndefined()
  })
})

describe('애니메이션(영상) 배경 — 20260819_012', () => {
  const badge = {
    ...EMPTY,
    background_image_url: 'https://cdn.example/bg.png',
    background_video_url: 'https://cdn.example/bg.mp4',
  }

  it('영상 URL을 반환하면서 poster용 CSS 배경 이미지도 그대로 유지한다', () => {
    expect(getBadgeBackgroundVideoUrl(badge)).toBe('https://cdn.example/bg.mp4')
    expect(getBadgeBackgroundStyle(badge).backgroundImage).toBe('url(https://cdn.example/bg.png)')
    expect(hasBadgeBackgroundTheme(badge)).toBe(true)
  })

  it('poster 없이 영상만 남은 데이터에서도 배경 테마로 판정한다', () => {
    const videoOnly = { ...EMPTY, background_video_url: 'https://cdn.example/bg.mp4' }
    expect(hasBadgeBackgroundTheme(videoOnly)).toBe(true)
  })
})

describe('카드 안 블롭 애니메이션 배경 — 20260901_1944', () => {
  const animated = { ...EMPTY, background_animation: DEFAULT_BLOB_ANIMATION }

  it('애니메이션 파라미터를 돌려준다', () => {
    expect(getBadgeBackgroundAnimation(animated)).toEqual(DEFAULT_BLOB_ANIMATION)
  })

  it('전체 배경 레이어는 비운다 — 애니메이션은 이미지 카드 안에만 그려진다', () => {
    expect(getBadgeBackgroundStyle(animated)).toEqual({})
    expect(hasBadgeBackgroundTheme(animated)).toBe(false)
  })

  it('과거에 구워둔 이미지 배경·배경색이 남아 있어도 애니메이션이 우선한다', () => {
    const legacyLeftovers = {
      ...animated,
      background_color: '#ff0000',
      background_image_url: 'https://cdn.example/bg.png',
    }
    expect(getBadgeBackgroundStyle(legacyLeftovers)).toEqual({})
    expect(hasBadgeBackgroundTheme(legacyLeftovers)).toBe(false)
  })

  it('형식이 어긋난 값은 애니메이션 없음으로 보고 기존 배경 규칙이 그대로 산다', () => {
    const broken = { ...EMPTY, background_color: '#1a1a1a', background_animation: { type: 'unknown' } }
    expect(getBadgeBackgroundAnimation(broken)).toBeNull()
    expect(getBadgeBackgroundStyle(broken)).toEqual({ backgroundColor: '#1a1a1a' })
    expect(hasBadgeBackgroundTheme(broken)).toBe(true)
  })
})

describe('background_video_url을 넘기지 않는 기존 호출부 (회귀)', () => {
  it('optional 필드라 세 필드만 넘겨도 동작한다', () => {
    const legacy = { background_color: '#222222', background_shader_id: null, background_image_url: null }
    expect(getBadgeBackgroundStyle(legacy)).toEqual({ backgroundColor: '#222222' })
    expect(hasBadgeBackgroundTheme(legacy)).toBe(true)
    expect(getBadgeBackgroundVideoUrl(legacy)).toBeNull()
  })
})
