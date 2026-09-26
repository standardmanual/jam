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

function render(
  conditionText: string | null | undefined,
  state: { participating?: boolean; completed?: boolean; locked?: boolean; missionType?: string; progressValue?: number } = {},
) {
  // 화면이 읽는 필드만 채운 최소 픽스처
  const mission = {
    id: 'm1',
    title: '페이스의 증명',
    description: '4주 동안 달린 당신의 속도를 증명하세요',
    mission_type: state.missionType ?? 'engine_condition',
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
      progressValue={state.progressValue ?? 0}
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

/**
 * 「나의 진행 상황」 카드 (티켓 20260927_0119).
 * 복합 조건 미션은 상태를 한 문장으로만 알리고, 체크인·아이템 픽업 미션은 기존 라벨 + 칩을 유지한다.
 * 카드 구간만 잘라 본다(다른 자리의 「미션 완료」 문구와 섞이지 않게).
 */
function progressCard(html: string): string {
  const i = html.indexOf(d.missions.myProgressTitle)
  return i === -1 ? '' : html.slice(i)
}

describe('MissionDetailClient 나의 진행 상황 카드', () => {
  it('복합 조건 + 참가 중 + 미완료: 한 문장만 나오고 「미션 완료」 라벨·「미달성」 칩은 없다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true }))
    expect(card).toContain('아직 미션을 달성하지 못했어요')
    expect(card).not.toContain('미션 완료')
    expect(card).not.toContain('미달성')
  })

  it('복합 조건 + 완료: 「미션을 달성했어요」가 나오고 미완료 문장은 없다', () => {
    const card = progressCard(render(CONDITION_TEXT, { completed: true }))
    expect(card).toContain('미션을 달성했어요')
    expect(card).not.toContain('아직 미션을 달성하지 못했어요')
    expect(card).not.toContain('미션 완료')
  })

  it('복합 조건 + 진행값이 1 이상이면 완료 문장이 나온다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, progressValue: 1 }))
    expect(card).toContain('미션을 달성했어요')
  })

  it('체크인 미션은 기존 라벨과 「미달성」 칩을 그대로 그린다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, missionType: 'checkin' }))
    expect(card).toContain(d.missions.goalCheckin)
    expect(card).toContain('미달성')
    expect(card).not.toContain('아직 미션을 달성하지 못했어요')
  })

  it('아이템 픽업 미션도 기존 라벨과 칩을 유지하고, 달성하면 「달성」 칩이 나온다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, missionType: 'item_collect', progressValue: 1 }))
    expect(card).toContain(d.missions.goalItemCollect)
    expect(card).toContain('>달성<')
    expect(card).not.toContain('미션을 달성했어요')
  })

  it('참가 전에는 진행 상황 카드를 그리지 않는다', () => {
    expect(render(CONDITION_TEXT)).not.toContain(d.missions.myProgressTitle)
  })
})
