/**
 * 카드 자원 대응·설명·제목 판정 (티켓 20261001_2244, 옛 모양 판정 시험은 티켓 20261122_1328에서 지웠다)
 *
 * 확인하는 것: 템플릿 → 자원 대응, 이미지에 제목 있음 판정, 설명 문단을 그리는 템플릿.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shape.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CARD_RESOURCES,
  resolveTitleInImage,
  resourceOfTemplate,
  showsDescription,
  DESCRIPTION_TEMPLATES,
} from '../shape'

describe('resourceOfTemplate·CARD_RESOURCES — 화면과 계측이 함께 쓰는 자원 판정 (티켓 20261001_2244)', () => {
  it('템플릿 8종이 자원 8개 중 하나로 대응되고 레시피만 대응하는 템플릿이 없다', () => {
    const templates = [
      'mission_spotlight',
      'drop_alert',
      'badge_spotlight',
      'editorial_article',
      'ranking_board',
      'itembook_milestone',
      'progress_nudge',
      'location_trend',
    ] as const
    const mapped = templates.map(resourceOfTemplate)
    for (const resource of mapped) expect(CARD_RESOURCES).toContain(resource)
    expect(CARD_RESOURCES.filter((r) => !mapped.includes(r))).toEqual(['recipe'])
  })

  it('진행 알림과 지역 트렌드는 같은 자원(auto)이다', () => {
    expect(resourceOfTemplate('progress_nudge')).toBe('auto')
    expect(resourceOfTemplate('location_trend')).toBe('auto')
  })
})

describe('resolveTitleInImage — 이미지에 제목 있음 (1453 결정 6·12, 티켓 20261121_1726)', () => {
  it('저장된 값이 true면 true다', () => {
    expect(resolveTitleInImage({ title_in_image: true })).toBe(true)
  })

  it('저장된 값이 false면 false다', () => {
    expect(resolveTitleInImage({ title_in_image: false })).toBe(false)
  })

  // 기대값을 바꾼 시험: 예전에는 «NULL인 옛 미션 소개 카드가 커버를 연결 미션 이미지로 쓰면 true»였다. 7회차에 미션 이미지에서
  // 글자를 빼므로 이미지가 제목을 말한다고 볼 수 없어, NULL은 어떤 카드든 false(제목을 글자로 그린다)로 바꿨다.
  it('NULL이거나 없으면(옛 카드) 항상 false다 — 미션 소개 카드가 미션 이미지를 커버로 써도 마찬가지다', () => {
    expect(resolveTitleInImage({ title_in_image: null })).toBe(false)
    expect(resolveTitleInImage({})).toBe(false)
    expect(resolveTitleInImage({ title_in_image: undefined })).toBe(false)
  })

  it('카드 행 전체를 넘겨도 커버·템플릿과 무관하게 저장값만 본다', () => {
    const row = { template_type: 'mission_spotlight' as const, cover_image_url: 'https://cdn.example/mission.png' }
    expect(resolveTitleInImage({ ...row, title_in_image: null })).toBe(false)
    expect(resolveTitleInImage({ ...row, title_in_image: true })).toBe(true)
  })
})

describe('showsDescription — 옛 설명문 템플릿 규칙, CLI 등록 묶음 전용 (티켓 20261109_1458, 20261124_1119)', () => {
  it('배지 소개와 컨텐츠 소개만 그린다', () => {
    expect([...DESCRIPTION_TEMPLATES]).toEqual(['badge_spotlight', 'content_intro'])
    expect(showsDescription('badge_spotlight')).toBe(true)
    expect(showsDescription('content_intro')).toBe(true)
  })

  it.each([
    'mission_spotlight',
    'drop_alert',
    'editorial_article',
    'ranking_board',
    'itembook_milestone',
    'progress_nudge',
    'location_trend',
    'recipe_reveal',
  ] as const)('%s는 그리지 않는다', (template) => {
    expect(showsDescription(template)).toBe(false)
  })
})
