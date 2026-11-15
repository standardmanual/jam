/**
 * 등록 도우미와 확인 대화상자 시험 (티켓 20261116_0748)
 * 실행: cd jam-web && npx vitest run src/app/admin/activity-badge-template
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { summarizeBatch } from '../registerTemplateBadge'
import { BatchRegisterDialog, SingleRegisterDialog } from '../RegisterDialogs'
import type { StudioSearchBadge } from '../BadgePicker'

// Radix 포털은 서버 렌더에서 비므로 시험에서만 단순 태그로 바꾼다.
vi.mock('@/components/admin/ui/alert-dialog', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    AlertDialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => (open ? <div>{children}</div> : null),
    AlertDialogContent: Box,
    AlertDialogHeader: Box,
    AlertDialogFooter: Box,
    AlertDialogTitle: Box,
    AlertDialogDescription: Box,
    AlertDialogCancel: Box,
    AlertDialogAction: Box,
  }
})

const badge = (over: Partial<StudioSearchBadge> = {}): StudioSearchBadge => ({
  id: 'b1', name: '새벽 러너', rarity: 'rare', level: null, leveled: false,
  activityTypes: ['running'], hasImage: true, templateClass: 'metric', templateClassLabel: '운동 수치',
  templateValue: '21.1km', familyKey: 'f1', templateParams: null, ...over,
})

describe('summarizeBatch', () => {
  it('성공 2건과 실패 1건', () => {
    const s = summarizeBatch([
      { name: 'A', result: { ok: true, imageUrl: 'u' } },
      { name: 'B', result: { ok: false, error: '실패했어요' } },
      { name: 'C', result: { ok: true, imageUrl: 'u' } },
    ])
    expect(s).toEqual({ total: 3, okCount: 2, failed: [{ name: 'B', error: '실패했어요' }] })
  })
})

describe('SingleRegisterDialog', () => {
  const html = (b: StudioSearchBadge | null) =>
    renderToStaticMarkup(<SingleRegisterDialog badge={b} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
  it('이미지가 있으면 바꿀까요, 없으면 등록할까요', () => {
    expect(html(badge({ hasImage: true }))).toContain('배지 이미지를 바꿀까요?')
    expect(html(badge({ hasImage: false }))).toContain('배지 이미지를 등록할까요?')
  })
  it('대상이 없으면 열리지 않는다', () => {
    expect(html(null)).toBe('')
  })
})

describe('BatchRegisterDialog', () => {
  it('단계 목록과 개수 버튼', () => {
    const out = renderToStaticMarkup(
      <BatchRegisterDialog
        badges={[badge(), badge({ id: 'b2', name: '새벽 러너 2', rarity: 'epic', templateValue: '42km' })]}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(out).toContain('이미지를 등록할까요?')
    expect(out).toContain('새벽 러너 2')
    expect(out).toContain('42km')
    expect(out).toContain('2개 등록')
  })
})
