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
  return new RegExp(`<span class="self-start" style="[^"]*padding:6px 10px[^"]*">${label}</span>`, 'g')
}

describe('TodayStatusStrip — 칩은 MODULAR LabelChip(티켓 20261001_1204)', () => {
  it('좌(내 진행도)·우(팔로잉 소식) 셀 모두 self-start LabelChip으로 칩을 그린다', () => {
    const html = renderToStaticMarkup(
      <TodayStatusStrip
        left={{ kind: 'strava_disconnected', href: '/strava' }}
        right={{ kind: 'friend_activity', count: 2, href: '/feed', singleFriendName: null }}
      />
    )
    expect(html.match(chipPattern(d.todayStatus.myProgressLabel))).toHaveLength(1)
    expect(html.match(chipPattern(d.todayStatus.friendActivityLabel))).toHaveLength(1)
    // 교체 전 인라인 Tailwind 칩 클래스가 남아 있지 않다
    expect(html).not.toContain('px-2.5 py-1.5')
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
