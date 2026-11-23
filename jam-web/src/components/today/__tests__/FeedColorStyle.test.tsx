/**
 * 홈피드 색 덮어쓰기 `<style>` (티켓 20261121_2145)
 *
 * 확인하는 것: 덮어쓴 키만 `--feed-color-<키>`로 나오고, 덮어쓴 키가 없으면 아무것도 그리지 않으며, 디자인 시스템 토큰(`--jam-*`)을 내리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedColorStyle.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const h = vi.hoisted(() => ({ overrides: {} as Record<string, string> }))

vi.mock('@/lib/today/feedColorOverridesServer', () => ({
  getFeedColorOverrides: async () => h.overrides,
}))

import FeedColorStyle from '../FeedColorStyle'

async function render(): Promise<string> {
  const element = await FeedColorStyle()
  return element === null ? '' : renderToStaticMarkup(element)
}

beforeEach(() => {
  h.overrides = {}
})

describe('FeedColorStyle', () => {
  it('덮어쓴 키가 없으면 아무것도 그리지 않는다', async () => {
    expect(await FeedColorStyle()).toBeNull()
    expect(await render()).toBe('')
  })

  it('덮어쓴 키만 :root의 카드 전용 변수로 내린다', async () => {
    h.overrides = { 'red': '#ff0000', 'green': '#00ff00' }
    const html = await render()
    expect(html).toContain(':root{--feed-color-red:#ff0000;--feed-color-green:#00ff00}')
    expect(html.startsWith('<style')).toBe(true)
    expect(html).not.toContain('--feed-color-blue')
  })

  it('디자인 시스템 토큰(--jam-*)은 내리지 않는다', async () => {
    h.overrides = { red: '#ff0000', blue: '#0000ff' }
    expect(await render()).not.toContain('--jam-')
  })

  it('모르는 키·잘못된 값은 내려가지 않는다(CSS 주입 불가)', async () => {
    h.overrides = { red: '#ff0000;}body{display:none', 'x}y': '#000000' }
    expect(await FeedColorStyle()).toBeNull()
  })
})
