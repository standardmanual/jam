import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SlotCircleButton from '@/components/ui/SlotCircleButton'

/**
 * 컬렉션 상세 티켓 위 «빼기»·«추가» 원 버튼의 아이콘 색(티켓 20261127_0009).
 * 티켓 안쪽 구간의 `.faceKeepCards button:not(.bg-accent)` 규칙이 버튼 글자색을 잉크색(#171717)으로 덮어,
 * 검정 원 위 «+»와 레드 원 위 «−»가 보이지 않거나 어둡게 나왔다. 원 버튼은 이 규칙에서 빠지고 --snow를 쓴다.
 */
describe('티켓 위 칸 원 버튼 아이콘', () => {
  const css = readFileSync(new URL('../BadgeTicket.module.css', import.meta.url), 'utf-8')

  it('.faceKeepCards의 버튼 잉크색 규칙은 data-slot-circle 버튼을 제외한다', () => {
    expect(css).toContain(':global(button:not(.bg-accent):not([data-slot-circle]))')
  })

  it.each(['plus', 'minus'] as const)('%s 원 버튼은 표식과 --snow 글자색(text-snow)을 함께 가진다', (icon) => {
    const html = renderToStaticMarkup(<SlotCircleButton icon={icon} label="테스트" onClick={() => {}} />)
    expect(html).toContain('data-slot-circle')
    expect(html).toContain('text-snow')
  })
})
