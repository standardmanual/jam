import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import {
  OpsCardPreview,
  PREVIEW_FEED_AUTO_TEXT,
  PREVIEW_IMAGE_MAKING_TEXT,
  PREVIEW_IMAGE_MISSION_TEXT,
  PREVIEW_IMAGE_NEEDED_TEXT,
  PREVIEW_IMAGE_PENDING_TEXT,
  PREVIEW_NOT_CARD_TEXT,
} from '../OpsCardPreview'
import { feedTypeValueNote } from '@/app/admin/today/FeedCardSection'

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

  it('알 수 없는 종류는 안내 한 줄만 보인다', () => {
    const out = html(<OpsCardPreview item={item(BASE, 'pattern_proposal')} />)
    expect(out).toContain(PREVIEW_NOT_CARD_TEXT)
    expect(out).not.toContain('기기 폭')
  })

  it('미션은 안내 문구 없이 목록 카드 모양으로 보이고 색 견본도 보인다', () => {
    const out = html(<OpsCardPreview item={item(BASE, 'mission')} />)
    expect(out).not.toContain(PREVIEW_NOT_CARD_TEXT)
    expect(out).not.toContain('기기 폭')
    expect(out).toContain('우산 챙겨 달리기')
    expect(out).toContain('색 견본')
  })

  it('이미지형 카드에 이미지가 없으면 「이미지는 색이 정해지면 만들어요」를 보인다', () => {
    const noImage = { ...BASE, resource: { template_type: 'editorial_article' } }
    expect(html(<OpsCardPreview item={item(noImage)} />)).toContain(PREVIEW_IMAGE_PENDING_TEXT)
    expect(PREVIEW_IMAGE_PENDING_TEXT).toBe('이미지는 색이 정해지면 만들어요')
    expect(html(<OpsCardPreview item={item(BASE)} />)).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('저장된 이미지가 있으면 도착·검토중이어도 안내 문구가 없다', () => {
    for (const status of ['arrived', 'reviewing']) {
      const out = html(<OpsCardPreview item={{ ...item(BASE), status }} making />)
      expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
      expect(out).not.toContain(PREVIEW_IMAGE_MAKING_TEXT)
    }
  })

  it('도착·검토중 항목의 이미지를 만드는 중이면 「이미지를 만드는 중이에요」를 보인다(색이 있는 카드·미션 모두)', () => {
    const noImage = { ...BASE, resource: { template_type: 'editorial_article' }, image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222' } }
    for (const status of ['arrived', 'reviewing']) {
      const card = html(<OpsCardPreview item={{ ...item(noImage), status }} making />)
      expect(card).toContain(PREVIEW_IMAGE_MAKING_TEXT)
      expect(card).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
    }
    const mission = html(<OpsCardPreview item={{ ...item({ ...BASE, resource: {} }, 'mission'), status: 'reviewing' }} making />)
    expect(mission).toContain(PREVIEW_IMAGE_MAKING_TEXT)
    expect(mission).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('승인됨·준비중이면 「이미지 제작 필요」, 도착·검토중이면 색이 정해지면 만든다는 안내를 보인다', () => {
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

  describe('미션 소개 카드 (티켓 20261120_1825)', () => {
    const MISSION_IMAGE = 'https://example.com/mission-image.png'
    const missionCard = {
      ...BASE,
      resource: { template_type: 'mission_spotlight' },
      links: ['mission-1'],
      image_spec: { preset_id: 'p1', bg: '#111111', end: '#222222' },
    }
    const missionItem = (image: string | null) => ({
      itemKey: 'mission-1',
      kind: 'mission',
      original: { copy: { title: '미션' }, resource: image ? { image_url: image } : {} } as never,
      edited: null,
    })
    const cardItem = (status: string) => ({ ...item(missionCard), itemKey: 'card-1', status })

    it('연결한 미션 항목의 대표 이미지를 카드 커버로 보이고 제작 안내는 보이지 않는다', () => {
      for (const status of ['arrived', 'approved']) {
        const out = html(<OpsCardPreview item={cardItem(status)} bundleItems={[missionItem(MISSION_IMAGE)]} />)
        expect(out).toContain(MISSION_IMAGE)
        expect(out).not.toContain(PREVIEW_IMAGE_MISSION_TEXT)
        expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
        expect(out).not.toContain(PREVIEW_IMAGE_NEEDED_TEXT)
      }
    })

    it('연결한 미션이 없거나 미션 이미지가 아직 없으면 «미션 대표 이미지를 써요»만 보인다', () => {
      expect(PREVIEW_IMAGE_MISSION_TEXT).toBe('미션 대표 이미지를 써요')
      for (const bundleItems of [[], [missionItem(null)]]) {
        for (const status of ['arrived', 'reviewing', 'approved']) {
          const out = html(<OpsCardPreview item={cardItem(status)} bundleItems={bundleItems} making />)
          expect(out).toContain(PREVIEW_IMAGE_MISSION_TEXT)
          expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
          expect(out).not.toContain(PREVIEW_IMAGE_NEEDED_TEXT)
          expect(out).not.toContain(PREVIEW_IMAGE_MAKING_TEXT)
        }
      }
    })
  })
})

describe('OpsCardPreview — 개편 카드 안내 (티켓 20261121_1532)', () => {
  const feedItem = (resource: Record<string, unknown>) =>
    item({ ...BASE, shape: undefined, resource: { template_type: 'editorial_article', cover_image_url: 'https://example.com/a.png', ...resource } })

  it('새 유형 항목에는 «색과 칩 자리» 안내가 보이고 한 줄 줄바꿈 클래스가 붙는다', () => {
    expect(PREVIEW_FEED_AUTO_TEXT).toBe('색과 칩 자리는 등록할 때 정해져서 홈과 조금 다를 수 있어요')
    const out = html(<OpsCardPreview item={feedItem({ feed_type: 'hero_box' })} />)
    expect(out).toContain(PREVIEW_FEED_AUTO_TEXT)
    expect(out).toMatch(/class="[^"]*break-keep wrap-break-word[^"]*">색과 칩 자리는/)
  })

  it('값이 있어야 새 모습인 유형에는 어드민 폼과 같은 안내가 더 보인다', () => {
    for (const type of ['collection_intro', 'drop_pickup', 'gallery_list'] as const) {
      const out = html(<OpsCardPreview item={feedItem({ feed_type: type })} />)
      expect(out).toContain(feedTypeValueNote(type) as string)
      expect(out).toContain(PREVIEW_FEED_AUTO_TEXT)
    }
    const hero = html(<OpsCardPreview item={feedItem({ feed_type: 'hero_box' })} />)
    expect(hero).not.toContain('새 모습으로 보여요')
  })

  it('새 칸이 없거나 모르는 유형인 항목에는 안내가 없다', () => {
    for (const original of [BASE, feedItem({ feed_type: 'nope' }).original as Record<string, unknown>]) {
      const out = html(<OpsCardPreview item={item(original)} />)
      expect(out).not.toContain(PREVIEW_FEED_AUTO_TEXT)
      expect(out).not.toContain('새 모습으로 보여요')
    }
  })

  it('카드가 아닌 종류에는 안내가 없다', () => {
    const out = html(<OpsCardPreview item={item({ ...BASE, resource: { feed_type: 'hero_box' } }, 'mission')} />)
    expect(out).not.toContain(PREVIEW_FEED_AUTO_TEXT)
  })
})
