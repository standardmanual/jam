/**
 * `isSafeListHref` 순수 파일 이동 뒤 동작 불변 (티켓 20261121_1530).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSafeListHref } from '../listHref'
import { isSafeListHref as reExported } from '@/components/today/feed/FeedGalleryListCard'

describe('isSafeListHref', () => {
  it('내부 경로와 https 주소는 안전하다', () => {
    for (const ok of ['/drops', '/drops?place=mountain', '/', 'https://j-a-m.app/drops', 'HTTPS://example.com']) {
      expect(isSafeListHref(ok)).toBe(true)
    }
  })

  it('javascript:·http:·프로토콜 상대·역슬래시·공백·빈 값은 안전하지 않다', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', '//evil.com', '/\\evil.com', '/drops now', ' /drops', '', 'drops']) {
      expect(isSafeListHref(bad)).toBe(false)
    }
    expect(isSafeListHref(null)).toBe(false)
    expect(isSafeListHref(undefined)).toBe(false)
  })

  it('카드 컴포넌트 파일이 같은 함수를 다시 내보낸다(기존 가져오기 유지)', () => {
    expect(reExported).toBe(isSafeListHref)
  })

  it('순수 파일은 React·next·서버 모듈을 가져오지 않는다', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'listHref.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
