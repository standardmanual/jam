/**
 * 배지 insert 페이로드 매핑 순수 함수 — 값 매핑 단위 테스트 (티켓 20260925_0541 (b))
 *
 * 라우트와 등록 스크립트가 공유하는 원본이라, 체크인 배지의 null 처리·정렬 기본값·정수 정규화가
 * 여기서 고정된다.
 */
import { describe, it, expect } from 'vitest'
import { buildBadgeInsertPayload, normalizeFamilyKey } from '../badge-insert-payload'

const BASE = { name: '이름', description: '설명', type: 'activity', rarity: 'common', image_url: 'https://cdn.test/x.webp' }

describe('normalizeFamilyKey', () => {
  it('공백만 있거나 문자열이 아니면 null, 아니면 trim한 값', () => {
    expect(normalizeFamilyKey(' walking:K1 ')).toBe('walking:K1')
    expect(normalizeFamilyKey('   ')).toBeNull()
    expect(normalizeFamilyKey(undefined)).toBeNull()
    expect(normalizeFamilyKey(null)).toBeNull()
    expect(normalizeFamilyKey(3)).toBeNull()
  })
})

describe('buildBadgeInsertPayload — 기본값', () => {
  it('필수 필드만 있으면 «없음»은 null·기본값으로 채워진다', () => {
    expect(buildBadgeInsertPayload(BASE)).toEqual({
      name: '이름',
      description: '설명',
      type: 'activity',
      rarity: 'common',
      level: null,
      family_key: null,
      sort_order: 0,
      image_url: 'https://cdn.test/x.webp',
      activity_types: [],
      patch_available: false,
      patch_price_krw: null,
      condition_json: null,
      tribe_id: null,
      item_book_id: null,
      category: null,
      admin_category: null,
      show_on_map: true,
      drop_weight: 1,
      valid_from: null,
      valid_until: null,
      point_reward: 0,
      background_color: null,
      background_shader_id: null,
      background_image_url: null,
      background_video_url: null,
      background_animation: null,
    })
  })
})

describe('buildBadgeInsertPayload — 등급/레벨·정렬·정수 정규화', () => {
  it('빈 문자열 rarity는 null이 된다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, rarity: '' }).rarity).toBeNull()
  })

  it('레벨은 정수로 내림하고, undefined·null·빈 문자열은 null이다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, rarity: null, level: '3.9' }).level).toBe(3)
    expect(buildBadgeInsertPayload({ ...BASE, level: null }).level).toBeNull()
    expect(buildBadgeInsertPayload({ ...BASE, level: '' }).level).toBeNull()
    expect(buildBadgeInsertPayload({ ...BASE }).level).toBeNull()
  })

  it('sort_order는 음수를 0으로, 숫자가 아니면 0으로, 소수는 내림한다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, sort_order: -5 }).sort_order).toBe(0)
    expect(buildBadgeInsertPayload({ ...BASE, sort_order: 'abc' }).sort_order).toBe(0)
    expect(buildBadgeInsertPayload({ ...BASE, sort_order: 105.7 }).sort_order).toBe(105)
    expect(buildBadgeInsertPayload({ ...BASE }).sort_order).toBe(0)
  })

  it('point_reward는 음수·숫자 아님을 0으로 막는다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, point_reward: -3 }).point_reward).toBe(0)
    expect(buildBadgeInsertPayload({ ...BASE, point_reward: 'x' }).point_reward).toBe(0)
    expect(buildBadgeInsertPayload({ ...BASE, point_reward: 20.9 }).point_reward).toBe(20)
  })

  it('patch_price_krw는 없으면 null, 있으면 0 이상 정수다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, patch_price_krw: null }).patch_price_krw).toBeNull()
    expect(buildBadgeInsertPayload({ ...BASE, patch_price_krw: -100 }).patch_price_krw).toBe(0)
    expect(buildBadgeInsertPayload({ ...BASE, patch_price_krw: 1500.5 }).patch_price_krw).toBe(1500)
  })

  it('family_key는 trim한다', () => {
    expect(buildBadgeInsertPayload({ ...BASE, family_key: ' walking:K1 ' }).family_key).toBe('walking:K1')
    expect(buildBadgeInsertPayload({ ...BASE, family_key: '  ' }).family_key).toBeNull()
  })
})

describe("buildBadgeInsertPayload — type === 'checkin' 처리", () => {
  const CHECKIN = {
    ...BASE,
    type: 'checkin',
    condition_json: { activity_type: 'running' },
    tribe_id: 'tribe-1',
    item_book_id: 'book-1',
    category: 'cafe',
    admin_category: 'jam',
  }

  it('condition_json·tribe_id·item_book_id는 강제로 null이다', () => {
    const p = buildBadgeInsertPayload(CHECKIN)
    expect(p.condition_json).toBeNull()
    expect(p.tribe_id).toBeNull()
    expect(p.item_book_id).toBeNull()
  })

  it('category는 체크인일 때만 저장하고, admin_category는 type과 무관하게 저장한다', () => {
    expect(buildBadgeInsertPayload(CHECKIN).category).toBe('cafe')
    expect(buildBadgeInsertPayload({ ...CHECKIN, category: undefined }).category).toBeNull()
    expect(buildBadgeInsertPayload(CHECKIN).admin_category).toBe('jam')
    const activity = buildBadgeInsertPayload({ ...CHECKIN, type: 'activity' })
    expect(activity.category).toBeNull()
    expect(activity.admin_category).toBe('jam')
    expect(activity.condition_json).toEqual({ activity_type: 'running' })
    expect(activity.tribe_id).toBe('tribe-1')
    expect(activity.item_book_id).toBe('book-1')
  })
})

describe('buildBadgeInsertPayload — 지정한 값', () => {
  it('넘긴 값은 그대로 반영한다', () => {
    const p = buildBadgeInsertPayload({
      ...BASE,
      activity_types: ['running'],
      patch_available: true,
      show_on_map: false,
      drop_weight: 0.5,
      valid_from: '2026-10-01T00:00:00+09:00',
      valid_until: '2026-10-31T00:00:00+09:00',
      background_color: '#fff',
      background_shader_id: 'sh',
      background_image_url: 'img',
      background_video_url: 'vid',
      background_animation: { a: 1 },
    })
    expect(p).toMatchObject({
      activity_types: ['running'],
      patch_available: true,
      show_on_map: false,
      drop_weight: 0.5,
      valid_from: '2026-10-01T00:00:00+09:00',
      valid_until: '2026-10-31T00:00:00+09:00',
      background_color: '#fff',
      background_shader_id: 'sh',
      background_image_url: 'img',
      background_video_url: 'vid',
      background_animation: { a: 1 },
    })
  })
})
