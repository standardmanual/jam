/**
 * 프로필 편집 맨 아래의 «탈퇴하기» 진입 (티켓 20261021_1249 3회, 채원 사전 판정 2026-10-21)
 *
 * 화면은 로드 뒤에만 그려지고(스피너 → 본문) 저장소에 jsdom이 없어, 이 화면은 소스를 읽어 판정이 정한 모양을 고정한다.
 * - 메일 링크(mailto)와 설명 캡션이 사라졌다
 * - 취소 아래에 일반 button이 있다: type="button", 가운데, text-sm text-muted 밑줄, 16px를 더 띄움(gap 16 + mt-4 = 약 32px), 최소 44px 높이, aria-haspopup="dialog"
 * - 누르면 탈퇴 시트가 열리고 시트는 이 화면이 렌더한다
 * - 저장은 기존 primary 알약, 취소는 기존 텍스트 버튼 그대로다(변경 없음)
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/edit/__tests__/withdrawEntry.test.ts"
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { d } from '@/lib/i18n'

const source = readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf-8')

/** «탈퇴하기» 버튼 요소 하나(여는 태그부터 닫는 태그까지) */
const entryButton = (() => {
  const label = '{d.profileEdit.withdrawButton}'
  const end = source.indexOf(label)
  const start = source.lastIndexOf('<button', end)
  return source.slice(start, source.indexOf('</button>', end) + '</button>'.length)
})()

describe('프로필 편집 — 탈퇴하기 진입', () => {
  it('메일 링크와 설명 캡션이 없다', () => {
    expect(source).not.toContain('mailto:')
    expect(source).not.toContain('withdrawLink')
    expect(source).not.toContain('withdrawCaption')
  })

  it('일반 button이고 가운데 놓이며 작은 밑줄 텍스트다 — 위험한 진입을 ghost(초록)로 그리지 않는다', () => {
    expect(entryButton).toContain('type="button"')
    expect(entryButton).toContain('self-center')
    expect(entryButton).toContain('text-sm')
    expect(entryButton).toContain('text-muted')
    expect(entryButton).toContain('underline underline-offset-4')
    expect(entryButton).toContain('min-h-11 px-4')
    expect(entryButton).toContain('active:opacity-70')
    expect(entryButton).toContain('aria-haspopup="dialog"')
    expect(entryButton).not.toContain('<Button')
    expect(entryButton).not.toMatch(/text-link|text-danger|text-red/)
  })

  it('한국어 줄바꿈 클래스를 갖는다', () => {
    expect(entryButton).toContain('break-keep')
    expect(entryButton).toContain('wrap-break-word')
    expect(entryButton).toContain('whitespace-nowrap')
  })

  it('취소 아래로 16px를 더 띄운다 — 부모 gap-4 위에 mt-4', () => {
    expect(entryButton).toContain('mt-4')
    expect(source).toMatch(/<div className="flex flex-col gap-4 mt-auto">/)
  })

  it('누르면 시트가 열리고 시트를 이 화면이 렌더한다', () => {
    expect(entryButton).toContain('onClick={() => setWithdrawSheetOpen(true)}')
    expect(source).toContain("import WithdrawSheet from '@/components/account/WithdrawSheet'")
    expect(source).toContain('<WithdrawSheet open={withdrawSheetOpen} onClose={() => setWithdrawSheetOpen(false)} />')
  })

  it('순서는 저장 → 취소 → 탈퇴하기다', () => {
    const save = source.indexOf('{saving ? d.profileEdit.saving : d.profileEdit.saveButton}')
    const cancel = source.indexOf('{d.profileEdit.cancelButton}')
    const withdraw = source.indexOf('{d.profileEdit.withdrawButton}')
    expect(save).toBeGreaterThan(0)
    expect(save).toBeLessThan(cancel)
    expect(cancel).toBeLessThan(withdraw)
  })

  it('저장과 취소는 기존 그대로다 — 저장은 primary 알약, 취소는 text-muted 텍스트 버튼', () => {
    expect(source).toContain('w-full min-h-11 bg-background-inverse text-snow py-[14px] rounded-full')
    expect(source).toContain('w-full min-h-11 text-muted text-base active:opacity-70 transition-opacity')
  })

  it('버튼 문구는 사전의 «탈퇴하기»다', () => {
    expect(d.profileEdit.withdrawButton).toBe('탈퇴하기')
  })
})
