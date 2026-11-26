// @vitest-environment jsdom
/**
 * BadgeRevealCarousel 재오픈 리셋 회귀 (티켓 20261126_1249, 원 회귀 20260824_001)
 *
 * 스핀 제거 뒤 같은 카드 수로 닫았다 다시 열면 직전에 넘긴 카드가 남던 회귀를 고정한다.
 * 스토리 `ReopenResetRegression`의 play 단계를 그대로 옮겼다(스토리 play는 vitest에서 돌지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/BadgeRevealCarouselReopen.test.tsx
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { act, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BadgeRevealCarousel } from '@/components/ui/BadgeRevealCarousel'

const POOL = Array.from({ length: 20 }, (_, i) => ({
  id: `badge-${i + 1}`,
  name: `한강 러너 ${i + 1}`,
  description: '한강을 따라 10km를 달리면 획득해요.',
  rarity: 'common' as const,
}))

function Harness() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(3)
  const items = useMemo(() => POOL.slice(0, count), [count])

  return (
    <div>
      {[3, 20, 1].map((n) => (
        <button
          key={n}
          type="button"
          data-testid={`open-${n}`}
          onClick={() => {
            setCount(n)
            setOpen(true)
          }}
        >
          {`${n}개 열기`}
        </button>
      ))}
      <BadgeRevealCarousel open={open} items={items} onClose={() => setOpen(false)} />
    </div>
  )
}

let container: HTMLDivElement
let root: Root

/** 중앙 카드(aria-hidden="false")의 배지 이름. 이웃 카드는 aria-hidden="true"다. */
function center(): string {
  const el = container.querySelector('[role="dialog"] [aria-hidden="false"]')
  return el?.querySelectorAll('p')[0]?.textContent?.trim() ?? ''
}

function dialogCount(): number {
  return container.querySelectorAll('[role="dialog"]').length
}

async function press(key: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

async function openWith(n: number) {
  const btn = container.querySelector(`[data-testid="open-${n}"]`) as HTMLButtonElement
  await act(async () => {
    btn.click()
  })
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Harness />)
  })
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('BadgeRevealCarousel 재오픈 리셋', () => {
  it('같은 카드 수로 닫았다 다시 열면 첫 카드가 중앙이다', async () => {
    await openWith(3)
    expect(center()).toBe('한강 러너 1')

    await press('ArrowRight')
    expect(center()).toBe('한강 러너 2')

    await press('Escape')
    expect(dialogCount()).toBe(0)

    await openWith(3)
    expect(center()).toBe('한강 러너 1')
  })

  it('열린 채 카드 수를 20개로 바꿔도 첫 카드로 리셋된다', async () => {
    await openWith(3)
    await press('ArrowRight')
    expect(center()).toBe('한강 러너 2')

    await openWith(20)
    expect(center()).toBe('한강 러너 1')
  })

  it('20개에서 넘긴 뒤 닫고 1개로 다시 열어도 첫 카드다', async () => {
    await openWith(20)
    await press('ArrowRight')
    await press('ArrowRight')
    expect(center()).toBe('한강 러너 3')

    await press('Escape')
    expect(dialogCount()).toBe(0)

    await openWith(1)
    expect(center()).toBe('한강 러너 1')
  })
})
