/**
 * 카드 커버 대표 색 저장 헬퍼 (티켓 20261121_1724)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/coverColors.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const extractMock = vi.fn<(url: string) => Promise<string[] | null>>()
vi.mock('@/lib/badgeColorExtract', () => ({ extractBadgeColors: (url: string) => extractMock(url) }))

import { coverColorsFields, coverColorsFieldsIfChanged } from '../coverColors'

const STORAGE = 'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/a.webp'

beforeEach(() => {
  extractMock.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('coverColorsFields', () => {
  it('추출에 성공하면 cover_colors 필드를 돌려준다', async () => {
    extractMock.mockResolvedValue(['#ff8800', '#2244aa'])
    expect(await coverColorsFields(STORAGE)).toEqual({ cover_colors: ['#ff8800', '#2244aa'] })
    expect(extractMock).toHaveBeenCalledWith(STORAGE)
  })

  it('색이 없는 이미지(빈 배열)도 «뽑았는데 없음»으로 저장한다', async () => {
    extractMock.mockResolvedValue([])
    expect(await coverColorsFields(STORAGE)).toEqual({ cover_colors: [] })
  })

  it('추출이 실패(null)하면 빈 객체라 저장을 막지 않는다', async () => {
    extractMock.mockResolvedValue(null)
    expect(await coverColorsFields(STORAGE)).toEqual({})
  })

  it('추출이 예외를 던져도 빈 객체다', async () => {
    extractMock.mockRejectedValue(new Error('boom'))
    expect(await coverColorsFields(STORAGE)).toEqual({})
  })

  it('/로 시작하는 정적 주소는 추출한다', async () => {
    extractMock.mockResolvedValue(['#00aa55'])
    expect(await coverColorsFields('/images/card.webp')).toEqual({ cover_colors: ['#00aa55'] })
  })

  it.each([null, undefined, '', '   '])('주소가 %j이면 추출하지 않고 빈 객체다', async (value) => {
    expect(await coverColorsFields(value)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example/storage/v1/object/public/assets/a.webp',
    'https://proj.supabase.co/rest/v1/secret',
    'http://169.254.169.254/latest/meta-data',
    '//evil.example/a.webp',
    'not a url',
  ])('저장소 밖 주소 %s는 추출(fetch)하지 않는다', async (url) => {
    expect(await coverColorsFields(url)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('NEXT_PUBLIC_SUPABASE_URL이 없으면 절대 주소는 추출하지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(await coverColorsFields(STORAGE)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it.each([
    'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/a.mp4',
    'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/a.webm?v=1',
    '/videos/a.mp4',
  ])('동영상 커버 %s는 추출하지 않는다', async (url) => {
    expect(await coverColorsFields(url)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })
})

describe('coverColorsFieldsIfChanged', () => {
  it('본문에 주소가 없으면(undefined) 추출하지 않는다', async () => {
    expect(await coverColorsFieldsIfChanged(STORAGE, undefined)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('기존과 같은 주소(공백 차이 포함)면 추출하지 않는다', async () => {
    expect(await coverColorsFieldsIfChanged(STORAGE, ` ${STORAGE} `)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('주소가 바뀌면 새 주소에서 뽑는다', async () => {
    extractMock.mockResolvedValue(['#00aa55'])
    const next = 'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/b.webp'
    expect(await coverColorsFieldsIfChanged(STORAGE, next)).toEqual({ cover_colors: ['#00aa55'] })
    expect(extractMock).toHaveBeenCalledWith(next)
  })

  it('주소가 비워지면 추출하지 않고 빈 객체다(트리거가 NULL로 비운다)', async () => {
    expect(await coverColorsFieldsIfChanged(STORAGE, null)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('바뀐 주소의 추출이 실패하면 빈 객체다', async () => {
    extractMock.mockResolvedValue(null)
    const next = 'https://proj.supabase.co/storage/v1/object/public/assets/today_cards/b.webp'
    expect(await coverColorsFieldsIfChanged(STORAGE, next)).toEqual({})
  })
})
