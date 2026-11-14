/**
 * SyncIconButton — TopNav 동기화 아이콘 서클 (티켓 20261114_1349)
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 마크업을 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/SyncIconButton.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SyncIconButton from '../SyncIconButton'

describe('SyncIconButton', () => {
  it('type="button"이고 aria-label이 붙으며 글자는 없다', () => {
    const html = renderToStaticMarkup(<SyncIconButton label="동기화" />)
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="동기화"')
    expect(html).toContain('aria-busy="false"')
    expect(html).not.toContain('>동기화<')
  })

  it('알림 종과 같은 규격이다(44 박스·36 서클·bg-border·16 아이콘·-mr-1)', () => {
    const html = renderToStaticMarkup(<SyncIconButton label="동기화" />)
    expect(html).toContain('w-11 h-11 -mr-1')
    expect(html).toContain('w-9 h-9 rounded-full bg-border text-foreground')
    expect(html).toContain('w-4 h-4')
    expect(html).toContain('active:scale-95')
    expect(html).toContain('aria-hidden="true"')
  })

  it('loading이면 aria-busy와 아이콘 회전이 켜지고 모션 줄이기에서는 회전 대신 서클이 흐려진다', () => {
    const html = renderToStaticMarkup(<SyncIconButton label="동기화" loading disabled />)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('animate-spin motion-reduce:animate-none')
    expect(html).toContain('motion-reduce:opacity-60')
  })

  it('loading이 아니면 회전하지 않는다', () => {
    const html = renderToStaticMarkup(<SyncIconButton label="동기화" />)
    expect(html).not.toContain('animate-spin')
  })
})
