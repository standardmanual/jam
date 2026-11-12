/**
 * CoinIcon 서비스 사본 ↔ DS 사본 대조 (티켓 20261112_1628)
 *
 * 서비스 `icons.tsx`와 DS `IconCatalog.jsx`의 아이콘은 병존하는 쌍이고 `npm run ds:check` 페어에 들어 있지 않다.
 * 그래서 CoinIcon 하나만 두 사본이 같은 모양(path·확대 변환·선 굵기)인지 이 시험이 지킨다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { CoinIcon as ServiceCoinIcon } from '../icons'
import { CoinIcon as DsCoinIcon } from '@ds/components/icons/IconCatalog'

function innerOf(markup: string): string {
  return markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
}

describe('CoinIcon 쌍', () => {
  const service = renderToStaticMarkup(<ServiceCoinIcon className="w-5 h-5" />)
  const ds = renderToStaticMarkup(<DsCoinIcon className="w-5 h-5" />)

  it('서비스와 DS의 도형(path·변환·선 굵기)이 문자 단위로 같다', () => {
    expect(innerOf(service)).toBe(innerOf(ds))
  })

  it('서클 path가 없고 P path만 2.08배·선 2.1로 있다', () => {
    const inner = innerOf(service)
    expect(inner).not.toContain('M21 12a9 9')
    expect(inner).toContain('d="M9.7 16V8.2h2.6a2.3 2.3 0 010 4.6H9.7"')
    expect(inner).toContain('stroke-width="2.1"')
    expect(inner).toContain('translate(12 12) scale(2.08) translate(-12 -12)')
  })
})
