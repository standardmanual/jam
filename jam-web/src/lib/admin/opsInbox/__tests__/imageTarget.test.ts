/**
 * 항목 이미지 지시 읽기와 시드 (티켓 20261007_0947 ③-b1). 시드는 서버 스크립트(`makeHomeFeedCardArgs.mjs`)와 같은 값이어야 한다.
 */
import { describe, it, expect } from 'vitest'
import { imageKeyOfKind, readImageSpec, seedFromBundleId } from '../imageTarget'
import { imageKeyOfKind as reexported } from '../image'
import { seedFromBundleId as seedFromMjs } from '../../../../../scripts/asset-generator/makeHomeFeedCardArgs.mjs'

const good = { preset_id: 'card-a', bg: '#112233', end: '#AABBCC', values: { text01: '문구', img01: 'https://x.test/a.png' } }
const item = (spec: unknown, kind: string | null = 'home_feed_card', edited: unknown = null) => ({
  kind,
  original: { image_spec: spec } as never,
  edited: edited as never,
})

describe('seedFromBundleId', () => {
  it('서버 스크립트와 같은 값이다', () => {
    for (const id of ['', 'bundle-1', '2026-W41-운영', 'a'.repeat(200)]) {
      expect(seedFromBundleId(id)).toBe(seedFromMjs(id))
    }
  })
})

describe('imageKeyOfKind', () => {
  it('종류별 칸 이름이고 image.ts가 같은 함수를 다시 내보낸다', () => {
    expect(imageKeyOfKind('home_feed_card')).toBe('cover_image_url')
    expect(imageKeyOfKind('mission')).toBe('image_url')
    expect(imageKeyOfKind('badge_drop')).toBeNull()
    expect(imageKeyOfKind(null)).toBeNull()
    expect(reexported).toBe(imageKeyOfKind)
  })
})

describe('readImageSpec', () => {
  it('올바른 지시를 읽는다', () => {
    expect(readImageSpec(item(good))).toEqual({
      ok: true,
      spec: { presetId: 'card-a', bg: '#112233', end: '#AABBCC', values: good.values },
    })
  })
  it('values가 없으면 빈 객체다', () => {
    expect(readImageSpec(item({ preset_id: good.preset_id, bg: good.bg, end: good.end }))).toMatchObject({ ok: true, spec: { values: {} } })
  })
  it('수정본이 있으면 수정본을 읽는다', () => {
    const r = readImageSpec(item(good, 'mission', { image_spec: { ...good, preset_id: 'edited' } }))
    expect(r).toMatchObject({ ok: true, spec: { presetId: 'edited' } })
  })
  it('이미지 칸 없는 종류는 no_image_kind', () => {
    expect(readImageSpec(item(good, 'badge_drop'))).toEqual({ ok: false, reason: 'no_image_kind' })
  })
  it('칸이 없거나 preset_id가 비면 missing', () => {
    expect(readImageSpec(item(undefined))).toEqual({ ok: false, reason: 'missing' })
    expect(readImageSpec(item({ ...good, preset_id: '  ' }))).toEqual({ ok: false, reason: 'missing' })
  })
  it('형식이 틀리면 invalid', () => {
    expect(readImageSpec(item('문자열'))).toEqual({ ok: false, reason: 'invalid' })
    expect(readImageSpec(item({ ...good, bg: 'red' }))).toEqual({ ok: false, reason: 'invalid' })
    expect(readImageSpec(item({ ...good, end: '#12345' }))).toEqual({ ok: false, reason: 'invalid' })
    expect(readImageSpec(item({ ...good, values: { title: 'x' } }))).toEqual({ ok: false, reason: 'invalid' })
    expect(readImageSpec(item({ ...good, values: { text01: 3 } }))).toEqual({ ok: false, reason: 'invalid' })
    expect(readImageSpec(item({ ...good, values: [] }))).toEqual({ ok: false, reason: 'invalid' })
  })
})
