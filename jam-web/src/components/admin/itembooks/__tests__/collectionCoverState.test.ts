/**
 * 컬렉션 표지 생성기의 순수 함수와 적용 때 두 요청 (티켓 20261124_1744).
 * 실행: cd jam-web && npx vitest run src/components/admin/itembooks/__tests__/collectionCoverState.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { defaultTextColors, hexToRgb } from '@/lib/collection-cover'
import {
  applyCollectionCover,
  buildCoverParams,
  initialCoverState,
  normalizeHex,
  parseCoverParams,
  pickDefaultBadge,
  type CoverParams,
} from '../collectionCoverState'

const badge = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  image_url: `https://x.test/${id}.png`,
  deleted_at: null,
  sort_order: 0,
  ...extra,
})

const saved: CoverParams = {
  version: 1,
  seed: 'c1',
  rerolls: 3,
  badgeId: 'b2',
  bgHex: '#336699',
  bgSource: 'auto',
  textColors: { ...defaultTextColors(hexToRgb('#336699')) },
}

describe('normalizeHex', () => {
  it('# 없이도 받고 소문자로 맞춘다', () => {
    expect(normalizeHex(' AABBCC ')).toBe('#aabbcc')
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('zzzzzz')).toBeNull()
  })
})

describe('parseCoverParams', () => {
  it('맞는 모양은 읽고 틀린 모양은 null', () => {
    expect(parseCoverParams(saved)?.rerolls).toBe(3)
    expect(parseCoverParams(null)).toBeNull()
    expect(parseCoverParams({ ...saved, version: 2 })).toBeNull()
    expect(parseCoverParams({ ...saved, bgHex: 'blue' })).toBeNull()
    expect(parseCoverParams({ ...saved, textColors: { title: '#000000' } })).toBeNull()
  })
})

describe('pickDefaultBadge', () => {
  it('삭제됐거나 이미지가 없는 배지는 건너뛰고 sort_order → 이름 → id 순으로 고른다', () => {
    const list = [
      badge('a', '가', { deleted_at: '2026-01-01' }),
      badge('b', '나', { image_url: null }),
      badge('d', '다', { sort_order: 1 }),
      badge('c2', '마'),
      badge('c1', '라'),
    ]
    expect(pickDefaultBadge(list)?.id).toBe('c1')
    expect(pickDefaultBadge([badge('x', 'x', { image_url: null })])).toBeNull()
  })
})

describe('initialCoverState', () => {
  const badges = [badge('b1', '가'), badge('b2', '나')]
  it('cover_params가 없으면 다시 뽑기 0회·자동 배경·첫 배지', () => {
    expect(initialCoverState(null, badges)).toEqual({ rerolls: 0, badgeId: 'b1', bgManual: null, bgSaved: null, textOverrides: {} })
  })
  it('저장 값이 있으면 그대로 열고, 기본 규칙과 같은 글자색은 자동으로 연다', () => {
    const s = initialCoverState({ ...saved, textColors: { ...saved.textColors, join: '#ff0000' } }, badges)
    expect(s.rerolls).toBe(3)
    expect(s.badgeId).toBe('b2')
    expect(s.bgManual).toBeNull()
    expect(s.bgSaved).toBe('#336699')
    expect(s.textOverrides).toEqual({ join: '#ff0000' })
  })
  it('직접 지정한 배경은 manual로 열고, 사라진 배지는 첫 배지로 대신한다', () => {
    const s = initialCoverState({ ...saved, bgSource: 'manual', badgeId: 'gone' }, badges)
    expect(s.bgManual).toBe('#336699')
    expect(s.bgSaved).toBeNull()
    expect(s.badgeId).toBe('b1')
  })
})

describe('buildCoverParams', () => {
  it('override는 manual로 옮겨 저장한다', () => {
    const p = buildCoverParams(
      { rerolls: 1, badgeId: 'b1', bgManual: '#336699', bgSaved: null, textOverrides: {} },
      'c1',
      { bgHex: '#336699', bgSource: 'override', textColors: saved.textColors },
      '2026-11-24T00:00:00.000Z'
    )
    expect(p).toMatchObject({ version: 1, seed: 'c1', rerolls: 1, badgeId: 'b1', bgSource: 'manual', appliedAt: '2026-11-24T00:00:00.000Z' })
  })
  it('저장된 색(bgSaved)으로 그렸으면 저장된 출처를 유지한다', () => {
    const st = { rerolls: 3, badgeId: 'b2', bgManual: null, bgSaved: '#336699', textOverrides: {} }
    const r = { bgHex: '#336699', bgSource: 'override' as const, textColors: saved.textColors }
    expect(buildCoverParams(st, 'c1', r, 't', 'auto').bgSource).toBe('auto')
    expect(buildCoverParams(st, 'c1', r, 't', 'manual').bgSource).toBe('manual')
  })
  it('저장 색도 직접 지정도 아니면 자동 결과는 auto', () => {
    const st = { rerolls: 4, badgeId: 'b2', bgManual: null, bgSaved: null, textOverrides: {} }
    expect(buildCoverParams(st, 'c1', { bgHex: '#336699', bgSource: 'generated', textColors: saved.textColors }, 't').bgSource).toBe('auto')
  })
})

describe('applyCollectionCover — 두 요청', () => {
  const png = new Blob(['x'], { type: 'image/png' })
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
  const bad = (status: number, body: unknown = {}) => ({ ok: false, status, json: async () => body }) as Response

  it('업로드 뒤 name_en·cover_params를 PATCH한다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(ok({ webpUrl: 'https://x.test/c.webp' })).mockResolvedValueOnce(ok({}))
    const r = await applyCollectionCover({ fetchFn: fetchFn as unknown as typeof fetch, collectionId: 'c1', nameEn: 'ALLEY', png, params: saved })
    expect(r).toEqual({ ok: true, imageUrl: 'https://x.test/c.webp' })
    const [url1, init1] = fetchFn.mock.calls[0]
    expect(url1).toBe('/api/admin/asset-generator/apply')
    const form = init1.body as FormData
    expect(form.get('targetType')).toBe('collection')
    expect(form.get('targetId')).toBe('c1')
    expect(form.get('image')).toBeInstanceOf(Blob)
    const [url2, init2] = fetchFn.mock.calls[1]
    expect(url2).toBe('/api/admin/itembooks/c1')
    expect(init2.method).toBe('PATCH')
    expect(JSON.parse(init2.body)).toEqual({ name_en: 'ALLEY', cover_params: saved })
  })

  it('업로드가 실패하면 저장 요청을 보내지 않고 [현상]→[원인]→[해결책]을 돌려준다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(bad(500, { error: '업로드 실패' }))
    const r = await applyCollectionCover({ fetchFn: fetchFn as unknown as typeof fetch, collectionId: 'c1', nameEn: 'A', png, params: saved })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.stage).toBe('upload')
      expect(r.message).toMatch(/\[현상\].*\n\[원인\] 업로드 실패\n\[해결책\]/)
    }
  })

  it('이미지는 바뀌고 설정 저장만 실패하면 stage save로 따로 알린다', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(ok({ webpUrl: 'u' })).mockResolvedValueOnce(bad(500))
    const r = await applyCollectionCover({ fetchFn: fetchFn as unknown as typeof fetch, collectionId: 'c1', nameEn: 'A', png, params: saved })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.stage).toBe('save')
      expect(r.message).toContain('표지 이미지는 바뀌었지만')
    }
  })
})
