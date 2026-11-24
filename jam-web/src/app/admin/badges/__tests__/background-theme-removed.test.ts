/**
 * 배지·컬렉션 어드민 상세 화면에서 배경 테마(배경 방식·배경색) 설정이 제거됐음을 고정한다 (티켓 20261124_2326).
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/badges/__tests__/background-theme-removed.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BADGE_DETAIL_SRC = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'components', 'admin', 'badges', 'BadgeDetail.tsx'),
  'utf-8'
)
const BADGE_FORM_SRC = readFileSync(join(__dirname, '..', 'BadgeForm.tsx'), 'utf-8')
const ITEMBOOK_FORM_SRC = readFileSync(join(__dirname, '..', '..', 'itembooks', 'ItemBookForm.tsx'), 'utf-8')

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function extractBodyObject(src: string): string {
  const m = stripComments(src).match(/const body = \{[\s\S]*?\n\s*\}/)
  expect(m).not.toBeNull()
  return m![0]
}

describe('배지·컬렉션 어드민 상세 배경 테마 설정 제거', () => {
  it('BadgeDetail에 배경 읽기 항목과 저장된 배경 테마 참조가 없다', () => {
    const code = stripComments(BADGE_DETAIL_SRC)
    expect(code).not.toContain('label="배경"')
    expect(code).not.toContain('badge.background_color')
    expect(code).not.toContain('badge.background_animation')
    expect(code).not.toContain('parseBlobAnimation')
    expect(code).toContain('label="배지 이미지"')
  })

  it('BadgeForm에 배경 테마 UI·상태·검증이 없고 저장 본문에 배경 필드를 보내지 않는다', () => {
    const code = stripComments(BADGE_FORM_SRC)
    expect(code).not.toContain('BackgroundGeneratorPreview')
    expect(code).not.toContain('HEX_COLOR_PATTERN')
    expect(code).not.toContain('onAverageColor')
    expect(code).not.toContain('parseBlobAnimation')

    const body = extractBodyObject(BADGE_FORM_SRC)
    expect(body).not.toMatch(/background_color\s*:/)
    expect(body).not.toMatch(/background_animation\s*:/)
  })

  it('ItemBookForm에 배경 테마 UI·상태·검증이 없고 저장 본문에 배경 필드를 보내지 않는다', () => {
    const code = stripComments(ITEMBOOK_FORM_SRC)
    expect(code).not.toContain('BackgroundGeneratorPreview')
    expect(code).not.toContain('ItemBookDetailPreviewFrame')
    expect(code).not.toContain('HEX_COLOR_PATTERN')
    expect(code).not.toContain('parseBlobAnimation')
    expect(code).not.toContain('배경 테마')

    const body = extractBodyObject(ITEMBOOK_FORM_SRC)
    expect(body).not.toMatch(/background_color\s*:/)
    expect(body).not.toMatch(/background_animation\s*:/)
  })
})
