/**
 * BadgePreview·BadgePicker 표시 시험 (티켓 20261116_0555)
 * 실행: cd jam-web && npx vitest run src/app/admin/activity-badge-template
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BadgePreview, { previewNotes } from '../BadgePreview'
import BadgePicker, { ALL_VALUE, type StudioSearchBadge } from '../BadgePicker'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import type { TemplateSlot, TemplateSlots } from '@/lib/admin/activityBadgeTemplate/templateSvg'

// Radix Select는 서버 렌더에서 컨텍스트를 쓰므로(워크트리 심볼릭 링크 환경에서 React가 둘로 갈린다) 시험에서는 단순 태그로 바꾼다.
vi.mock('@/components/admin/ui/select', () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

const slot = (): TemplateSlot => ({
  found: true, isText: true, x: 1, y: 2, fontFamily: 'Pretendard', fontSize: 48, fontWeight: null,
  fill: '#123B2E', letterSpacing: null, textAnchor: null, transform: null, placeholder: '가',
})
const slots: TemplateSlots = { viewBoxWidth: 1024, viewBoxHeight: 1024, name: slot(), value: slot() }
const template = (svg: string | null): TemplateItem => ({
  classKey: 'metric', label: '운동 수치', svg, slots: svg ? slots : null, updatedAt: null, updatedBy: null,
})
const badge = (over: Partial<StudioSearchBadge> = {}): StudioSearchBadge => ({
  id: 'b1', name: '트럭 꽁무니를 따라 뛴 저녁', rarity: 'rare', level: null, leveled: false,
  activityTypes: ['running'], hasImage: true, templateClass: 'metric', templateClassLabel: '운동 수치',
  templateValue: '21.1km', familyKey: null, ...over,
})
const preview = (b: StudioSearchBadge | null, t: TemplateItem[]) =>
  renderToStaticMarkup(<BadgePreview badge={b} templates={t} onGoToTemplates={vi.fn()} />)

describe('BadgePreview', () => {
  it('배지를 고르기 전', () => {
    expect(preview(null, [])).toContain('배지를 검색해서 골라 주세요')
  })
  it('분류를 정하지 못한 배지', () => {
    const h = preview(badge({ templateClass: null, templateClassLabel: null, templateValue: null }), [])
    expect(h).toContain('이 배지는 분류를 정하지 못했어요. 획득 조건이 템플릿 규칙에 없는 종류예요. 규칙을 더해야 하니 개발 요청을 남겨 주세요.')
  })
  it('템플릿이 없으면 안내와 이동 버튼', () => {
    const h = preview(badge(), [template(null)])
    expect(h).toContain('운동 수치 템플릿이 아직 없어요. 템플릿 탭에서 SVG를 올려 주세요.')
    expect(h).toContain('템플릿 탭으로 가기')
  })
  it('정상이면 캔버스와 이름·값·분류 세 줄', () => {
    const h = preview(badge(), [template('<svg xmlns="http://www.w3.org/2000/svg"/>')])
    expect(h).toContain('<canvas')
    expect(h).toContain('트럭 꽁무니를 따라 뛴 저녁')
    expect(h).toContain('21.1km')
    expect(h).toContain('분류')
  })
})

describe('previewNotes', () => {
  it('글꼴·줄임·그리지 못함 안내 문구', () => {
    expect(
      previewNotes({
        fontFallbacks: [{ slot: 'name', requestedFamily: 'Foo' }, { slot: 'value', requestedFamily: null }],
        shrunk: ['value'],
        skipped: ['name'],
      })
    ).toEqual([
      '이름 자리의 글꼴 Foo를 구글 폰트에서 찾지 못해 기본 글꼴로 보여요.',
      '값 자리에 글꼴 정보가 없어 기본 글꼴로 보여요.',
      '값이 길어서 글자 크기를 줄였어요.',
      '이름 자리의 위치를 읽지 못해 글자를 그리지 못했어요. 템플릿을 다시 올려 주세요.',
    ])
  })
})

describe('BadgePicker', () => {
  const props = {
    filters: { query: '', kind: ALL_VALUE, rarity: ALL_VALUE, activity: ALL_VALUE },
    onFiltersChange: vi.fn(), loading: false, error: null, total: 2, page: 1, totalPages: 1,
    selectedId: null, onSearch: vi.fn(), onSelect: vi.fn(),
  }
  it('결과 표의 열과 없음·- 표기', () => {
    const h = renderToStaticMarkup(
      <BadgePicker
        {...props}
        results={[badge(), badge({ id: 'b2', templateClass: null, templateClassLabel: null, templateValue: null, hasImage: false })]}
      />
    )
    for (const t of ['검색 결과 2건', '배지 이름', '등급 · 레벨', '분류', '이미지', '선택', '운동 수치', '21.1km', '있음']) {
      expect(h).toContain(t)
    }
    expect(h).toContain('>없음<')
    expect(h).toContain('>-<')
  })
  it('결과가 없으면 문구', () => {
    expect(renderToStaticMarkup(<BadgePicker {...props} total={0} results={[]} />)).toContain('검색 결과가 없어요')
  })
})
