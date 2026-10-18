/**
 * 잠긴 아이템 배지 상세 — 열기 전 화면의 마크업 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 첫 화면을 고정한다.
 * 클릭으로 일어나는 전환(채우기·열기)의 결정은 `lockedItemFill-flow.test.ts`가, 요청 모양은 `lockedItemFill-client.test.ts`가 맡는다.
 *
 * 확인하는 것
 * ① 타일, 등급 칩, «잠김» 칩, 가린 이름, 여는 데 필요한 양 문구, 게이지, 가진 잼, 얻은 날과 경로가 있다.
 * ② 이름·그림·설명·컬렉션·트라이브·일련번호·배지 상세 링크가 없다. 게이지에 진행 숫자와 퍼센트가 없다.
 * ③ 다 채우지 못했으면 «채우기», 다 채웠으면 «열기». 가진 잼이 없으면 «채우기»가 비활성이고 이유 문구가 보인다.
 * ④ 이력 시트(`InventoryItemHistorySheet`)를 쓰지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/inventory/[itemId]/__tests__/LockedItemDetail.test.tsx"
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/inventory/x',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/ui/TopNav', () => ({ default: () => <div data-stub="topnav" /> }))

import LockedItemDetail, { type LockedItemDetailProps } from '../LockedItemDetail'
import { d } from '@/lib/i18n'

const BASE: LockedItemDetailProps = {
  itemId: '22222222-2222-4222-8222-222222222222',
  rarity: 'rare',
  required: 120,
  filled: 30,
  balance: 500,
  obtainedAt: '2026-10-18T01:00:00Z',
  obtainedBy: 'system_event',
}

/** 주석을 뺀 소스 — 주석에 적힌 설명 때문에 검사가 걸리지 않게 한다 */
function sourceCode(): string {
  const source = readFileSync(fileURLToPath(new URL('../LockedItemDetail.tsx', import.meta.url)), 'utf8')
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function render(overrides: Partial<LockedItemDetailProps> = {}): string {
  return renderToStaticMarkup(<LockedItemDetail {...BASE} {...overrides} />)
}

describe('LockedItemDetail — 열기 전', () => {
  it('타일·등급·잠김 칩·가린 이름·필요한 양 문구·게이지·가진 잼·얻은 날과 경로가 있다', () => {
    const html = render()
    expect(html).toContain(d.lockedItem.card.name)
    expect(html).toContain(d.lockedItem.detail.chip)
    expect(html).toContain('여는 데 잼 120만큼 채워야 해요')
    expect(html).toContain(d.capsule.sheet.balanceLabel)
    expect(html).toContain('500')
    expect(html).toContain(d.inventory.obtainedAt)
    expect(html).toContain(d.inventory.obtainBySystem)
    expect(html).toContain('<svg')
    expect(html).toContain('--ds-progress-fill:25%')
  })

  it('이름·그림·컬렉션·트라이브·일련번호·배지 상세 링크가 없다', () => {
    const html = render()
    expect(html).not.toContain('<img')
    expect(html).not.toContain('/badges/')
    expect(html).not.toContain(d.lockedItem.detail.opened.badgeLink)
    expect(html).not.toContain('컬렉션 ')
    expect(html).not.toContain('트라이브 ')
  })

  it('게이지에는 진행 숫자와 퍼센트가 없고 상태는 글자 이름으로 전한다', () => {
    const html = render()
    expect(html).toContain(`aria-label="${d.lockedItem.detail.gaugeAria.filling}"`)
    // 화면에 보이는 글자만 본다(스타일의 비율 값은 숫자 표시가 아니다)
    const visibleText = html.replace(/<[^>]*>/g, ' ')
    expect(visibleText).not.toMatch(/\d+\s*%/)
    expect(visibleText).not.toMatch(/\d+\s*\/\s*\d+/)
  })

  it('다 채우지 못했으면 «채우기»가 주 버튼이고 «열기»는 없다', () => {
    const html = render()
    expect(html).toContain(d.lockedItem.detail.fillCta)
    expect(html).not.toContain(`>${d.lockedItem.detail.openCta}<`)
  })

  it('다 채웠으면 «열기»가 주 버튼이고 «채우기»는 없다', () => {
    const html = render({ filled: 120 })
    expect(html).toContain(d.lockedItem.detail.openCta)
    expect(html).not.toContain(`>${d.lockedItem.detail.fillCta}<`)
    expect(html).toContain(`aria-label="${d.lockedItem.detail.gaugeAria.ready}"`)
    expect(html).toContain('--ds-progress-fill:100%')
  })

  it('가진 잼이 없으면 «채우기»가 비활성이고 이유 문구가 보인다', () => {
    const html = render({ balance: 0 })
    expect(html).toMatch(new RegExp(`<button[^>]*disabled[^>]*>[^<]*${d.lockedItem.detail.fillCta}`))
    expect(html).toContain(d.capsule.sheet.noJam)
  })

  it('가진 잼이 있으면 이유 문구가 없다', () => {
    expect(render()).not.toContain(d.capsule.sheet.noJam)
  })

  it('등급이 없는 개체(null)는 등급 칩 없이 그려진다', () => {
    expect(render({ rarity: null })).toContain(d.lockedItem.card.name)
  })

  it('이력 시트를 쓰지 않는다(잠긴 상태에서는 노출하지 않는다)', () => {
    expect(sourceCode()).not.toMatch(/InventoryItemHistorySheet|\/history/)
  })

  it('보조 문구에 --muted 글자색을 쓰지 않는다(크림 면 위라 --foreground)', () => {
    // 아이콘 폴백(MedalIcon)의 색은 글자가 아니라 장식이라 제외한다
    expect(sourceCode().replace(/<MedalIcon[^>]*\/>/g, '')).not.toMatch(/text-muted\b/)
  })
})
