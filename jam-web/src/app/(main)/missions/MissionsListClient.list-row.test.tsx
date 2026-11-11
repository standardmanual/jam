/**
 * 미션 목록 행 — ListRow 미디어 행 (티켓 20261108_1020, 4단계 4-2배치)
 *
 * 열린 미션은 `/missions/{id}` 링크 행, 잠긴 미션은 링크 없는 button(aria-disabled) 행이다.
 * 딤·흑백은 lead 안 이미지 래퍼에만 걸리고, 칩은 ListRowChip(NEW는 done 톤, 참가중은 --jam-red 면)이다.
 * `ListRow`가 행마다 `<style>`을 내보내므로 마크업을 읽기 전에 걷는다(4-1 시험과 같은 방식).
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/MissionsListClient.list-row.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/missions',
  useSearchParams: () => new URLSearchParams(),
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

/** 행 하나의 마크업만 돌려준다. TopNav·탭의 링크·문구가 섞이지 않게 `ds-list-row`부터 자른다 */
function render(mission: MissionListItem) {
  const html = withoutStyle(renderToStaticMarkup(<MissionsListClient ongoing={[mission]} ended={[]} rewardBadgeNames={{}} />))
  return html.slice(html.indexOf('class="ds-list-row"'))
}

describe('미션 목록 — ListRow 미디어 행', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('열린 미션은 /missions/{id} 링크 행이고 그림은 장식(alt 빈 값, 48, contain)이다', () => {
    const html = render(item())

    expect(html).toContain('href="/missions/m1"')
    expect(html).not.toContain('aria-disabled')
    expect(html).toContain('alt=""')
    expect(html).toContain('width="48"')
    expect(html).toContain('object-fit:contain')
  })

  it('잠긴 미션은 링크 없이 aria-disabled button이고 자물쇠 오버레이가 얹힌다', () => {
    const html = render(item({ locked: true, requiredBadge: { name: '주말 러너', rarity: 'rare' } }))

    expect(html).not.toContain('href=')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toMatch(/<button[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/<button[^>]*\sdisabled/)
    expect(html).toContain(d.missions.tagLocked)
    expect(html).toContain(d.missions.cardConditionLabel)
    expect(html).toContain('grayscale(1)')
    expect(html).toContain('position:absolute;inset:0')
  })

  it('잠긴 미션에서 requiredBadge가 없으면 «조건» 줄에 범용 안내 문구가 남는다', () => {
    expect(render(item({ locked: true }))).toContain(d.missions.lockedBodyGeneric)
  })

  it('시작 전 미션은 이미지 래퍼에만 딤(0.6)이 걸리고 링크 행이다', () => {
    const html = render(item({ starts_at: '2026-12-01T00:00:00Z' }))

    expect(html).toContain('opacity:0.6')
    expect(html).toContain('href="/missions/m1"')
    expect(html).toContain(d.missions.tagUpcoming)
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

  it('행마다 separator 하단선이 있다', () => {
    expect(render(item())).toContain('border-bottom:1px solid var(--separator)')
  })

  it('이미지가 없으면 24px --surface 폴백 칸이 나오고 img는 없다', () => {
    const html = render(item({ image_url: null }))

    expect(html).not.toContain('<img')
    expect(html).toContain('width:24px;height:24px;background:var(--surface)')
  })
})
