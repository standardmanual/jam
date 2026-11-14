/**
 * 미션 목록 카드 — ListCard 큰 이미지 카드 (티켓 20261114_1543)
 *
 * 열린 미션은 `/missions/{id}` 링크 카드, 잠긴 미션은 링크 없는 button(aria-disabled) 카드다.
 * 딤·흑백은 이미지에만 걸리고, 칩은 ListRowChip(NEW는 done 톤, 참가중은 --jam-red 면)이다.
 * «진행중» 칩은 없다 — 참가한 미션만 «참가중», 참가 안 한 진행 미션은 기간 칩만 보인다.
 * `ListCard`가 카드마다 `<style>`을 내보내므로 마크업을 읽기 전에 걷는다.
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/MissionsListClient.list-row.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const nav = vi.hoisted(() => ({ query: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/missions',
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionsListClient, { type MissionListItem } from './MissionsListClient'
import { d } from '@/lib/i18n'

const NOW = new Date('2026-11-08T12:00:00Z')

function item(overrides: Partial<MissionListItem> = {}): MissionListItem {
  return {
    id: 'm1',
    title: '주말 러닝',
    description: '10km를 달려요',
    image_url: 'https://example.com/m1.png',
    mission_type: 'distance',
    condition_json: { distance_km: 10 },
    condition_text: null,
    reward_points: 10,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    created_at: '2026-01-01T00:00:00Z',
    joined: false,
    done: false,
    completedAt: null,
    locked: false,
    requiredBadge: null,
    lockedRewardRarities: [],
    ...overrides,
  } as unknown as MissionListItem
}

const withoutStyle = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '')

/** 카드 하나의 마크업만 돌려준다. TopNav·탭의 링크·문구가 섞이지 않게 `ds-list-card`부터 자른다 */
function render(mission: MissionListItem, tab: 'ongoing' | 'ended' = 'ongoing') {
  nav.query = tab === 'ended' ? 'tab=ended' : ''
  const lists = tab === 'ended' ? { ongoing: [], ended: [mission] } : { ongoing: [mission], ended: [] }
  const html = withoutStyle(renderToStaticMarkup(<MissionsListClient {...lists} rewardBadgeNames={{}} />))
  return html.slice(html.indexOf('class="ds-list-card"'))
}

/** 칩 줄에 나온 칩 글자만 순서대로 뽑는다(칩은 display:inline-flex span) */
function chipTexts(html: string): string[] {
  return [...html.matchAll(/<span (?:class="[^"]*" )?style="display:inline-flex[^"]*">([\s\S]*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())
}

describe('미션 목록 — ListCard 큰 이미지 카드', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('열린 미션은 /missions/{id} 링크 카드이고 이미지는 장식(alt 빈 값, cover, 16:9)이다', () => {
    const html = render(item())

    expect(html).toContain('href="/missions/m1"')
    expect(html).not.toContain('aria-disabled')
    expect(html).toContain('alt=""')
    expect(html).toContain('object-fit:cover')
    expect(html).toContain('aspect-ratio:16 / 9')
  })

  it('미션명은 이미지 칸 왼쪽 아래에 --snow 20px 굵은 글자로 얹히고 어두운 막이 없다', () => {
    const html = render(item())
    const title = html.slice(html.lastIndexOf('<span', html.indexOf('>주말 러닝<')), html.indexOf('>주말 러닝<'))

    expect(title).toContain('left:0')
    expect(title).toContain('bottom:0')
    expect(title).toContain('color:var(--snow)')
    expect(title).toContain('font-size:var(--text-xl)')
    expect(title).toContain('font-weight:700')
    expect(html).not.toContain('gradient')
    expect(html).not.toContain('text-shadow')
    expect(html).not.toContain('MISSION')
  })

  it('잠긴 미션은 링크 없이 aria-disabled button이고 이미지만 딤+흑백, 가운데 자물쇠가 얹힌다', () => {
    const html = render(item({ locked: true, requiredBadge: { name: '주말 러너', rarity: 'rare' } }))

    expect(html).not.toContain('href=')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toMatch(/<button[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/<button[^>]*\sdisabled/)
    expect(html).toContain(d.missions.tagLocked)
    expect(html).toContain(d.missions.cardConditionLabel)
    expect(html).toContain('filter:grayscale(1)')
    expect(html).toContain('opacity:0.4')
    expect(html).toContain('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')
  })

  it('잠긴 미션에서 requiredBadge가 없으면 «조건» 줄에 범용 안내 문구가 남는다', () => {
    expect(render(item({ locked: true }))).toContain(d.missions.lockedBodyGeneric)
  })

  it('시작 전 미션은 이미지에만 딤(0.6)이 걸리고 «시작전» 칩만 있다(기간 칩 없음)', () => {
    const html = render(item({ starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z' }))

    expect(html).toContain('opacity:0.6')
    expect(html).toContain('href="/missions/m1"')
    expect(chipTexts(html)).toEqual([d.missions.tagUpcoming])
  })

  it('참가중 칩은 강조 레드 면(--jam-red + --foreground 글자)이고 완료 칩은 neutral이다', () => {
    const joined = render(item({ joined: true }))
    const chip = joined.slice(joined.lastIndexOf('<span', joined.indexOf(`>${d.missions.tagJoined}<`)), joined.indexOf(`>${d.missions.tagJoined}<`))
    expect(chip).toContain('background:var(--jam-red)')
    expect(chip).toContain('color:var(--foreground)')

    const done = render(item({ done: true }))
    const doneChip = done.slice(done.lastIndexOf('<span', done.indexOf(`>${d.missions.tagDone}<`)), done.indexOf(`>${d.missions.tagDone}<`))
    expect(doneChip).toContain('background:var(--default-soft)')
  })

  it('«진행중» 칩이 없다 — 참가한 미션은 «참가중»+기간, 참가 안 한 진행 미션은 기간 칩만', () => {
    const ends = '2026-11-10T12:00:00Z'
    const notJoined = render(item({ ends_at: ends }))
    expect(notJoined).not.toContain('진행중')
    expect(notJoined).not.toContain(d.missions.tagJoined)
    expect(chipTexts(notJoined)).toEqual(['2일 0시간 남음'])
    expect(chipTexts(render(item()))).toEqual([d.missions.tagPermanent])

    expect(chipTexts(render(item({ joined: true, ends_at: ends })))).toEqual([d.missions.tagJoined, '2일 0시간 남음'])
  })

  it('종료 탭: 참가한 미션은 «종료», 참가 안 한 미션도 «종료» 칩 하나만 보인다', () => {
    expect(chipTexts(render(item({ joined: true }), 'ended'))).toEqual([d.missions.tagJoinedEnded])
    expect(chipTexts(render(item(), 'ended'))).toEqual([d.missions.tagEnded])
  })

  it('완료 미션은 «완료»+완료일, 잠긴 미션은 «잠김»+기간 칩이다', () => {
    const done = chipTexts(render(item({ done: true, completedAt: '2026-11-01T00:00:00Z' })))
    expect(done[0]).toBe(d.missions.tagDone)
    expect(done[1]).toContain('2026년 11월')

    expect(chipTexts(render(item({ locked: true })))).toEqual([d.missions.tagLocked, d.missions.tagPermanent])
  })

  it('NEW는 칩 줄 맨 앞이고 칩은 3개를 넘지 않는다', () => {
    const chips = chipTexts(render(item({ joined: true, ends_at: '2026-11-10T12:00:00Z', created_at: '2026-11-08T00:00:00Z' })))

    expect(chips).toEqual([d.missions.tagNew, d.missions.tagJoined, '2일 0시간 남음'])
    expect(chips.length).toBeLessThanOrEqual(3)
  })

  it('포인트는 칩 줄 오른쪽 값 칸의 PointText이고 보상이 없으면 값 칸에 «없음»이다', () => {
    const html = render(item({ reward_points: 20 }))
    expect(html).toMatch(/text-point-text[^>]*>20 포인트<\/span>/)
    expect(html).toContain('margin-left:auto')
    expect(html).not.toContain(d.missions.rewardNone)

    const none = render(item({ reward_points: null }))
    expect(none).toContain(`color:var(--muted)">${d.missions.rewardNone}<`)
  })

  it('카드 사이 구분선(border-bottom)이 없다', () => {
    expect(render(item())).not.toContain('border-bottom')
  })

  it('이미지가 없으면 img 없이 자리표시 면 위에 제목만 나온다', () => {
    const html = render(item({ image_url: null }))

    expect(html).not.toContain('<img')
    expect(html).toContain('background:var(--background-secondary)')
    expect(html).toContain('>주말 러닝<')
  })
})
