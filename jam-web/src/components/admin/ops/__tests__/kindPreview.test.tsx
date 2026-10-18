import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { MIX_TRIAL_AFTER_TEXT, MIX_TRIAL_BEFORE_TEXT, MIX_TRIAL_HREF, OpsMixTrialNotice } from '../OpsMixTrialNotice'
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

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const NAMES = {
  badges: { [B1]: { id: B1, name: '비 맞은 러너', imageUrl: null, rarity: 'rare' as const } },
  pois: { 'p-1': '한강공원' },
  collections: {},
  categories: {},
}

describe('OpsCardPreview 레시피·드랍 (티켓 20261007_1401)', () => {
  const recipe = item('recipe', {
    starts_at: '2026-10-10T00:00:00.000Z',
    copy: { name: '비 오는 날 레시피' },
    resource: { slots: [{ badge_type: 'item', allowed_badge_ids: [B1, B2] }, { badge_type: 'checkin', allowed_badge_ids: [B2] }], reward_points: 30, reward_badge_ids: [B1] },
  })

  it('레시피는 이름·슬롯 수와 종류·후보 개수·보상 배지 이름·포인트·같은 묶음의 배지를 보이고 링크가 없다', () => {
    const out = html(<OpsCardPreview item={recipe} previewNames={NAMES} bundleItems={[]} />)
    expect(out).toContain('비 오는 날 레시피')
    expect(out).toContain('아이템 · 후보 2개')
    expect(out).toContain('체크인 · 후보 1개')
    expect(out).toContain('비 맞은 러너')
    expect(out).toContain('(이름을 읽지 못함)')
    expect(out).toContain('30')
    expect(out).not.toContain('href=')
    expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('같은 묶음의 jam_badge가 이 레시피를 가리키면 「이 묶음의 배지」로 보인다', () => {
    const out = html(
      <OpsCardPreview
        item={{ ...recipe, itemKey: 'recipe-1' }}
        previewNames={NAMES}
        bundleItems={[{ kind: 'jam_badge', itemKey: 'b-1', original: { links: ['recipe-1'], copy: { name: '첫 성공 배지' } } as never, edited: null }]}
      />
    )
    expect(out).toContain('이 묶음의 배지: 첫 성공 배지')
  })

  it('이름 맵이 없으면 모두 폴백 문구이고 죽지 않는다', () => {
    const out = html(<OpsCardPreview item={recipe} />)
    expect(out).toContain('(이름을 읽지 못함)')
    expect(out).not.toContain('비 맞은 러너')
  })

  it('드랍은 제목·공개 시각·장소·놓을 것을 보이고 이미지 안내는 없다', () => {
    const out = html(
      <OpsCardPreview
        item={item('drop_schedule', {
          starts_at: '2026-10-10T00:00:00.000Z',
          copy: { title: '한강 드랍' },
          resource: { poi_ids: ['p-1', 'p-9'], per_poi_count: 3, badge_ids: [B1] },
        })}
        previewNames={NAMES}
      />
    )
    expect(out).toContain('한강 드랍')
    expect(out).toContain('공개 2026.10.10 09:00')
    expect(out).toContain('장소: 한강공원, (이름을 읽지 못함) × 장소당 3개')
    expect(out).toContain('놓을 것: 비 맞은 러너')
    expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })
})

describe('OpsMixTrialNotice', () => {
  const notice = (kind: string | null, status: string) => html(<OpsMixTrialNotice item={{ kind, status }} />)

  it('예약 전(검토중·승인됨)은 예약 안내만이고 링크가 없다', () => {
    for (const status of ['reviewing', 'approved']) {
      const out = notice('recipe', status)
      expect(out).toContain(MIX_TRIAL_BEFORE_TEXT)
      expect(out).not.toContain('href=')
    }
  })

  it('예약 이후(준비중·예약됨)는 /combine 링크와 공개 전 시험 안내다', () => {
    for (const status of ['preparing', 'scheduled']) {
      const out = notice('recipe', status)
      expect(out).toContain(MIX_TRIAL_AFTER_TEXT)
      expect(out).toContain(`href="${MIX_TRIAL_HREF}"`)
      expect(out).not.toContain(MIX_TRIAL_BEFORE_TEXT)
    }
  })

  it('다른 종류와 그 밖의 상태에는 아무것도 그리지 않는다', () => {
    expect(notice('mission', 'reviewing')).toBe('')
    for (const status of ['arrived', 'live', 'ended', 'rejected', 'cancelled', 'failed']) expect(notice('recipe', status)).toBe('')
  })
})
