/**
 * TemplateCard 시험 (티켓 20261116_0426) — 네 상태의 문구·버튼과 SVG를 날것으로 끼우지 않는 약속
 * 실행: cd jam-web && npx vitest run src/app/admin/activity-badge-template
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TemplateCard, { describeSlot, svgToDataUrl, type TemplateCardProps } from '../TemplateCard'
import type { TemplateSlot, TemplateSlots } from '@/lib/admin/activityBadgeTemplate/templateSvg'

const slot = (over: Partial<TemplateSlot> = {}): TemplateSlot => ({
  found: true, isText: true, x: 1, y: 2, fontFamily: 'Pretendard', fontSize: 48, fontWeight: null,
  fill: '#123B2E', letterSpacing: null, textAnchor: null, transform: null, placeholder: '배지 이름', ...over,
})
const slots: TemplateSlots = { viewBoxWidth: 1024, viewBoxHeight: 1024, name: slot(), value: slot({ placeholder: '100km' }) }
// 표식 글자는 data URL 안에서는 인코딩돼 보이지만, 마크업에 날것의 <svg나 본문이 있으면 안 된다
const MARK = 'MARKER_RAW_TEXT'
const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text id="name">${MARK}</text></svg>`

const base: TemplateCardProps = {
  item: { classKey: 'metric', label: '운동 수치', svg: null, slots: null, updatedAt: null, updatedBy: null },
  pending: null,
  busy: false,
  onPickFile: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
}
const html = (over: Partial<TemplateCardProps>) => renderToStaticMarkup(<TemplateCard {...base} {...over} />)

describe('TemplateCard', () => {
  it('없음: 상태 배지, 빈 미리보기 문구, SVG 올리기 버튼', () => {
    const h = html({})
    expect(h).toContain('없음')
    expect(h).toContain('아직 템플릿이 없어요')
    expect(h).toContain('SVG 올리기')
    expect(h).toContain('값의 예: 21.1km, 1,947m, 1시간 30분')
    expect(h).not.toContain('지우기')
  })

  it('등록됨: 이미지는 data URL이고 SVG 본문이 날것으로 들어가지 않는다', () => {
    const h = html({
      item: { ...base.item, svg, slots, updatedAt: '2026-11-16T00:00:00Z', updatedBy: 'a@jam.test' },
    })
    expect(h).toContain('등록됨')
    expect(h).toContain('src="data:image/svg+xml')
    expect(h).toContain('alt="운동 수치 템플릿 미리보기"')
    expect(h).not.toContain('<svg')
    expect(h).not.toContain('>' + MARK)
    expect(h).toContain('이름 자리')
    expect(h).toContain('값 자리')
    expect(h).toContain('1024 × 1024')
    expect(h).toContain('2026.11.16 09:00 · a@jam.test')
    expect(h).toContain('바꾸기')
    expect(h).toContain('지우기')
    expect(h).toContain('미리보기의 글자는 이 컴퓨터에 설치된 글꼴로 보여요.')
  })

  it('저장 전 확인: 파일 이름, 걷어 낸 목록, 저장·취소', () => {
    const h = html({
      pending: { kind: 'ready', fileName: 'a.svg', svg, rawSvg: svg, removed: ['요소 script'], slots },
    })
    expect(h).toContain('저장하기 전에 확인해 주세요')
    expect(h).toContain('a.svg')
    expect(h).toContain('안전을 위해 1가지를 걷어 냈어요')
    expect(h).toContain('요소 script')
    expect(h).toContain('>저장<')
    expect(h).toContain('>취소<')
    expect(h).not.toContain('<svg')
    expect(h).not.toContain('>' + MARK)
  })

  it('오류: 검증 문구와 다른 파일 고르기·취소, 기존 미리보기는 그대로', () => {
    const h = html({
      item: { ...base.item, svg, slots, updatedAt: '2026-11-16T00:00:00Z', updatedBy: 'a@jam.test' },
      pending: { kind: 'invalid', fileName: 'b.svg', error: 'SVG를 읽지 못했어요.' },
    })
    expect(h).toContain('SVG를 읽지 못했어요.')
    expect(h).toContain('다른 파일 고르기')
    expect(h).toContain('>취소<')
    expect(h).toContain('src="data:image/svg+xml')
    expect(h).toContain('이름 자리')
  })

  it('busy면 버튼이 모두 비활성이다', () => {
    const h = html({ busy: true })
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>SVG 올리기/)
  })
})

describe('순수 함수', () => {
  it('svgToDataUrl', () => {
    expect(svgToDataUrl('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
  })
  it('describeSlot은 값이 없는 조각을 뺀다', () => {
    expect(describeSlot(slot())).toBe('“배지 이름” · Pretendard · 48px · #123B2E')
    expect(describeSlot(slot({ placeholder: null, fontFamily: null, fontSize: null }))).toBe('#123B2E')
  })
})
