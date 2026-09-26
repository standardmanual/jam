/**
 * 미션 상세 달성 조건 카드 표시 분기 (티켓 20260927_0026).
 *
 * - `condition_text`가 있으면 첫 줄이 그 문장이고, 기존 「미션 완료 1 달성」 줄은 그리지 않는다.
 * - 값이 null·빈 문자열·공백이면 기존 표시(목표 유형별 문구)가 그대로 나온다.
 * - 활동 종류 줄과 회색 보조 문구는 두 경우 모두 나온다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다
 * (`safeImageCallSites.test.tsx`와 같은 방식).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MissionRow } from '@/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionDetailClient from './MissionDetailClient'
import { d } from '@/lib/i18n'

const CONDITION_TEXT = '4주 안에 10km 이상을 5:30/km보다 빠르게, 3번 달리기'
const HINT = '참가한 뒤 조건을 달성하면 미션이 자동으로 끝나요'

function render(conditionText: string | null | undefined, state: { participating?: boolean; completed?: boolean; locked?: boolean } = {}) {
  // 화면이 읽는 필드만 채운 최소 픽스처
  const mission = {
    id: 'm1',
    title: '페이스의 증명',
    description: '4주 동안 달린 당신의 속도를 증명하세요',
    mission_type: 'engine_condition',
    condition_json: { activity_type: 'running', single_distance_km: 10 },
    condition_text: conditionText,
    reward_points: null,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: null,
    image_url: null,
  } as unknown as MissionRow
  return renderToStaticMarkup(
    <MissionDetailClient
      mission={mission}
      isParticipating={state.participating ?? false}
      isCompleted={state.completed ?? false}
      progressValue={0}
      rewardBadges={[]}
      locked={state.locked ?? false}
    />
  )
}

describe('MissionDetailClient 달성 조건 카드', () => {
  it('conditionAutoCompleteHint가 확정 문구다', () => {
    expect(d.missions.conditionAutoCompleteHint).toBe(HINT)
  })

  it('condition_text가 있으면 첫 줄에 그 문장을 쓰고 「미션 완료 1 달성」은 그리지 않는다', () => {
    const html = render(CONDITION_TEXT)
    expect(html).toContain(CONDITION_TEXT)
    expect(html).not.toContain('미션 완료 1 달성')
  })

  it('조건 문장 > 활동 종류 > 보조 문구 순서로 세 줄이 나온다', () => {
    const html = render(CONDITION_TEXT)
    const a = html.indexOf(CONDITION_TEXT)
    const b = html.indexOf('달리기 활동')
    const c = html.indexOf(HINT)
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('condition_text가 null이면 기존 표시(미션 완료 1 달성)가 그대로 나온다', () => {
    const html = render(null)
    expect(html).toContain('미션 완료 1 달성')
    expect(html).toContain('달리기 활동')
    expect(html).toContain(HINT)
  })

  it('condition_text가 undefined(옛 데이터)이거나 빈 문자열·공백이어도 기존 표시가 나온다', () => {
    for (const v of [undefined, '', '   ']) {
      const html = render(v)
      expect(html).toContain('미션 완료 1 달성')
    }
  })

  it('참가 전·참가 중·완료·잠김 모든 상태에서 같은 조건 문장이 나온다', () => {
    for (const state of [{}, { participating: true }, { completed: true }, { locked: true }]) {
      expect(render(CONDITION_TEXT, state)).toContain(CONDITION_TEXT)
    }
  })

  it('불릿은 장식이라 aria-hidden이다', () => {
    const html = render(CONDITION_TEXT)
    expect(html).toContain('aria-hidden="true"')
  })
})
