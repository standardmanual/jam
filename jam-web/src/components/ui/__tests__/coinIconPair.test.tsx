/**
 * CoinIcon 그림 검사 (티켓 20261112_1628, 20261114_2345에서 새 그림 기준으로 갱신)
 *
 * 42종 전체의 사양 대조는 icons.test.tsx가 지킨다. 이 파일은 CoinIcon의 새 그림(P + 작은 반짝이)과
 * 기본 variant(fill)만 따로 못 박는다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { CoinIcon as ServiceCoinIcon } from '../icons'

describe('CoinIcon 쌍', () => {
  const service = renderToStaticMarkup(<ServiceCoinIcon className="w-5 h-5" />)

  it('새 그림(P와 반짝이)이고 옛 확대 변환·서클은 없다', () => {
    expect(service).toContain('d="M13.5 42 V7 H26.5')
    expect(service).toContain('translate(-2.5 0)')
    expect(service).not.toContain('scale(2.08)')
    expect(service).not.toContain('M21 12a9 9')
  })

  it('기본 variant는 fill이라 글자색 면으로 채워진다', () => {
    expect(service).toContain('fill="currentColor"')
    const line = renderToStaticMarkup(<ServiceCoinIcon variant="line" className="w-5 h-5" />)
    expect(line).not.toBe(service)
  })
})
