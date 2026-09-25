/**
 * 콘텐츠(배지·미션) 제작 경로 라벨·필터 옵션 단일 출처 — 티켓 20260925_1407(배지 전용
 * badgeImageSource.ts에서 일반화, 원 테스트는 티켓 20260924_2200)
 * 실행: `npx vitest run src/lib/admin/__tests__/contentImageSource.test.ts`
 */
import {
  CONTENT_IMAGE_SOURCES,
  CONTENT_IMAGE_SOURCE_LABEL,
  IMAGE_SOURCE_FILTER_OPTIONS,
  IMAGE_SOURCE_FILTER_OPTIONS_WITHOUT_ICON,
  UNKNOWN_IMAGE_SOURCE_FILTER,
  UNKNOWN_IMAGE_SOURCE_LABEL,
  contentImageSourceLabel,
} from '../contentImageSource'

describe('contentImageSourceLabel', () => {
  it('값 3종은 정의된 한글 라벨을 돌려준다', () => {
    for (const source of CONTENT_IMAGE_SOURCES) {
      expect(contentImageSourceLabel(source)).toBe(CONTENT_IMAGE_SOURCE_LABEL[source])
    }
    expect(contentImageSourceLabel('admin-generator')).toBe('수동 제작')
    expect(contentImageSourceLabel('agent-generator')).toBe('윤진 자동')
    expect(contentImageSourceLabel('jam-img')).toBe('아이콘 파이프라인')
  })

  it('값이 없으면 미상, 화이트리스트 밖 값은 원시값을 그대로 돌려준다', () => {
    expect(contentImageSourceLabel(null)).toBe(UNKNOWN_IMAGE_SOURCE_LABEL)
    expect(contentImageSourceLabel(undefined)).toBe(UNKNOWN_IMAGE_SOURCE_LABEL)
    expect(contentImageSourceLabel('')).toBe(UNKNOWN_IMAGE_SOURCE_LABEL)
    expect(contentImageSourceLabel('__future_source__')).toBe('__future_source__')
  })
})

describe('IMAGE_SOURCE_FILTER_OPTIONS', () => {
  it('값 3종 + 미상(sentinel) 옵션을 이 순서대로 포함한다', () => {
    expect(IMAGE_SOURCE_FILTER_OPTIONS).toHaveLength(CONTENT_IMAGE_SOURCES.length + 1)
    expect(IMAGE_SOURCE_FILTER_OPTIONS.at(-1)).toEqual({
      value: UNKNOWN_IMAGE_SOURCE_FILTER,
      label: UNKNOWN_IMAGE_SOURCE_LABEL,
    })
    expect(IMAGE_SOURCE_FILTER_OPTIONS[0]).toEqual({ value: 'admin-generator', label: '수동 제작' })
  })
})

describe('IMAGE_SOURCE_FILTER_OPTIONS_WITHOUT_ICON', () => {
  it('배지용은 jam-img를 포함하고 순서는 수동 제작·윤진 자동·아이콘 파이프라인·미상이다', () => {
    expect(IMAGE_SOURCE_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      'admin-generator',
      'agent-generator',
      'jam-img',
      UNKNOWN_IMAGE_SOURCE_FILTER,
    ])
  })

  it('미션·컬렉션·홈피드용은 jam-img 없이 값 2종 + 미상이고, 순서·라벨은 배지용과 같다', () => {
    expect(IMAGE_SOURCE_FILTER_OPTIONS_WITHOUT_ICON.map((o) => o.value)).toEqual([
      'admin-generator',
      'agent-generator',
      UNKNOWN_IMAGE_SOURCE_FILTER,
    ])
    for (const option of IMAGE_SOURCE_FILTER_OPTIONS_WITHOUT_ICON) {
      expect(IMAGE_SOURCE_FILTER_OPTIONS).toContainEqual(option)
    }
  })
})
