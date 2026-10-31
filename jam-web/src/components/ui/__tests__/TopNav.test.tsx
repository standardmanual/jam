/**
 * TopNav `centerSlotOverride` 분기 (티켓 20260927_2331, 상위 20260927_2123 T2c).
 *
 * 온보딩 퀘스트 `sync` 차례에 홈이 넘기는 override가 stravaConnected 분기(SyncButton·
 * 연동 유도 버튼)를 가리는지만 고정한다. Provider 없이 렌더하면 `useTopNavData` 기본값
 * (stravaConnected: false)이 적용되므로, override 미지정 시 연동 유도 버튼(「동기화」
 * 라벨 + `/api/strava/auth` 이동)이 보인다는 것도 함께 확인한다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TopNav from '../TopNav'

describe('TopNav centerSlotOverride', () => {
  it('override가 없으면 기존 연동 유도 버튼(동기화)이 보인다', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).toContain('동기화')
  })

  it('override가 있으면 그 내용이 렌더되고 기존 연동 유도 버튼은 사라진다', () => {
    const html = renderToStaticMarkup(<TopNav logo centerSlotOverride={<span>연출 동기화 버튼</span>} />)
    expect(html).toContain('연출 동기화 버튼')
    expect(html).not.toContain('>동기화<')
  })
})

/**
 * 라이트 정비 (티켓 20261015_2133, 2회) — 로고·헤더 면·버튼·아바타 폴백
 *
 * 흰색 로고 PNG는 크림 바탕 위 1.05:1이라 사라진다. TopNav·로그인·문의 3곳이 같은 PNG를 알파 마스크로 쓰고
 * 색은 `--foreground` 토큰으로 칠한다. 헤더 면은 DS TopNav의 불투명 `--background` 그대로다.
 */
const read = (relative: string) => readFileSync(path.resolve(__dirname, '../../../', relative), 'utf8')

describe('TopNav 로고 — 마스크 + --foreground', () => {
  it('logo 모드는 <img> 대신 마스크 로고 마크를 그린다(이름은 바깥 링크의 aria-label이 맡는다)', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).toContain('jam-logo-mark')
    expect(html).toContain('aria-label="홈으로 이동"')
    expect(html).not.toContain('jam-logo-white.png')
  })

  it('로고 마크 CSS는 알파 마스크 + --foreground 색이고 filter 꼼수를 쓰지 않는다', () => {
    const css = read('app/globals.css')
    const block = /\.jam-logo-mark\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).toContain('mask:')
    expect(block).toContain("url('/jam-logo-white.png')")
    expect(block).toContain('background-color: var(--foreground)')
    expect(block).not.toMatch(/invert|brightness/)
  })

  it('TopNav·로그인·문의 3곳이 모두 마스크 로고를 쓰고 흰 PNG를 <Image>로 직접 그리지 않는다', () => {
    for (const file of ['components/ui/TopNav.tsx', 'app/(auth)/login/page.tsx', 'app/(main)/voc/page.tsx']) {
      const source = read(file)
      expect(source, file).toContain('jam-logo-mark')
      expect(source, file).not.toContain('jam-logo-white.png')
    }
  })
})

describe('TopNav 헤더 면과 버튼', () => {
  it('헤더 배경은 불투명 --background이고 호출부가 덮어쓰지 않으면 그대로다', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).toContain('background:var(--background)')
    expect(html).not.toContain('backdrop-filter')
  })

  it('로고 옆에 문의 버튼이 없고(푸터 링크로 옮김) 동기화 유도 버튼은 인라인 덮어쓰기 없는 primary다', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).not.toContain('>문의<')
    expect(html).not.toContain('/voc')
    const sync = /<button[^>]*>동기화<\/button>/.exec(html)?.[0] ?? ''
    expect(sync).toContain('bg-accent')
    expect(sync).toContain('text-accent-foreground')
    expect(sync).not.toContain('style="background-color')
  })

  it('사진 없는 아바타 폴백은 카드 면 레시피(--surface + 1px --border)다', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).toContain('bg-surface border border-border')
  })
})
