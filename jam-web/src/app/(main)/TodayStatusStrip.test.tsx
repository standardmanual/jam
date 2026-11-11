/**
 * 투데이 홈 현황 줄 칩 테스트 (티켓 20261001_1204, 상위 20260930_1453 b0).
 *
 * `CellLabel`이 인라인 Tailwind 칩에서 MODULAR `LabelChip`으로 바뀌었다. 칩 모양(계산 스타일)은
 * `src/components/LabelChip.test.tsx`가 고정하고, 여기서는 현황 줄의 좌·우 셀이 칩을 같은
 * 컴포넌트로 그리고 flex-col 셀에서 칩이 카드 폭으로 늘어나지 않게 하는 호출부 클래스
 * `self-start`만 붙는지 본다. 저장소에 jsdom이 없어 `renderToStaticMarkup`으로 고정한다
 * (`OnboardingQuestCard.test.tsx`와 같은 방식).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TodayStatusStrip from './TodayStatusStrip'
import { d } from '@/lib/i18n'

function chipPattern(label: string) {
  return new RegExp(`<span class="self-start" style="[^"]*padding:var\\(--chip-padding\\)[^"]*">${label}</span>`, 'g')
}

describe('TodayStatusStrip — 칩은 MODULAR LabelChip(티켓 20261001_1204)', () => {
  it('좌(진행상황)·우(팔로잉) 셀 모두 self-start LabelChip으로 칩을 그린다', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'strava_not_connected', href: '/strava' }}
        right={{ kind: 'friend_activity', count: 2, href: '/feed', singleFriendName: null }}
      />
    )
    expect(html.match(chipPattern(d.todayStatus.myProgressLabel))).toHaveLength(1)
    expect(html.match(chipPattern(d.todayStatus.friendActivityLabel))).toHaveLength(1)
    // 교체 전 인라인 Tailwind 칩 클래스가 남아 있지 않다
    expect(html).not.toContain('px-2.5 py-1.5')
  })

  it('셀의 눌림은 jam-press 하나이고 예전 눌림 문자열은 남지 않는다 (티켓 20261001_1458)', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'strava_not_connected', href: '/strava' }}
        right={{ kind: 'friend_activity', count: 2, href: '/feed', singleFriendName: null }}
      />
    )
    expect(html).toContain('jam-press')
    expect(html).not.toContain('active:scale-[0.98]')
    expect(html).not.toContain('duration-100')
  })

  it('셀은 기본 톤 카드 면이고 테두리가 없다 — 어두운 반전 면·옅은 흰 글자가 없다 (티켓 20261015_2133)', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'suggestion', text: '드랍 아이템 찾아보기', category: 'drops', href: '/drops' }}
        right={{ kind: 'no_following', href: '/search' }}
      />
    )
    expect(html.match(/background:var\(--card-bg\)/g)).toHaveLength(2)
    expect(html).not.toContain('border:1px solid')
    expect(html).not.toContain('--background-inverse')
    expect(html).not.toContain('text-snow')
  })

  it('라벨은 «진행상황»·«팔로잉»이다 (티켓 20261109_1429)', () => {
    expect(d.todayStatus.myProgressLabel).toBe('진행상황')
    expect(d.todayStatus.friendActivityLabel).toBe('팔로잉')
  })

  it('suggestion·no_following 카드에는 아이콘이 없고 문구만 보인다 (티켓 20261109_1429)', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'suggestion', text: '드랍 아이템 찾아보기', category: 'drops', href: '/drops' }}
        right={{ kind: 'no_following', href: '/search' }}
      />
    )
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('opacity-50')
    expect(html).toContain('드랍 아이템 찾아보기')
    expect(html).toContain(d.todayStatus.noFollowing)
  })

  it('progress 카드: 이름 줄에는 n/n이 없고 진행 바 오른쪽에 text-xs로 놓인다 — 거리는 소수 1자리, 컬렉션은 정수 (티켓 20261109_1429)', () => {
    const distance = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'progress', name: '10km 달리기', current: 6.4, total: 10, missionType: 'distance', href: '/missions/1' }}
        right={{ kind: 'none' }}
      />
    )
    const namePara = distance.match(/<p class="text-base font-bold[^"]*">([\s\S]*?)<\/p>/)
    expect(namePara?.[1]).toContain('10km 달리기')
    expect(namePara?.[1]).not.toContain('/')
    expect(distance).toContain('<span class="text-xs font-bold whitespace-nowrap tabular-nums">6.4/10.0</span>')

    const collection = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'progress', name: '서울 컬렉션', current: 3, total: 8, missionType: null, href: '/collections/1' }}
        right={{ kind: 'none' }}
      />
    )
    expect(collection).toContain('<span class="text-xs font-bold whitespace-nowrap tabular-nums">3/8</span>')
  })

  it('오른쪽 셀이 없으면(none) 왼쪽 칩만 그린다', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'suggestion', text: '드랍 아이템 찾아보기', category: 'drops', href: '/drops' }}
        right={{ kind: 'none' }}
      />
    )
    expect(html.match(chipPattern(d.todayStatus.myProgressLabel))).toHaveLength(1)
    expect(html).not.toContain(d.todayStatus.friendActivityLabel)
  })
})
