/**
 * 배지 대표색 저장 헬퍼 (티켓 20261119_1652)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badgeBgColors.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const extractMock = vi.fn<(url: string) => Promise<string[] | null>>()
vi.mock('@/lib/badgeColorExtract', () => ({ extractBadgeColors: (url: string) => extractMock(url) }))

import { badgeBgColorsFields, badgeBgColorsFieldsIfChanged } from '../badgeBgColors'

beforeEach(() => {
  extractMock.mockReset()
})

describe('badgeBgColorsFields', () => {
  it('추출에 성공하면 bg_colors 필드를 돌려준다', async () => {
    extractMock.mockResolvedValue(['#ff8800', '#2244aa'])
    expect(await badgeBgColorsFields('https://cdn.test/a.webp')).toEqual({ bg_colors: ['#ff8800', '#2244aa'] })
    expect(extractMock).toHaveBeenCalledWith('https://cdn.test/a.webp')
  })

  it('색이 없는 이미지(빈 배열)도 «뽑았는데 없음»으로 저장한다', async () => {
    extractMock.mockResolvedValue([])
    expect(await badgeBgColorsFields('https://cdn.test/mono.webp')).toEqual({ bg_colors: [] })
  })

  it('추출이 실패(null)하면 빈 객체라 저장을 막지 않는다', async () => {
    extractMock.mockResolvedValue(null)
    expect(await badgeBgColorsFields('https://cdn.test/a.webp')).toEqual({})
  })

  it('추출이 예외를 던져도 빈 객체다', async () => {
    extractMock.mockRejectedValue(new Error('boom'))
    expect(await badgeBgColorsFields('https://cdn.test/a.webp')).toEqual({})
  })

  it.each([null, undefined, '', '   '])('이미지 주소가 %j이면 추출하지 않고 빈 객체다', async (value) => {
    expect(await badgeBgColorsFields(value)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })
})

describe('badgeBgColorsFieldsIfChanged', () => {
  it('본문에 이미지가 없으면(undefined) 추출하지 않는다', async () => {
    expect(await badgeBgColorsFieldsIfChanged('https://cdn.test/a.webp', undefined)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('기존과 같은 이미지(공백 차이 포함)면 추출하지 않는다', async () => {
    expect(await badgeBgColorsFieldsIfChanged('https://cdn.test/a.webp', ' https://cdn.test/a.webp ')).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('이미지가 바뀌면 새 이미지에서 뽑는다', async () => {
    extractMock.mockResolvedValue(['#00aa55'])
    expect(await badgeBgColorsFieldsIfChanged('https://cdn.test/a.webp', 'https://cdn.test/b.webp')).toEqual({
      bg_colors: ['#00aa55'],
    })
    expect(extractMock).toHaveBeenCalledWith('https://cdn.test/b.webp')
  })

  it('이미지가 비워지면 추출하지 않고 빈 객체다(트리거가 NULL로 비운다)', async () => {
    expect(await badgeBgColorsFieldsIfChanged('https://cdn.test/a.webp', null)).toEqual({})
    expect(extractMock).not.toHaveBeenCalled()
  })

  it('바뀐 이미지의 추출이 실패하면 빈 객체다', async () => {
    extractMock.mockResolvedValue(null)
    expect(await badgeBgColorsFieldsIfChanged('https://cdn.test/a.webp', 'https://cdn.test/b.webp')).toEqual({})
  })
})
