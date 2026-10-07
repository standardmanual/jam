import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { OpsCardPreview, PREVIEW_IMAGE_PENDING_TEXT, PREVIEW_NOT_CARD_TEXT } from '../OpsCardPreview'

const html = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

function item(kind: string, original: Record<string, unknown>) {
  return { id: 'item-1', kind, original: original as never, edited: null }
}

describe('OpsCardPreview 종류별 미리보기', () => {
  it('배지는 서비스 배지 카드로 보이고 링크가 없다', () => {
    const out = html(
      <OpsCardPreview
        item={item('jam_badge', {
          starts_at: '2026-10-07T00:00:00.000Z',
          copy: { name: '비 맞은 러너', description: '비 오는 날 달렸어요' },
          resource: { rarity: 'rare', point_reward: 50, image_url: 'https://example.com/b.png' },
        })}
      />
    )
    expect(out).toContain('비 맞은 러너')
    expect(out).toContain('비 오는 날 달렸어요')
    expect(out).toContain('보상 50 포인트')
    expect(out).not.toContain('href=')
    expect(out).not.toContain(PREVIEW_NOT_CARD_TEXT)
  })

  it('컬렉션은 이름과 이야기를 보이고 링크가 없다', () => {
    const out = html(
      <OpsCardPreview
        item={item('collection_launch', { copy: { name: '비 컬렉션', story_text: '빗길 이야기' }, resource: { image_url: 'https://example.com/c.png' } })}
      />
    )
    expect(out).toContain('비 컬렉션')
    expect(out).toContain('빗길 이야기')
    expect(out).not.toContain('href=')
  })

  it('미션은 제목·설명·보상·조건을 보이고 값이 없으면 보상은 「없음」이다', () => {
    const out = html(
      <OpsCardPreview item={item('mission', { copy: { title: '3일 연속 달리기', description: '꾸준히 달려요', condition_text: '3일 연속' }, resource: {} })} />
    )
    expect(out).toContain('3일 연속 달리기')
    expect(out).toContain('꾸준히 달려요')
    expect(out).toContain('조건: 3일 연속')
    expect(out).toContain('없음')
    expect(out).not.toContain('href=')
  })

  it('초안이 바로 반영되고 이미지가 비면 도착 항목은 승인 뒤 안내를 보인다', () => {
    const out = html(
      <OpsCardPreview item={{ ...item('mission', { copy: { title: '원래 제목' } }), status: 'arrived' }} draft={{ 'copy.title': '바뀐 제목' }} />
    )
    expect(out).toContain('바뀐 제목')
    expect(out).not.toContain('원래 제목')
    expect(out).toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })
})
