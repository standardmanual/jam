/**
 * 운영 설정(S7) 「신호 기준값」 구역 화면 부품의 초기 렌더 (티켓 20260930_1459 조각 C, 채원 확정 설계 「조각 C」)
 *
 * 저장소에 jsdom·testing-library가 없어(`settings.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다. 값을 고치는 동안 바뀌는 결과 문장·
 * 저장 전 표시·오류 문장·저장 본문의 판정은 순수 함수라 `lib/admin/opsSignals/__tests__/thresholdSettings.test.ts`가 본다. 지키는 것:
 * - 카드 9장이 신호 수준 3그룹으로 보이고(앵커 `#signal-<신호 키>`, 카드마다 작은 폼) 편집 칸 24개(입력 22 + 요일 선택 2) + 읽기 전용 1개가 보인다
 * - 「실측 아님」 칩은 4장에만 있고 체크박스·「임시값」 글자가 없으며 안내 문장이 같이 나온다
 * - 바꾼 칸에만 「바꾼 값이에요 · 기본값 …」 줄과 [기본값으로 되돌리기]가 있고 카드 제목 줄에 「바꾼 값 N」, 마지막 줄이 맞게 바뀐다
 * - 읽기 전용 시각의 세 상태가 맞고 입력·되돌리기가 없다
 * - 저장된 값을 읽을 수 없으면 처음부터 오류 문구와 [기본값으로 되돌리기]가 보인다
 * - 한 번도 안 바꿨으면 [저장하기]가 비활성이고 「저장 전」 칩이 없다. 구역 조회 실패는 이 구역만 오류 카드와 [새로 고치기]다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-settings',
  useSearchParams: () => new URLSearchParams(),
}))

import { OpsSignalSettings } from '../OpsSignalSettings'
import { OPS_SIGNAL_THRESHOLD_KEYS, type OpsSignalThresholdKey } from '@/lib/admin/opsSignals/thresholds'
import { toThresholdRecord, type SignalThresholdRecord, type ThresholdRow } from '@/lib/admin/opsSignals/thresholdSettings'

const T0 = '2026-10-01T06:20:00+00:00' // 10/1(목) 15:20 KST

function row(key: OpsSignalThresholdKey, value: unknown, over: Partial<ThresholdRow> = {}): ThresholdRow {
  // 저장 모양은 `{"value": <값>}`이다
  return { rule_key: key, value: { value } as never, updated_at: T0, previous_value: null, ...over }
}

function thresholds(rows: ThresholdRow[] = []): SignalThresholdRecord[] {
  const byKey = new Map(rows.map((r) => [r.rule_key, r]))
  return OPS_SIGNAL_THRESHOLD_KEYS.map((key) => toThresholdRecord(key, byKey.get(key)))
}

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

/** 카드 하나의 마크업만 잘라 낸다(앵커 ID `signal-<키>`부터 다음 카드 앵커 전까지). */
function cardOf(markup: string, signal: string): string {
  const marker = `id="signal-${signal}"><form`
  const start = markup.indexOf(marker)
  expect(start, `카드 ${signal}`).toBeGreaterThan(-1)
  const next = markup.slice(start + marker.length).search(/id="signal-[a-z_]+"><form/)
  return markup.slice(start, next === -1 ? undefined : start + marker.length + next)
}

const render = (rows: ThresholdRow[] = []) => flat(<OpsSignalSettings thresholds={thresholds(rows)} />)

describe('OpsSignalSettings — 카드 9장과 그룹', () => {
  const out = render()

  it('그룹 제목 3개가 신호 수준 순서(중단·주의·참고)로 보인다', () => {
    expect([...out.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1])).toEqual(['중단 신호', '주의 신호', '참고 신호'])
  })

  it('카드 9장이 신호 순서대로 있고 앵커가 #signal-<신호 키>이며 카드마다 작은 폼이다', () => {
    expect([...out.matchAll(/id="(signal-[a-z_]+)"><form/g)].map((m) => m[1])).toEqual([
      'signal-execution_failed',
      'signal-missed_schedule',
      'signal-routine_failed',
      'signal-empty_content',
      'signal-no_new_content',
      'signal-approval_deadline',
      'signal-overlap',
      'signal-monotony',
      'signal-action_spike',
    ])
    expect(out.match(/<form /g)).toHaveLength(9)
    expect([...out.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)].map((m) => m[1])).toEqual([
      '실행 실패',
      '예약 누락',
      '루틴 실패',
      '비어 있는 컨텐츠',
      '새 컨텐츠가 없는 날',
      '승인 마감 임박',
      '겹침',
      '단조로운 흐름',
      '행동 횟수 급증',
    ])
  })

  it('카드는 헤더와 구역 이동 링크 아래로 스크롤되도록 scroll-mt-32이고 @container다', () => {
    expect(out.match(/scroll-mt-32/g)).toHaveLength(9)
    expect(out).not.toContain('scroll-mt-20')
    expect(out.match(/class="@container /g)).toHaveLength(9)
  })

  it('편집 칸 24개(숫자 입력 22 + 요일 선택 2)와 읽기 전용 1개가 보이고 신호를 끄는 칸은 없다', () => {
    expect(out.match(/inputMode="(numeric|decimal)"/g)).toHaveLength(22)
    expect(out.match(/role="combobox"/g)).toHaveLength(2)
    expect(out).not.toContain('role="switch"')
    expect(out).not.toContain('켜짐')
    expect(out).not.toContain('꺼짐')
    expect(cardOf(out, 'routine_failed')).toContain('루틴 점검을 시작하는 시각')
  })

  it('칸 이름표는 thresholds.ts의 label과 UI 전용 문구이고 입력은 이름표와 이어져 있다', () => {
    const card = cardOf(out, 'approval_deadline')
    expect(card).toContain('<label id="signal-approval_deadline-approvalDeadlineHours-label" for="signal-approval_deadline-approvalDeadlineHours"')
    expect(card).toContain('공개 시각 몇 시간 전까지 승인되지 않으면 띄우는지')
    expect(card).toMatch(/id="signal-approval_deadline-approvalDeadlineHours"[^>]*value="48"/)
    expect(card).toContain('>시간<')
    const routine = cardOf(out, 'routine_failed')
    expect(routine).toContain('>주간 루틴 마감 요일</label>')
    // 요일 칸은 Select 트리거(button)이고 이름표 `for`와 같은 id를 갖는다(속성 순서와 상관없이 한 태그 안에서 본다)
    expect(routine).toMatch(/<button(?=[^>]*role="combobox")(?=[^>]*id="signal-routine_failed-weeklyRoutineWeekday")/)
    expect(routine).toContain('for="signal-routine_failed-weeklyRoutineWeekday"')
    expect(cardOf(out, 'empty_content')).toContain('>다음 주 편성을 검사하기 시작하는 요일</label>')
  })

  it('지표별 최소 건수 5칸은 한 fieldset이고 legend가 있다', () => {
    const card = cardOf(out, 'action_spike')
    expect(card).toContain('<fieldset')
    expect(card).toContain('>지표별 최소 건수(최근 7일 합계)</legend>')
    for (const label of ['믹스 시도', '유저 드랍', '픽업', '미션 완료', '컬렉션 완성']) expect(card).toContain(`>${label}</label>`)
    expect(card).toMatch(/id="signal-action_spike-actionSpikeMinPickup"[^>]*value="23"/)
    expect(card).toContain('inputMode="decimal"') // 배수 칸만 소수 키보드
    expect(card).toContain('소수 첫째 자리까지 적을 수 있어요 (예: 1.5)')
  })

  it('안내 문구: 시 칸은 24시간제, 월간 날짜는 28일까지, 다음 주 검사 요일은 일요일 안내', () => {
    const routine = cardOf(out, 'routine_failed')
    expect(routine.match(/한국 시각 24시간제예요\. 0은 자정이에요/g)).toHaveLength(2)
    expect(routine).toContain('29일부터는 없는 달이 있어서 28일까지만 정할 수 있어요')
    expect(cardOf(out, 'empty_content')).toContain('일요일에는 늘 다음 주도 검사해요. 그 전에도 다음 주 기획이 도착했으면 검사해요')
  })

  it('처음에는 바꾼 값이 없어 되돌리기·「바꾼 값 N」·「저장 전」이 없고 [저장하기]는 비활성이다', () => {
    expect(out).not.toContain('기본값으로 되돌리기')
    expect(out).not.toContain('바꾼 값 ')
    expect(out).not.toContain('바꾼 값이에요')
    expect(out).not.toContain('저장 전')
    expect(out).not.toContain('바꾼 내용 취소')
    expect(out.match(/<button[^>]*type="submit"[^>]*disabled=""/g)).toHaveLength(9)
  })
})

describe('OpsSignalSettings — 실측 아님 칩', () => {
  const out = render()

  it('「실측 아님」 칩과 안내 문장은 4장(예약 누락·루틴 실패·승인 마감 임박·행동 횟수 급증)에만 있다', () => {
    expect(out.match(/실측 아님/g)).toHaveLength(4)
    expect(out.match(/기본값은 추정한 값이에요\. 운영하면서 실제 수치를 보고 조정해요/g)).toHaveLength(4)
    for (const signal of ['missed_schedule', 'routine_failed', 'approval_deadline', 'action_spike']) {
      expect(cardOf(out, signal), signal).toContain('실측 아님')
    }
    for (const signal of ['execution_failed', 'empty_content', 'no_new_content', 'overlap', 'monotony']) {
      expect(cardOf(out, signal), signal).not.toContain('실측 아님')
    }
  })

  it('체크박스와 「임시값」 글자가 없다(밸런스 규칙의 임시값과 다르다)', () => {
    expect(out).not.toContain('type="checkbox"')
    expect(out).not.toContain('role="checkbox"')
    expect(out).not.toContain('임시값')
  })

  it('값을 바꿔 저장해도 칩은 남는다(실측 아님은 칸의 성질이다)', () => {
    const changed = render([row('approvalDeadlineHours', 36, { previous_value: { value: 48 } })])
    expect(cardOf(changed, 'approval_deadline')).toContain('실측 아님')
  })
})

describe('OpsSignalSettings — 바꾼 값', () => {
  it('바꾼 칸에만 「바꾼 값이에요 · 기본값 …」 줄과 [기본값으로 되돌리기]가 있고 제목 줄에 「바꾼 값 N」이 보인다', () => {
    const out = render([row('missedScheduleMinutes', 45, { previous_value: { value: 30 } })])
    const card = cardOf(out, 'missed_schedule')
    expect(card).toMatch(/id="signal-missed_schedule-missedScheduleMinutes"[^>]*value="45"/)
    expect(card).toContain('바꾼 값이에요 · 기본값 30분')
    expect(card).not.toContain('직전 값')
    expect(card).toContain('>기본값으로 되돌리기<')
    expect(card).toContain('바꾼 값 1')
    expect(card).toContain('마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20')
    expect(card).not.toContain('기본값 그대로예요')
    // 다른 카드는 그대로다
    expect(out.match(/바꾼 값이에요/g)).toHaveLength(1)
    expect(out.match(/기본값으로 되돌리기/g)).toHaveLength(1)
  })

  it('직전 값이 있고 기본값과 다르면 「 · 직전 값 …」이 붙는다', () => {
    const out = render([row('missedScheduleMinutes', 10, { previous_value: { value: 45 } })])
    expect(cardOf(out, 'missed_schedule')).toContain('바꾼 값이에요 · 기본값 30분 · 직전 값 45분')
  })

  it('같은 카드에서 두 칸을 바꾸면 「바꾼 값 2」이고 칸마다 되돌리기가 있다', () => {
    const out = render([row('weeklyRoutineDeadlineHour', 9), row('monthlyRoutineDay', 5, { updated_at: '2026-10-02T01:05:00+00:00' })])
    const card = cardOf(out, 'routine_failed')
    expect(card).toContain('바꾼 값 2')
    expect(card.match(/기본값으로 되돌리기/g)).toHaveLength(2)
    expect(card).toContain('마지막으로 바꾼 사람 관리자 · 10/2(금) 10:05')
    expect(card).toContain('바꾼 값이에요 · 기본값 12시')
    expect(card).toContain('바꾼 값이에요 · 기본값 1일')
  })

  it('요일·배수 칸의 바꾼 값도 단위까지 보인다(화요일 → 일요일, 2배 → 1.5배)', () => {
    const out = render([row('weeklyRoutineWeekday', 0), row('actionSpikeMultiplier', 1.5)])
    expect(cardOf(out, 'routine_failed')).toContain('바꾼 값이에요 · 기본값 화요일')
    expect(cardOf(out, 'action_spike')).toContain('바꾼 값이에요 · 기본값 2배')
  })

  it('한 번도 안 바꿨으면 칸이 하나인 카드는 「기본값 그대로예요」, 여럿이면 「모두 기본값 그대로예요」다', () => {
    const out = render()
    expect(cardOf(out, 'execution_failed')).toContain('>기본값 그대로예요<')
    expect(cardOf(out, 'routine_failed')).toContain('>모두 기본값 그대로예요<')
    expect(out.match(/>기본값 그대로예요</g)).toHaveLength(4) // 칸이 하나인 카드: 실행 실패·예약 누락·새 컨텐츠가 없는 날·승인 마감 임박
    expect(out.match(/>모두 기본값 그대로예요</g)).toHaveLength(5)
  })

  it('결과 문장이 바꾼 값으로 만들어진다', () => {
    expect(cardOf(render(), 'missed_schedule')).toContain('공개 시각이 지나고 30분이 지나도 공개되지 않으면 알려요')
    expect(cardOf(render([row('missedScheduleMinutes', 45)]), 'missed_schedule')).toContain('공개 시각이 지나고 45분이 지나도 공개되지 않으면 알려요')
    expect(cardOf(render(), 'routine_failed')).toContain('주간 루틴은 화요일 12시까지, 월간 루틴은 매월 1일 12시까지 기획안이 나오지 않으면 알려요')
  })

  it('마지막으로 바꾼 줄에 관리자 사용자 ID가 나오지 않는다(응답에 ID가 없다)', () => {
    const out = render([row('missedScheduleMinutes', 45)])
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})

describe('OpsSignalSettings — 읽기 전용 시각 세 상태', () => {
  it('값이 있으면 시각이, 없으면 「아직 정해지지 않았어요」, 못 읽으면 「시각을 읽을 수 없어요」가 보인다', () => {
    const withValue = cardOf(render([row('routineCheckStartsAt', '2026-10-05T15:00:00.000Z')]), 'routine_failed')
    expect(withValue).toContain('10/6(화) 00:00')
    const none = cardOf(render(), 'routine_failed')
    expect(none).toContain('아직 정해지지 않았어요')
    const broken = cardOf(render([row('routineCheckStartsAt', 'garbage')]), 'routine_failed')
    expect(broken).toContain('시각을 읽을 수 없어요')
  })

  it('입력·되돌리기·「바꾼 값」·「마지막으로 바꾼 사람」 대상이 아니다', () => {
    const out = render([row('routineCheckStartsAt', '2026-10-05T15:00:00.000Z')])
    const card = cardOf(out, 'routine_failed')
    expect(card).not.toContain('signal-routine_failed-routineCheckStartsAt"') // 입력 칸 id가 없다
    expect(card).not.toContain('기본값으로 되돌리기')
    expect(card).not.toContain('바꾼 값 ')
    expect(card).not.toContain('마지막으로 바꾼 사람')
    expect(card).toContain('>모두 기본값 그대로예요<')
    expect(card).toContain('첫 주간 루틴을 돌릴 때 정해져요. 정해지기 전에는 루틴 실패를 확인하지 않아요. 여기서는 바꿀 수 없어요')
  })
})

describe('OpsSignalSettings — 읽을 수 없는 저장값', () => {
  it('저장된 값이 0이면 처음부터 오류 문구와 [기본값으로 되돌리기]가 보이고 입력은 비어 있다', () => {
    const out = render([row('minLiveCards', 0)])
    const card = cardOf(out, 'empty_content')
    expect(card).toContain('저장된 값을 읽을 수 없어요. 새 값을 적거나 기본값으로 되돌려 주세요')
    expect(card).toMatch(/id="signal-empty_content-minLiveCards"[^>]*aria-invalid="true"/)
    expect(card).toMatch(/id="signal-empty_content-minLiveCards"[^>]*value=""/)
    expect(card).toContain('>기본값으로 되돌리기<')
    expect(card).not.toContain('바꾼 값이에요') // 읽을 수 없는 행은 「바꾼 값」으로 세지 않는다
    expect(card).not.toContain('바꾼 값 1')
    // 신호 계산은 기본값(3장)을 쓰므로 결과 문장도 기본값으로 읽는다
    expect(card).toContain('하루에 게재하는 카드가 3장보다 적거나 5장보다 많은 날을 알려요')
    // 읽을 수 없는 칸이 같은 카드의 다른 칸 저장을 막지 않는다: 고치지 않았으니 저장 전 칩도 없다
    expect(card).not.toContain('저장 전')
  })
})

describe('OpsSignalSettings — 구역 상태', () => {
  it('기준값을 읽지 못하면 이 구역만 오류 카드와 [새로 고치기]가 보이고 기본값을 현재 값처럼 보이지 않는다', () => {
    const out = flat(<OpsSignalSettings thresholds={null} />)
    expect(out).toContain('신호 기준값을 불러오지 못했어요')
    expect(out).toContain('서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요')
    expect(out).toContain('새로 고치기')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('inputMode')
  })

  it('빈 상태는 없다: 바꾼 값 행이 하나도 없는 것이 정상이라 기본값으로 카드가 그려진다', () => {
    const out = render()
    expect(out.match(/<form /g)).toHaveLength(9)
    expect(out).not.toContain('등록되지 않았어요')
  })
})
