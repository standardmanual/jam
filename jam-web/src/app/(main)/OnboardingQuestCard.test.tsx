/**
 * «JAM! 시작하기» 홈 카드 — 구성·상태·문구·접근성 테스트
 * (티켓 20261021_1248 2회, 채원 사전 판정 2026-10-21. 앞선 티켓: 20260928_1537 CTA 버튼화, 20260928_0136 경로 변경,
 *  20260927_2131 T8 건너뛰기, 20260927_2132 T9 GA4 트래커, 20261001_1204 LabelChip, 20260928_1752 펄스)
 *
 * 카드는 `Card`(비클릭)에 CTA 버튼만 액션이다. 카드 전체를 `<a>`로 감싸면 `<button>`이 `<a>` 안에 중첩돼 접근성 위반이 되므로
 * 어느 상태에도 `<a `가 없어야 한다(채원 사전 판정, MissionCard와 같은 패턴).
 *
 * 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 고정한다
 * (`MissionDetailClient.test.tsx`와 같은 방식) — onClick 핸들러는 정적 마크업에 나타나지 않으므로 실제 클릭은 시뮬레이션할 수 없다.
 * 열기 신호(`capsule-sheet-signal`)와 위젯의 구독은 `capsule-sheet-signal.test.ts`가, 단계별 계산은 `real-view.test.ts`가 고정한다.
 * 이 테스트는 (1) 연출 중 카드의 구성(연출 구역 + 실제 3단계 체크 목록) (2) 연출이 끝났거나 건너뛴 카드의 구성(실제 구역이 위)
 * (3) 상태별 설명·안내·버튼 글자 (4) 버튼은 늘 하나이고 펄스는 연출 CTA에만 있는지 (5) 접근성 글자와 줄바꿈 클래스 (6) «퀘스트» 같은 금지어가 없는지를 고정한다.
 *
 * 카드가 클라이언트 컴포넌트 `OnboardingQuestSkipSheet`·`OnboardingSyncButton`·`SyncButton`을 자식으로 두므로
 * `OnboardingSyncButton.test.tsx`와 같은 방식으로 `next/navigation`·Toast를 목으로 대체한다. `QuestStartTracker`는 `useEffect`가
 * 정적 렌더에서 실행되지 않아 마운트 여부를 직접 관찰할 수 없으므로, 감지용 마커 문자열을 돌려주는 목으로 바꿔 "트리에 포함됐는가"만 검증한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/OnboardingQuestCard.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const QUEST_START_TRACKER_MARKER = 'QUEST_START_TRACKER_MARKER'
vi.mock('./QuestStartTracker', () => ({
  default: () => QUEST_START_TRACKER_MARKER,
}))

import OnboardingQuestCard from './OnboardingQuestCard'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import { resolveRealStepsView, type RealStepsView } from '@/lib/onboarding-quest/real-view'
import type { RealStepsProgress } from '@/lib/onboarding-quest/real-steps'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import type { LockedOpenTarget } from '@/lib/onboarding-quest/locked-target'
import { d, t } from '@/lib/i18n'

const capsule = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 5,
  filled: 0,
  remaining: 5,
  balance: 10,
  openable: false,
  notOpenableReason: 'not_full',
  freeSlots: 5,
  neededSlots: 2,
  ...over,
})

interface ViewOptions {
  steps?: Partial<RealStepsProgress>
  stravaConnected?: boolean
  capsule?: CapsuleStatus | null
  lockedTarget?: LockedOpenTarget | null
}

function realView(opts: ViewOptions = {}): RealStepsView {
  return resolveRealStepsView({
    steps: { sync: false, capsuleOpened: false, lockedOpened: false, ...opts.steps },
    stravaConnected: opts.stravaConnected ?? true,
    capsule: opts.capsule ?? null,
    lockedTarget: opts.lockedTarget ?? null,
  })
}

type InProgressState = Extract<NonNullable<OnboardingQuestCardState>, { kind: 'in_progress' }>
type DemoStep = InProgressState['nextStep']

function demo(done: number, nextStep: DemoStep, real: RealStepsView | null = realView(), preview?: true): OnboardingQuestCardState {
  return { kind: 'in_progress', done, total: 7, nextStep, real, ...(preview ? { preview } : {}) }
}

function realOnly(opts: ViewOptions = {}): OnboardingQuestCardState {
  return { kind: 'real', real: realView(opts) }
}

function render(state: OnboardingQuestCardState, username: string | null = null) {
  return renderToStaticMarkup(<OnboardingQuestCard state={state} username={username} />)
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, '')
/** 그려진 버튼들의 글자 */
const buttonTexts = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1]))

const DEMO_STATES: Array<[string, OnboardingQuestCardState]> = [
  ['연출 sync 차례', demo(0, 'sync')],
  ['연출 bag 차례', demo(1, 'bag')],
  ['연출 browse 차례', demo(6, 'browse')],
  ['연출 중·실제 단계 읽지 못함', demo(1, 'bag', null)],
]

const REAL_STATES: Array<[string, OnboardingQuestCardState]> = [
  ['실제 ① 연동 전', realOnly({ stravaConnected: false })],
  ['실제 ① 연동됨', realOnly()],
  ['실제 ② 채우는 중', realOnly({ steps: { sync: true }, capsule: capsule() })],
  ['실제 ② 가득 참', realOnly({ steps: { sync: true }, capsule: capsule({ filled: 5, remaining: 0, openable: true, notOpenableReason: null }) })],
  [
    '실제 ② 빈칸 모자람',
    realOnly({ steps: { sync: true }, capsule: capsule({ filled: 5, remaining: 0, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 }) }),
  ],
  ['실제 ② 잼 모자람', realOnly({ steps: { sync: true }, capsule: capsule({ balance: 2 }) })],
  ['실제 ③ 개체 있음', realOnly({ steps: { sync: true, capsuleOpened: true }, capsule: capsule({ balance: 5 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 0 } })],
  ['실제 ③ 잼 모자람', realOnly({ steps: { sync: true, capsuleOpened: true }, capsule: capsule({ balance: 1 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 0 } })],
  ['실제 ③ 개체 모름', realOnly({ steps: { sync: true, capsuleOpened: true }, capsule: capsule() })],
]

describe('JAM! 시작하기 카드 — 어느 상태에도 없는 것', () => {
  it.each([...DEMO_STATES, ...REAL_STATES])('«퀘스트»·«연습»·«과제»·«가이드»·«튜토리얼»·«온보딩»이 없다 (%s)', (_name, state) => {
    const text = textOf(render(state, 'runner'))
    for (const banned of ['퀘스트', '연습', '과제', '가이드', '튜토리얼', '온보딩']) {
      expect(text, `«${banned}»가 있다`).not.toContain(banned)
    }
  })

  it.each([...DEMO_STATES, ...REAL_STATES])('보상 안내 문구와 위치 안내 문구가 없다 (%s)', (_name, state) => {
    const text = textOf(render(state, 'runner'))
    expect(text).not.toContain('끝까지 가면')
    expect(text).not.toContain('동기화는 위 버튼에서 진행돼요')
  })

  it.each([...DEMO_STATES, ...REAL_STATES])('카드 안 버튼 글자에 «시작하기»가 없다 — 칩 이름·완료 배지 이름과 겹치지 않게 (%s)', (_name, state) => {
    for (const label of buttonTexts(render(state, 'runner'))) {
      expect(label).not.toContain('시작하기')
    }
  })

  it.each([...DEMO_STATES, ...REAL_STATES])('카드를 감싸는 <a> 링크가 없다 — 버튼만 인터랙티브하다 (%s)', (_name, state) => {
    expect(render(state, 'runner')).not.toContain('<a ')
  })

  it.each([...DEMO_STATES, ...REAL_STATES])('완료 상태 구역과 «건너뛰었어요» 표시가 없다 (%s)', (_name, state) => {
    const text = textOf(render(state, 'runner'))
    expect(text).not.toContain('건너뛰었어요')
    expect(text).not.toContain('챕터 1을 시작했어요')
    expect(text).not.toContain('축하해요')
  })

  it.each([...DEMO_STATES, ...REAL_STATES])('어절 중간에서 끊기는 [overflow-wrap:anywhere]를 쓰지 않는다 (%s)', (_name, state) => {
    expect(render(state, 'runner')).not.toContain('overflow-wrap:anywhere')
  })
})

describe('JAM! 시작하기 카드 — 연출 중(연출 구역 + 실제 3단계 체크 목록)', () => {
  it('칩 «JAM! 시작하기»와 분수 «미리 해보기 3/7»이 보이고 스크린리더에는 «미리 해보기 7단계 중 3단계»로 읽힌다', () => {
    const html = render(demo(3, 'mix_success'))
    const text = textOf(html)
    expect(text).toContain('JAM! 시작하기')
    expect(html).toContain('<span aria-hidden="true" class="text-sm font-bold text-link')
    expect(html).toContain('>미리 해보기 3/7</span>')
    expect(html).toContain('<span class="sr-only">미리 해보기 7단계 중 3단계</span>')
  })

  it('카드는 role="group"이고 이름이 «JAM! 시작하기»다', () => {
    const html = render(demo(1, 'bag'))
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="JAM! 시작하기"')
  })

  it('연출 다음 단계의 제목·설명을 지금과 같게 보인다', () => {
    const html = render(demo(1, 'bag'))
    expect(html).toContain(d.onboardingQuest.steps.bag.title)
    expect(html).toContain(d.onboardingQuest.steps.bag.description)
  })

  it('연출 구역 아래에 구분선과 «내 활동으로 3단계» 체크 목록(<ol>)이 있고 행이 셋이다', () => {
    const html = render(demo(1, 'bag'))
    expect(html).toContain('<hr')
    expect(html).toContain('<ol aria-label="내 활동으로 3단계"')
    expect(html.match(/<li /g)).toHaveLength(3)
    const text = textOf(html)
    expect(text).toContain('Strava 동기화')
    expect(text).toContain('캡슐 열기')
    expect(text).toContain('잠긴 아이템 배지 열기')
    // 연출 구역이 먼저, 목록이 나중이다(DOM 순서 = 화면 순서)
    expect(html.indexOf(d.onboardingQuest.steps.bag.title)).toBeLessThan(html.indexOf('<ol'))
  })

  it('실제 단계 기록을 읽지 못했으면(real = null) 연출 구역만 있고 구분선도 목록도 없다', () => {
    const html = render(demo(1, 'bag', null))
    expect(html).toContain(d.onboardingQuest.steps.bag.title)
    expect(html).not.toContain('<hr')
    expect(html).not.toContain('<ol')
    expect(textOf(html)).not.toContain('캡슐 열기')
  })

  it('연출이 남은 채 실제 3단계가 모두 끝났으면 카드는 남고 세 행이 모두 체크 표시다', () => {
    const html = render(demo(2, 'pickup', realView({ steps: { sync: true, capsuleOpened: true, lockedOpened: true } })))
    expect(html).toContain(d.onboardingQuest.steps.pickup.title)
    const items = [...html.matchAll(/<li [\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item).toContain('text-link') // 체크 아이콘(--link)
      expect(item).toContain('마쳤어요')
    }
  })

  it('한 카드에 primary는 하나다 — 연출 CTA와 카드 밖 건너뛰기 버튼뿐이다', () => {
    const html = render(demo(1, 'bag'))
    expect(buttonTexts(html)).toEqual([d.onboardingQuest.continueButton, d.onboardingQuest.skip.entryLabel])
  })

  it('목록 행은 누를 수 없다 — 행 안에 버튼이나 링크가 없다', () => {
    const html = render(demo(1, 'bag'))
    const list = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'))
    expect(list).not.toContain('<button')
    expect(list).not.toContain('<a ')
    expect(list).not.toContain('onclick')
  })
})

describe('JAM! 시작하기 카드 — 연출 CTA', () => {
  it('sync 차례: 「동기화」 버튼이 있고 44px 터치 영역(size sm)이다', () => {
    const html = render(demo(0, 'sync'))
    expect(buttonTexts(html)[0]).toBe(d.today.syncButton)
    expect(html).toContain('py-[9px]')
    expect(html).not.toContain('calc(44px * var(--scale-compact))')
  })

  it('2~7단계: 「다음 단계」 버튼과 화살표 아이콘이 있다', () => {
    const html = render(demo(1, 'bag'))
    expect(html).toContain(d.onboardingQuest.continueButton)
    expect(html).toContain('M9 5l7 7-7 7')
    expect(html).toContain('py-[9px]')
  })

  it.each(['bag', 'pickup', 'drop', 'mix_fail', 'mix_success', 'browse'] as const)('nextStep=%s면 「다음 단계」 CTA가 보인다', (nextStep) => {
    expect(render(demo(1, nextStep))).toContain(d.onboardingQuest.continueButton)
  })

  it('두 연출 CTA 줄에는 펄스 클래스가 있고 self-start가 함께 있다 (티켓 20260928_1752, 20260928_2137)', () => {
    expect(render(demo(0, 'sync'))).toContain('self-start rounded-full jam-quest-pulse')
    expect(render(demo(1, 'bag'))).toContain('self-start rounded-full jam-quest-pulse')
  })

  it('옛 «시작하기» 버튼 문구는 사전에 없다', () => {
    expect(d.onboardingQuest).not.toHaveProperty('startButton')
  })
})

describe('JAM! 시작하기 카드 — 건너뛰기 진입점(티켓 20260927_2131 T8)', () => {
  it.each(['sync', 'bag', 'browse'] as const)('연출 중(nextStep=%s)에는 «미리 해보기 건너뛰기»가 보인다', (nextStep) => {
    const html = render(demo(1, nextStep))
    expect(html).toContain('미리 해보기 건너뛰기')
    expect(d.onboardingQuest.skip.entryLabel).toBe('미리 해보기 건너뛰기')
  })

  it('실제 구역 카드(연출 끝 또는 건너뜀)에는 건너뛰기 진입점이 없다', () => {
    for (const [, state] of REAL_STATES) {
      expect(render(state, 'runner')).not.toContain(d.onboardingQuest.skip.entryLabel)
    }
  })

  it('확인 시트 본문은 사용자가 정한 문구이고 «100 포인트»를 띄어 쓴다', () => {
    expect(d.onboardingQuest.skip.confirmBody).toBe(
      '미리 해보기를 건너뛰면 JAM! 배지와 100 포인트를 받을 수 없어요. 챕터 1은 내 활동으로 3단계를 마치면 시작해요. 이대로 건너뛸까요?'
    )
    expect(d.onboardingQuest.skip.keepGoingButton).toBe('계속하기')
    expect(d.onboardingQuest.skip.skipButton).toBe('건너뛰기')
  })
})

describe('JAM! 시작하기 카드 — 실제 구역이 위로 올라온 카드(연출 끝 또는 건너뜀)', () => {
  it('분수는 «내 활동으로 1/3»이고 스크린리더에는 «내 활동으로 3단계 중 1단계»로 읽힌다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule() }))
    expect(html).toContain('>내 활동으로 1/3</span>')
    expect(html).toContain('<span class="sr-only">내 활동으로 3단계 중 1단계</span>')
    expect(html).toContain('role="group"')
  })

  it('연출 구역이 없다 — 연출 단계 제목도 «미리 해보기» 분수도 구분선도 없다', () => {
    const html = render(realOnly())
    expect(html).not.toContain('<hr')
    expect(textOf(html)).not.toContain('미리 해보기')
    for (const step of Object.values(d.onboardingQuest.steps)) {
      expect(html).not.toContain(step.description)
    }
  })

  it('실제 구역 카드는 어느 상태에서도 버튼이 하나이고 펄스가 없고 44px(size sm)다', () => {
    for (const [name, state] of REAL_STATES) {
      const html = render(state, 'runner')
      expect(buttonTexts(html), name).toHaveLength(1)
      expect(html, name).not.toContain('jam-quest-pulse')
      expect(html, name).toContain('py-[9px]') // size sm(44px)
    }
  })

  it('목록 순서는 Strava 동기화, 캡슐 열기, 잠긴 아이템 배지 열기다', () => {
    const text = textOf(render(realOnly()))
    expect(text.indexOf('Strava 동기화')).toBeLessThan(text.indexOf('캡슐 열기'))
    expect(text.indexOf('캡슐 열기')).toBeLessThan(text.indexOf('잠긴 아이템 배지 열기'))
  })

  it('지금 할 차례 행은 굵은 제목과 설명을 갖고 마친 행은 한 줄, 남은 행은 muted다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule() }))
    const items = [...html.matchAll(/<li [\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(3)
    // 마친 행: 체크 아이콘 + 한 줄(설명 없음)
    expect(items[0]).toContain('마쳤어요')
    expect(items[0]).toContain('text-link')
    expect(items[0]).not.toContain('text-muted')
    // 지금 할 차례 행: text-base font-bold + 설명
    expect(items[1]).toContain('지금 할 차례예요')
    expect(items[1]).toContain('text-base font-bold')
    expect(items[1]).toContain(t(d.onboardingQuest.real.capsule.description, { n: 5 }))
    // 남은 행: muted 한 줄
    expect(items[2]).toContain('아직이에요')
    expect(items[2]).toContain('text-muted')
    expect(items[2]).not.toContain('text-base font-bold')
  })

  it('아이콘은 aria-hidden이고 행마다 상태가 글자(sr-only)로 붙는다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule() }))
    const items = [...html.matchAll(/<li [\s\S]*?<\/li>/g)].map((m) => m[0])
    for (const item of items) {
      expect(item).toContain('aria-hidden="true"')
      expect(item).toMatch(/<span class="sr-only">, (마쳤어요|지금 할 차례예요|아직이에요)<\/span>/)
    }
  })

  it('연출 중 카드의 목록과 같은 행 상태를 쓴다 — 연출 중에도 실제 진행이 체크된다', () => {
    const html = render(demo(1, 'bag', realView({ steps: { sync: true }, capsule: capsule() })))
    expect(html).toContain('<span class="sr-only">, 마쳤어요</span>')
    expect(html).toContain('<span class="sr-only">, 지금 할 차례예요</span>')
    expect(html).toContain('<span class="sr-only">, 아직이에요</span>')
  })
})

describe('JAM! 시작하기 카드 — ① Strava 동기화', () => {
  it('연동 전: 설명과 «Strava 동기화하기» 버튼 하나', () => {
    const html = render(realOnly({ stravaConnected: false }))
    expect(html).toContain('가장 최근 활동 하나가 잼과 배지가 되어 돌아와요')
    expect(buttonTexts(html)).toEqual(['Strava 동기화하기'])
  })

  it('연동됨·동기화 대기: 설명과 실제 SyncButton(«동기화») 하나', () => {
    const html = render(realOnly({ stravaConnected: true }), 'runner')
    expect(html).toContain('Strava에 활동이 올라오면 동기화해서 잼과 배지를 받아요')
    expect(buttonTexts(html)).toEqual([d.today.syncButton])
  })
})

describe('JAM! 시작하기 카드 — ② 캡슐 열기', () => {
  it('채우는 중: 필요한 잼은 가진 잼이 아니라 캡슐에 더 채울 양이다 — 가진 잼 10이어도 «5만큼»', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule({ balance: 10 }) }))
    const text = textOf(html)
    expect(text).toContain('캡슐을 채워 열어요. 필요한 잼은 5만큼이에요. 남은 잼은 잠긴 아이템 배지를 여는 데 써요.')
    expect(text).not.toContain('10만큼')
    expect(buttonTexts(html)).toEqual(['캡슐 채우기'])
    expect(html).not.toContain('role="status"')
  })

  it('여유가 0일 때(가진 잼 5, 필요한 잼 5)는 미리 경고하지 않는다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule({ balance: 5 }) }))
    expect(html).not.toContain('role="status"')
    expect(buttonTexts(html)).toEqual(['캡슐 채우기'])
  })

  it('가득 참: 열라는 설명과 «캡슐 열기» 버튼', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule({ filled: 5, remaining: 0, balance: 5, openable: true, notOpenableReason: null }) }))
    expect(textOf(html)).toContain('캡슐이 가득 찼어요. 열어서 아이템 배지를 획득해요.')
    expect(buttonTexts(html)).toEqual(['캡슐 열기'])
  })

  it('인벤토리 빈칸 모자람: InlineNotice로 캡슐 시트와 같은 어휘를 쓰고 버튼은 «인벤토리 보기»다', () => {
    const html = render(
      realOnly({
        steps: { sync: true },
        capsule: capsule({ filled: 5, remaining: 0, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 }),
      })
    )
    expect(html).toContain('role="status"')
    expect(textOf(html)).toContain('인벤토리 빈칸이 모자라요. 지금 빈칸 1개, 열려면 2개가 필요해요. 채운 잼은 그대로 남아 있어요.')
    expect(buttonTexts(html)).toEqual([d.capsule.sheet.inventoryLink])
  })

  it('캡슐 상태를 읽지 못하면 일반 설명과 «캡슐 열기»만 보이고 잼 안내는 없다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: null }))
    expect(textOf(html)).toContain('캡슐을 채워 열어요. 남은 잼은 잠긴 아이템 배지를 여는 데 써요.')
    expect(textOf(html)).not.toContain('필요한 잼은')
    expect(html).not.toContain('role="status"')
    expect(buttonTexts(html)).toEqual(['캡슐 열기'])
  })

  it('잼 모자람: 안내가 나오고 primary 버튼이 동기화로 바뀐다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule({ balance: 2 }) }), 'runner')
    expect(html).toContain('role="status"')
    expect(textOf(html)).toContain('잼이 모자라요. 가진 잼은 2만큼, 필요한 잼은 5만큼이에요. 새 활동을 동기화하면 잼을 더 받아요.')
    expect(buttonTexts(html)).toEqual([d.today.syncButton])
  })

  it('잼 모자람인데 Strava 연결이 끊겨 있으면 동기화 버튼 대신 연결 버튼이다', () => {
    const html = render(realOnly({ steps: { sync: true }, stravaConnected: false, capsule: capsule({ balance: 2 }) }))
    expect(buttonTexts(html)).toEqual(['Strava 동기화하기'])
  })

  it('경고 아이콘·경고색을 쓰지 않는다 — 안내 면은 InlineNotice의 background-secondary다', () => {
    const html = render(realOnly({ steps: { sync: true }, capsule: capsule({ balance: 2 }) }))
    expect(html).toContain('bg-background-secondary')
    expect(html).not.toMatch(/text-(danger|warning|error)/)
  })
})

describe('JAM! 시작하기 카드 — ③ 잠긴 아이템 배지 열기', () => {
  const steps = { sync: true, capsuleOpened: true }

  it('개체를 알면 더 채울 잼을 설명하고 «열러 가기» 버튼 하나다', () => {
    const html = render(realOnly({ steps, capsule: capsule({ balance: 5 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 0 } }))
    expect(textOf(html)).toContain('잠긴 아이템 배지에 잼 5만큼 채우면 열 수 있어요')
    expect(buttonTexts(html)).toEqual(['열러 가기'])
    expect(html).not.toContain('role="status"')
  })

  it('일부를 채워 둔 개체는 남은 양을 말한다', () => {
    const html = render(realOnly({ steps, capsule: capsule({ balance: 5 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 3 } }))
    expect(textOf(html)).toContain('잠긴 아이템 배지에 잼 2만큼 채우면 열 수 있어요')
  })

  it('이미 다 채운 개체는 «잼 0만큼»이라고 말하지 않는다', () => {
    const html = render(realOnly({ steps, capsule: capsule({ balance: 0 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 5 } }))
    expect(textOf(html)).toContain('다 채워 둔 잠긴 아이템 배지를 열 수 있어요')
    expect(textOf(html)).not.toContain('0만큼')
    expect(html).not.toContain('role="status"')
  })

  it('잼 모자람: 숫자 없는 안내가 나오고 primary 버튼이 동기화로 바뀐다', () => {
    const html = render(realOnly({ steps, capsule: capsule({ balance: 1 }), lockedTarget: { itemId: 'item-1', required: 5, filled: 0 } }), 'runner')
    expect(html).toContain('role="status"')
    expect(textOf(html)).toContain('잠긴 아이템 배지를 열 잼이 모자라요. 새 활동을 동기화하면 잼을 더 받아요.')
    expect(buttonTexts(html)).toEqual([d.today.syncButton])
  })

  it('개체를 읽지 못했으면 일반 설명이고 버튼은 그대로 «열러 가기»다', () => {
    const html = render(realOnly({ steps, capsule: capsule(), lockedTarget: null }))
    expect(textOf(html)).toContain('잠긴 아이템 배지에 잼을 채우면 열 수 있어요')
    expect(buttonTexts(html)).toEqual(['열러 가기'])
  })

  it('③이 ②보다 먼저 체크돼도 각 행은 독립이다 — ②가 지금 할 차례로 남는다', () => {
    const html = render(realOnly({ steps: { sync: true, lockedOpened: true }, capsule: capsule() }))
    const items = [...html.matchAll(/<li [\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items[0]).toContain('마쳤어요')
    expect(items[1]).toContain('지금 할 차례예요')
    expect(items[2]).toContain('마쳤어요')
    expect(buttonTexts(html)).toEqual(['캡슐 채우기'])
  })
})

describe('JAM! 시작하기 카드 — 줄바꿈 규칙(UX 라이팅 가이드 §3.2)', () => {
  it.each([...DEMO_STATES, ...REAL_STATES])('제목·설명·분수·안내에 break-keep wrap-break-word가 있다 (%s)', (_name, state) => {
    const html = render(state, 'runner')
    expect(html).toContain('break-keep wrap-break-word')
    // 한국어가 든 <p>는 모두 줄바꿈 클래스를 갖는다
    const paragraphs = [...html.matchAll(/<p class="([^"]*)"[^>]*>/g)].map((m) => m[1])
    for (const cls of paragraphs) {
      expect(cls, `줄바꿈 클래스가 없는 <p>: ${cls}`).toContain('break-keep')
      expect(cls).toContain('wrap-break-word')
    }
  })
})

describe('JAM! 시작하기 카드 — 칩은 MODULAR LabelChip(티켓 20261001_1204)', () => {
  // LabelChip은 Tailwind 클래스 대신 인라인 style로 그린다 — 모양(계산 스타일)은 LabelChip.test.tsx가
  // 고정하고, 여기서는 카드 상태 모두 칩이 같은 컴포넌트를 거치고 호출부 배치 클래스 self-start만 붙는지 본다.
  const CHIP_PATTERN = new RegExp(`<span class="self-start" style="[^"]*padding:6px 10px[^"]*">${d.onboardingQuest.chipLabel}</span>`, 'g')

  it.each([...DEMO_STATES, ...REAL_STATES])('칩 라벨이 self-start LabelChip으로 한 번 그려진다 (%s)', (_name, state) => {
    const html = render(state, 'runner')
    expect(html.match(CHIP_PATTERN)).toHaveLength(1)
    expect(html).not.toContain('px-2.5 py-1.5')
  })

  it('칩 글자는 «JAM! 시작하기»다', () => {
    expect(d.onboardingQuest.chipLabel).toBe('JAM! 시작하기')
  })
})

describe('JAM! 시작하기 카드 — GA4 onboarding_quest_start 트래커 마운트(티켓 20260927_2132 T9)', () => {
  it('0/7(첫 렌더)이고 미리보기가 아니면 마운트한다', () => {
    expect(render(demo(0, 'sync'))).toContain(QUEST_START_TRACKER_MARKER)
  })

  it('이미 진행 중(done > 0)이면 마운트하지 않는다', () => {
    expect(render(demo(1, 'bag'))).not.toContain(QUEST_START_TRACKER_MARKER)
  })

  it('관리자 미리보기 상태(preview: true)면 0/7이어도 마운트하지 않는다', () => {
    expect(render(demo(0, 'sync', realView(), true))).not.toContain(QUEST_START_TRACKER_MARKER)
  })

  it('실제 구역 카드에는 마운트하지 않는다', () => {
    expect(render(realOnly())).not.toContain(QUEST_START_TRACKER_MARKER)
  })
})

describe('JAM! 시작하기 카드 — 숨김', () => {
  it('state가 null이면 아무것도 그리지 않는다', () => {
    expect(render(null)).toBe('')
  })
})
