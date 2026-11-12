/**
 * 미션 상세 달성 조건 카드 표시 분기 (티켓 20260927_0026, 20261104_2148).
 *
 * - 우선순위: 지표 라벨 불릿(`conditionBullets`) > `condition_text` > 목표 유형별 문구.
 * - 불릿이 있으면 그 줄들만 그리고 `condition_text`·기존 「미션 완료 1 달성」 줄은 그리지 않는다.
 * - 값이 null·빈 문자열·공백이면 기존 표시(목표 유형별 문구)가 그대로 나온다.
 * - 활동 종류 줄은 세 경로 모두에서 나온다. 불릿이 있으면 불릿 앞, 폴백이면 문장 뒤(티켓 20261104_2321, 채원 판정). 그리고, 「참가한 뒤 조건을 달성하면…」 보조 문구 줄은 어느 경로에도 없다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다
 * (`safeImageCallSites.test.tsx`와 같은 방식).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MissionRow } from '@/types/database'

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  /** 렌더된 Button의 onClick을 글자로 찾아 누르기 위한 기록 (서버 렌더라 실제 클릭이 없다) */
  clicks: new Map<string, () => void>(),
}))

vi.mock('@/components/ui/Button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/Button')>()
  const Real = actual.default
  return {
    ...actual,
    default: (props: React.ComponentProps<typeof Real>) => {
      if (typeof props.children === 'string' && props.onClick) {
        nav.clicks.set(props.children, props.onClick as () => void)
      }
      return <Real {...props} />
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import MissionDetailClient from './MissionDetailClient'
import { d } from '@/lib/i18n'

const CONDITION_TEXT = '4주 안에 10km 이상을 5:30/km보다 빠르게, 3번 달리기'
const HINT = '참가한 뒤 조건을 달성하면 미션이 자동으로 끝나요'  // 삭제된 문구 — 어디에도 나오지 않아야 한다

function render(
  conditionText: string | null | undefined,
  state: {
    participating?: boolean
    completed?: boolean
    locked?: boolean
    missionType?: string
    statusDisplayType?: 'ranking' | 'achievement'
    endsAt?: string | null
    progressValue?: number
    conditionJson?: Record<string, unknown>
    conditionBullets?: string[] | null
  } = {},
) {
  // 화면이 읽는 필드만 채운 최소 픽스처
  const mission = {
    id: 'm1',
    title: '페이스의 증명',
    description: '4주 동안 달린 당신의 속도를 증명하세요',
    mission_type: state.missionType ?? 'engine_condition',
    status_display_type: state.statusDisplayType ?? 'ranking',
    condition_json: state.conditionJson ?? { activity_type: 'running', single_distance_km: 10 },
    condition_text: conditionText,
    reward_points: null,
    reward_badge_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: state.endsAt ?? null,
    image_url: null,
  } as unknown as MissionRow
  return renderToStaticMarkup(
    <MissionDetailClient
      mission={mission}
      isParticipating={state.participating ?? false}
      isCompleted={state.completed ?? false}
      progressValue={state.progressValue ?? 0}
      rewardBadges={[]}
      conditionBullets={state.conditionBullets}
      locked={state.locked ?? false}
    />
  )
}

describe('MissionDetailClient 달성 조건 카드', () => {
  it('condition_text가 있으면 첫 줄에 그 문장을 쓰고 「미션 완료 1 달성」은 그리지 않는다', () => {
    const html = render(CONDITION_TEXT)
    expect(html).toContain(CONDITION_TEXT)
    expect(html).not.toContain('미션 완료 1 달성')
  })

  it('조건 문장 다음에 활동 종류 줄이 나오고 보조 문구 줄은 없다', () => {
    const html = render(CONDITION_TEXT)
    const a = html.indexOf(CONDITION_TEXT)
    const b = html.indexOf('달리기 활동')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(html).not.toContain(HINT)
  })

  it('condition_text가 null이면 기존 표시(미션 완료 1 달성)가 그대로 나온다', () => {
    const html = render(null)
    expect(html).toContain('미션 완료 1 달성')
    expect(html).toContain('달리기 활동')
    expect(html).not.toContain(HINT)
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

/** 지표 라벨 불릿 (티켓 20261104_2148) */
describe('MissionDetailClient 달성 조건 카드: 지표 라벨 불릿', () => {
  const BULLETS = ['아이템 배지 드랍 1회', '아이템 배지 픽업 1회']

  it('불릿이 있으면 불릿 줄만 그리고 condition_text·기존 줄·보조 문구는 그리지 않는다', () => {
    const html = render(CONDITION_TEXT, { conditionBullets: BULLETS })
    for (const b of BULLETS) expect(html).toContain(b)
    expect(html.indexOf(BULLETS[0])).toBeLessThan(html.indexOf(BULLETS[1]))
    expect(html).not.toContain(CONDITION_TEXT)
    expect(html).not.toContain('미션 완료 1 달성')
    expect(html).not.toContain(HINT)
  })

  it('불릿 행은 어절 단위로 접히게 break-keep을 쓰고 줄마다 한 행이다', () => {
    const html = render(null, { conditionBullets: BULLETS })
    const first = html.indexOf(BULLETS[0])
    expect(html.slice(first - 40, first)).toContain('break-keep')
  })

  it('불릿이 있으면 활동 종류 줄이 불릿 앞에 온다', () => {
    const html = render(null, { conditionBullets: BULLETS })
    expect(html.indexOf('달리기 활동')).toBeGreaterThan(-1)
    expect(html.indexOf('달리기 활동')).toBeLessThan(html.indexOf(BULLETS[0]))
  })

  it('걷기 미션 화면은 걷기 활동 → 한 번의 거리 → 활동 횟수 순서다', () => {
    const html = render(null, {
      conditionBullets: ['한 번의 거리 0.5km', '활동 횟수 3회'],
      conditionJson: { repeat_count: 3, activity_type: 'walking', single_distance_km: 0.5 },
    })
    const a = html.indexOf('걷기 활동')
    const b = html.indexOf('한 번의 거리 0.5km')
    const c = html.indexOf('활동 횟수 3회')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('활동 종류가 없는 미션은 불릿만 그린다', () => {
    const html = render(null, { conditionBullets: ['활동 횟수 2회'], missionType: 'activity_count', conditionJson: { count: 2 } })
    expect(html).toContain('활동 횟수 2회')
    expect(html).not.toContain('활동 종류')
  })

  it('같은 문구 불릿 두 줄도 key 경고 없이 두 줄 모두 그려진다', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const html = render(null, { conditionBullets: ['활동 횟수 2회', '활동 횟수 2회'] })
      expect(html.split('활동 횟수 2회').length - 1).toBe(2)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('불릿이 없으면 활동 종류 줄은 기존처럼 문장 뒤에 온다', () => {
    const html = render(CONDITION_TEXT, { conditionBullets: null })
    expect(html.indexOf('달리기 활동')).toBeGreaterThan(html.indexOf(CONDITION_TEXT))
  })

  it('불릿이 null이면 condition_text로 폴백한다', () => {
    const html = render(CONDITION_TEXT, { conditionBullets: null })
    expect(html).toContain(CONDITION_TEXT)
    expect(html).not.toContain(HINT)
  })

  it('불릿이 null이고 condition_text도 없으면 「{라벨} {n}{단위} 달성」으로 폴백한다 (옛 유형 포함)', () => {
    const html = render(null, { conditionBullets: null, missionType: 'distance', conditionJson: { distance_km: 5 } })
    expect(html).toContain('5km 달성')
    expect(html).not.toContain(HINT)
  })

  it('불릿이 빈 배열이어도 카드가 비지 않고 폴백으로 그린다', () => {
    const html = render(null, { conditionBullets: [] })
    expect(html).toContain('미션 완료 1 달성')
  })

  it('d.missions에 보조 문구 상수가 남아 있지 않다', () => {
    expect(Object.keys(d.missions)).not.toContain('conditionAutoCompleteHint')
  })
})

/**
 * 「나의 진행 상황」 카드 (티켓 20260927_0119, 20261104_2147).
 * 연속 일수·활동 횟수는 프로그래스바·퍼센트 없이 숫자 서클과 단위만, 복합 조건은 달성·미달성 칩만(문장 없음),
 * 체크인·아이템 픽업은 기존 라벨 + 칩을 유지한다. 카드 구간만 잘라 본다(다른 자리의 「미션 완료」 문구와 섞이지 않게).
 */
function progressCard(html: string): string {
  const i = html.indexOf(d.missions.myProgressTitle)
  return i === -1 ? '' : html.slice(i)
}

const OLD_SENTENCES = ['아직 미션을 달성하지 못했어요', '미션을 달성했어요']

describe('MissionDetailClient 나의 진행 상황 카드', () => {
  it('복합 조건 + 참가 중 + 미완료: 문장 없이 「미달성」 칩만 나오고 「미션 완료」 라벨도 없다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true }))
    for (const sentence of OLD_SENTENCES) expect(card).not.toContain(sentence)
    expect(card).toContain('>미달성<')
    expect(card).not.toContain('미션 완료')
  })

  it('복합 조건 + 완료: 「달성」 칩만 나온다', () => {
    const card = progressCard(render(CONDITION_TEXT, { completed: true }))
    expect(card).toContain('>달성<')
    for (const sentence of OLD_SENTENCES) expect(card).not.toContain(sentence)
    expect(card).not.toContain('미션 완료')
  })

  // 티켓 20261019_1445 3-B: 달성은 완료 기록으로만 판정한다. 진행값이 1 이상이라는 이유만으로 달성으로 그리지 않는다.
  it('복합 조건 + 완료 기록이 없으면 진행값이 1 이상이어도 달성으로 그리지 않는다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, progressValue: 1 }))
    expect(card).toContain('>미달성<')
    expect(card).not.toContain('>달성<')
  })

  it('기간 동안 모은 잼 미션은 1잼만 모아도(진행값 1) 달성으로 그리지 않는다', () => {
    const card = progressCard(
      render(CONDITION_TEXT, { participating: true, progressValue: 1, conditionJson: { jam_period_earned: 500 } }),
    )
    expect(card).toContain('>미달성<')
    expect(card).not.toContain('>달성<')
  })

  it('기간 동안 모은 잼 미션도 완료 기록이 있으면 달성으로 그린다', () => {
    const card = progressCard(
      render(CONDITION_TEXT, { completed: true, progressValue: 500, conditionJson: { jam_period_earned: 500 } }),
    )
    expect(card).toContain('>달성<')
  })

  it('체크인 미션은 기존 라벨과 「미달성」 칩을 그대로 그린다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, missionType: 'checkin' }))
    expect(card).toContain(d.missions.goalCheckin)
    expect(card).toContain('미달성')
  })

  it('아이템 픽업 미션도 기존 라벨과 칩을 유지하고, 완료하면 「달성」 칩이 나온다', () => {
    const card = progressCard(render(CONDITION_TEXT, { completed: true, missionType: 'item_collect', progressValue: 1 }))
    expect(card).toContain(d.missions.goalItemCollect)
    expect(card).toContain('>달성<')
  })

  it('아이템 픽업 미션도 완료 기록이 없으면 진행값이 1이어도 「미달성」 칩이다', () => {
    const card = progressCard(render(CONDITION_TEXT, { participating: true, missionType: 'item_collect', progressValue: 1 }))
    expect(card).toContain('미달성')
    expect(card).not.toContain('>달성<')
  })

  it('참가 전에는 진행 상황 카드를 그리지 않는다', () => {
    expect(render(CONDITION_TEXT)).not.toContain(d.missions.myProgressTitle)
  })
})

/** 개수 서클: 연속 일수(일)와 활동 횟수(회) */
describe('MissionDetailClient 나의 진행 상황: 개수 서클', () => {
  const streak = (progressValue: number, extra: { completed?: boolean; days?: number } = {}) =>
    progressCard(
      render(CONDITION_TEXT, {
        participating: true,
        missionType: 'streak_days',
        progressValue,
        conditionJson: { streak_days: extra.days ?? 7 },
        completed: extra.completed,
      }),
    )
  const circleCount = (card: string) => (card.match(/rounded-full inline-flex|inline-flex items-center justify-center/g) ?? []).length

  it('연속 일수: 목표 개수만큼 서클이 모두 그려지고 단위 «일»이 마지막 서클 뒤에 붙는다', () => {
    const card = streak(3)
    for (let n = 1; n <= 7; n++) expect(card).toContain(`>${n}</span>`)
    expect(card).not.toContain('>8</span>')
    expect(card.indexOf('>7</span>')).toBeLessThan(card.indexOf('>일</span>'))
    // 마지막 서클과 단위는 한 묶음이라 줄이 넘쳐도 함께 내려간다
    expect(card).toMatch(/whitespace-nowrap[^>]*><span[^>]*>7<\/span><span[^>]*>일<\/span>/)
  })

  it('프로그래스바·퍼센트·«N일 중 N일» 문장이 없다', () => {
    const card = streak(3)
    expect(card).not.toContain('%')
    expect(card).not.toContain('progressbar')
    expect(card).not.toContain('7일 중 3일</span>')
  })

  it('끝낸 칸은 검정(--accent) 채움·흰 글자, 지금 칸은 link 테두리, 남은 칸은 보조 면이다', () => {
    const card = streak(3)
    expect((card.match(/background:var\(--accent\)/g) ?? []).length).toBe(3)
    expect((card.match(/border-color:var\(--link\)/g) ?? []).length).toBe(1)
    expect((card.match(/background:var\(--background-secondary\)/g) ?? []).length).toBe(3)
  })

  it('달성하면 전부 채워지고 지금 칸이 없다', () => {
    const card = streak(0, { completed: true })
    expect((card.match(/background:var\(--accent\)/g) ?? []).length).toBe(7)
    expect(card).not.toContain('border-color:var(--link)')
  })

  it('서클이 많아도(30일) 모두 그린다', () => {
    const card = streak(12, { days: 30 })
    expect(card).toContain('>30</span>')
    expect(card).toContain('>일</span>')
    expect(circleCount(card)).toBeGreaterThanOrEqual(30)
  })

  it('활동 횟수는 단위 «회»로 같은 서클을 그린다', () => {
    const card = progressCard(
      render(CONDITION_TEXT, { participating: true, missionType: 'activity_count', progressValue: 1, conditionJson: { count: 2 } }),
    )
    expect(card).toContain('>1</span>')
    expect(card).toContain('>2</span>')
    expect(card).toContain('>회</span>')
    expect(card).not.toContain('%')
  })

  it('스크린리더에는 한 문장으로 알리고 서클 숫자는 숨긴다', () => {
    expect(streak(3)).toContain('aria-label="7일 중 3일"')
    const done = streak(0, { completed: true })
    expect(done).toContain('aria-label="7일 중 7일"')
  })

  it('수치형(거리)은 기존 현재값·퍼센트·바 표시를 유지한다', () => {
    const card = progressCard(
      render(CONDITION_TEXT, { participating: true, missionType: 'distance', progressValue: 3.2, conditionJson: { distance_km: 10 } }),
    )
    expect(card).toContain('3.2km')
    expect(card).toContain('32%')
  })
})

describe('MissionDetailClient 랭킹 보기 버튼 (티켓 20261111_0850, 20261112_1626)', () => {
  const STATUS_PATH = '/missions/m1/status'

  /** 레이블이 label인 button 태그의 여는 태그 문자열 */
  function buttonTag(html: string, label: string): string {
    const end = html.indexOf(`>${label}</button>`)
    expect(end, `«${label}» 버튼이 없다`).toBeGreaterThan(-1)
    return html.slice(html.lastIndexOf('<button', end), end)
  }

  it('랭킹형 미션에 참가 중이면 «랭킹 보기» 회색 알약 버튼(폭 전체·52px)이 그려지고, a 안 button 중첩이 없다', () => {
    const html = render(CONDITION_TEXT, { participating: true, statusDisplayType: 'ranking' })
    const btn = buttonTag(html, '랭킹 보기')
    expect(btn).toContain('bg-btn-secondary')
    expect(btn).toContain('text-foreground')
    expect(btn).toContain('w-full')
    expect(btn).not.toContain('bg-background-inverse')
    // 링크로 감싸지 않는다 — a 안 button은 유효하지 않은 HTML이다
    expect(html).not.toContain(`href="${STATUS_PATH}"`)
    expect(html).not.toContain('미션 상황 보기')
  })

  it('버튼을 누르면 상황 화면으로 이동한다', () => {
    nav.push.mockClear()
    render(CONDITION_TEXT, { participating: true, statusDisplayType: 'ranking' })
    nav.clicks.get('랭킹 보기')!()
    expect(nav.push).toHaveBeenCalledWith(STATUS_PATH)
  })

  it('랭킹형이라도 완료한 미션에는 버튼이 남고, 참가 전에는 없다', () => {
    expect(render(CONDITION_TEXT, { completed: true, statusDisplayType: 'ranking' })).toContain('>랭킹 보기</button>')
    expect(render(CONDITION_TEXT, { participating: false, statusDisplayType: 'ranking' })).not.toContain('>랭킹 보기</button>')
  })

  it('달성형 미션에는 «달성 현황 보기» 회색 알약 버튼이 같은 곳으로 이어진다 (티켓 20261111_2049)', () => {
    nav.push.mockClear()
    const html = render(CONDITION_TEXT, { participating: true, statusDisplayType: 'achievement' })
    expect(buttonTag(html, '달성 현황 보기')).toContain('bg-btn-secondary')
    expect(html).not.toContain('>랭킹 보기</button>')
    nav.clicks.get('달성 현황 보기')!()
    expect(nav.push).toHaveBeenCalledWith(STATUS_PATH)
    expect(render(CONDITION_TEXT, { completed: true, statusDisplayType: 'achievement' })).toContain('>달성 현황 보기</button>')
    expect(render(CONDITION_TEXT, { participating: false, statusDisplayType: 'achievement' })).not.toContain('>달성 현황 보기</button>')
  })
})

describe('MissionDetailClient 상태 칩 — 끝난 미션 (티켓 20261111_2152)', () => {
  const PAST = '2026-01-02T00:00:00Z'
  const FUTURE = '2099-01-01T00:00:00Z'

  it('끝난 미션에 참가했던 경우 «참가중» 대신 «종료» 칩이 나온다', () => {
    const html = render(CONDITION_TEXT, { participating: true, endsAt: PAST })
    expect(html).toContain(`>${d.missions.tagJoinedEnded}</span>`)
    expect(html).not.toContain(`>${d.missions.tagJoined}</span>`)
  })

  it('진행 중인 미션에 참가 중이면 «참가중» 칩이 그대로다', () => {
    const html = render(CONDITION_TEXT, { participating: true, endsAt: FUTURE })
    expect(html).toContain(`>${d.missions.tagJoined}</span>`)
    expect(html).not.toContain(`>${d.missions.tagJoinedEnded}</span>`)
  })

  it('완료한 미션은 기간이 남았어도 «종료» 칩이고 «완료» 칩과 맨 아래 «종료» 버튼은 없다', () => {
    for (const endsAt of [PAST, FUTURE]) {
      const html = render(CONDITION_TEXT, { participating: true, completed: true, endsAt })
      expect(html).toContain(`>${d.missions.tagJoinedEnded}</span>`)
      expect(html).not.toContain(`>${d.missions.tagDone}</span>`)
      expect(html).not.toContain('cursor-default') // 예전 비활성 «종료» 버튼의 클래스
      expect(html).not.toContain(d.missions.joinButton)
    }
  })
})

describe('MissionDetailClient 나의 진행 상황 카드 면 (티켓 20261111_2201)', () => {
  const card = (html: string) => {
    const i = html.indexOf(d.missions.myProgressTitle)
    return html.slice(html.lastIndexOf('<div', i), html.indexOf('</div>', i) + 200)
  }

  it('수치형·개수형·달성형 모두 카드 면이 강조 레드(--jam-red)다', () => {
    for (const opts of [
      { participating: true, missionType: 'distance', progressValue: 3.2, conditionJson: { distance_km: 10 } },
      { participating: true, missionType: 'streak_days', progressValue: 3, conditionJson: { streak_days: 7 } },
      { participating: true, missionType: 'checkin', progressValue: 0, conditionJson: { poi_ids: ['a'] } },
    ]) {
      expect(card(render(CONDITION_TEXT, opts))).toContain('background:var(--jam-red)')
    }
  })

  it('수치형은 현재 값이 흰색(--snow), 막대 채움이 흰색이다', () => {
    const html = render(CONDITION_TEXT, { participating: true, missionType: 'distance', progressValue: 3.2, conditionJson: { distance_km: 10 } })
    expect(html).toContain('color:var(--snow)')
    expect(html).toContain('background:var(--snow)')
  })
})
