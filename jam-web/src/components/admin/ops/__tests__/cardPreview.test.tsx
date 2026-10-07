import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { OpsCardPreview, PREVIEW_IMAGE_NEEDED_TEXT, PREVIEW_IMAGE_PENDING_TEXT, PREVIEW_NOT_CARD_TEXT } from '../OpsCardPreview'

const html = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

function item(original: Record<string, unknown>, kind: string | null = 'home_feed_card') {
  return { id: 'item-1', kind, original: original as never, edited: null }
}

const BASE = {
  shape: 'hero',
  exposure_tags: ['all'],
  copy: { title: '우산 챙겨 달리기' },
  colors: { background: '#1a2b3c', text: '#ffffff' },
  resource: { template_type: 'editorial_article', cover_image_url: 'https://example.com/a.png' },
}

describe('OpsCardPreview', () => {
  it('카드를 그리고 기기 폭 360·430 전환이 있으며 링크·트래커를 그리지 않는다', () => {
    const out = html(<OpsCardPreview item={item(BASE)} />)
    expect(out).toContain('우산 챙겨 달리기')
    expect(out).toContain('기기 폭')
    expect(out).toContain('360')
    expect(out).toContain('430')
    expect(out).not.toContain('href=')
  })

  it('색은 견본 칩으로 보인다(형식이 맞는 색만)', () => {
    const out = html(<OpsCardPreview item={item({ ...BASE, colors: { background: '#1a2b3c', text: '빨강' } })} />)
    expect(out).toContain('색 견본')
    expect(out).toContain('background-color:#1a2b3c')
    expect(out).not.toContain('빨강')
  })

  it('초안 문안이 바로 반영된다', () => {
    const out = html(<OpsCardPreview item={item(BASE)} draft={{ 'copy.title': '바뀐 제목' }} />)
    expect(out).toContain('바뀐 제목')
    expect(out).not.toContain('우산 챙겨 달리기')
  })

  it('카드가 아닌 종류는 안내 한 줄만 보인다', () => {
    const out = html(<OpsCardPreview item={item(BASE, 'mission')} />)
    expect(out).toContain(PREVIEW_NOT_CARD_TEXT)
    expect(out).not.toContain('기기 폭')
  })

  it('이미지형 카드에 이미지가 없으면 「이미지는 승인 뒤 만들어요」를 보인다', () => {
    const noImage = { ...BASE, resource: { template_type: 'editorial_article' } }
    expect(html(<OpsCardPreview item={item(noImage)} />)).toContain(PREVIEW_IMAGE_PENDING_TEXT)
    expect(html(<OpsCardPreview item={item(BASE)} />)).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('승인됨·준비중이면 「이미지 제작 필요」, 도착·검토중이면 승인 뒤 안내를 보인다', () => {
    const noImage = { ...BASE, resource: { template_type: 'editorial_article' } }
    for (const status of ['approved', 'preparing']) {
      const out = html(<OpsCardPreview item={{ ...item(noImage), status }} />)
      expect(out).toContain(PREVIEW_IMAGE_NEEDED_TEXT)
      expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
    }
    for (const status of ['arrived', 'reviewing']) {
      const out = html(<OpsCardPreview item={{ ...item(noImage), status }} />)
      expect(out).toContain(PREVIEW_IMAGE_PENDING_TEXT)
      expect(out).not.toContain(PREVIEW_IMAGE_NEEDED_TEXT)
    }
  })
})
