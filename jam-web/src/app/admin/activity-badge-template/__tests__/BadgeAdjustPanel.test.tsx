/**
 * BadgeAdjustPanel 표시 시험 (티켓 20261116_0653)
 * 실행: cd jam-web && npx vitest run src/app/admin/activity-badge-template
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BadgeAdjustPanel from '../BadgeAdjustPanel'
import {
  DEFAULT_TEMPLATE_BADGE_PARAMS,
  type TemplateBadgeParams,
} from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateDefSlots } from '@/lib/admin/activityBadgeTemplate/templateDef'
import type { TemplateSlot } from '@/lib/admin/activityBadgeTemplate/templateSvg'

// Popover·Command는 서버 렌더 컨텍스트를 쓰므로 글꼴 고르기는 단순 태그로 바꾼다.
vi.mock('../TemplateFontField', () => ({ default: () => <div>글꼴 고르기</div> }))

const slot = (): TemplateSlot => ({
  found: true, isText: true, x: 1, y: 2, fontFamily: 'Pretendard', fontSize: 48, fontWeight: null,
  fill: '#123B2E', letterSpacing: null, textAnchor: null, transform: null, placeholder: '가',
})
const slots: TemplateDefSlots = { viewBoxWidth: 1024, viewBoxHeight: 1024, name: slot(), value: slot() }
const colorful = [
  { color: '#FF0000', count: 3 },
  { color: '#0000FF', count: 1 },
]

const render = (params: TemplateBadgeParams, colors = colorful) =>
  renderToStaticMarkup(
    <BadgeAdjustPanel params={params} onChange={vi.fn()} onReset={vi.fn()} colors={colors} slots={slots} />
  )

describe('BadgeAdjustPanel', () => {
  it('묶음과 줄 이름이 문구대로이고 색 계열 여덟 개가 있다', () => {
    const h = render(DEFAULT_TEMPLATE_BADGE_PARAMS)
    for (const t of ['조정', '템플릿 색', '색 계열', '색상', '채도', '명도', '색 칸', '이름 글자', '값 글자', '글꼴', '굵기', '크기']) {
      expect(h).toContain(t)
    }
    for (const f of ['빨강', '주황', '노랑', '초록', '청록', '파랑', '보라', '분홍']) expect(h).toContain(f)
    expect(h).toContain('템플릿에 쓰인 색이에요. 칸을 눌러 하나씩 바꿀 수 있어요')
  })

  it('기본값이면 «처음으로»가 비활성이고 «되돌리기»가 없다', () => {
    const h = render(DEFAULT_TEMPLATE_BADGE_PARAMS)
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>처음으로/)
    expect(h).not.toContain('되돌리기')
    expect(h).not.toContain('템플릿 색으로')
  })

  it('색을 바꾼 칸에만 «되돌리기»가 있고 «처음으로»가 켜진다', () => {
    const p: TemplateBadgeParams = {
      ...DEFAULT_TEMPLATE_BADGE_PARAMS,
      color: { ...DEFAULT_TEMPLATE_BADGE_PARAMS.color, overrides: { '#FF0000': '#00FF00' } },
    }
    const h = render(p)
    expect(h.match(/되돌리기/g)).toHaveLength(1)
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>처음으로/)
  })

  it('색 입력은 색 칸에 색마다 하나, 글자 색 입력은 둘', () => {
    const h = render(DEFAULT_TEMPLATE_BADGE_PARAMS)
    expect(h.match(/type="color"/g)).toHaveLength(4)
  })

  it('무채색뿐이면 안내가 나오고 색 계열 버튼이 비활성이다', () => {
    const h = render(DEFAULT_TEMPLATE_BADGE_PARAMS, [{ color: '#808080', count: 2 }])
    expect(h).toContain('이 템플릿에는 색 계열을 바꿀 색이 없어요')
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>(<span[^>]*><\/span>)?빨강/)
  })

  it('색이 없으면 안내 문구', () => {
    expect(render(DEFAULT_TEMPLATE_BADGE_PARAMS, [])).toContain('바꿀 수 있는 색이 없어요')
  })

  it('글자 색을 조정했으면 «템플릿 색으로»가 나온다', () => {
    const p: TemplateBadgeParams = {
      ...DEFAULT_TEMPLATE_BADGE_PARAMS,
      text: { ...DEFAULT_TEMPLATE_BADGE_PARAMS.text, name: { ...DEFAULT_TEMPLATE_BADGE_PARAMS.text.name, color: '#FFFFFF' } },
    }
    expect(render(p).match(/템플릿 색으로/g)).toHaveLength(1)
  })
})
