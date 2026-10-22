/**
 * 밸런스 설정 구역 공용 폼의 화면 부분 (티켓 20261022_1132 1회)
 *
 * 저장소에 jsdom·testing-library가 없어(`ops/__tests__/settings.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 그린 모양만 고정한다.
 * 상태·요청은 컨테이너(`BalanceSectionForm`)가 맡고 초안·검증 판정은 순수 함수라 `lib/admin/balance/__tests__/fields.test.ts`가 본다. 지키는 것:
 * - 잼 구역 칸 6개가 두 묶음(강도 배율 3칸, 대량 수령 경보 기준 3칸) 제목 아래 보이고 입력에 저장된 값이 들어 있다
 * - 칸마다 단위, 안내, «기본값 N»이 보이고, 바꾼 칸에만 «바꾼 값 이전 → 새 값»이 보인다
 * - 칸 오류는 같은 칸 아래 `role="alert"`로 나오고 입력에 `aria-invalid`가 붙는다
 * - 메모 칸은 선택이고 200자 제한이 걸려 있다
 * - [저장]은 `canSave`가 거짓이면 비활성이고, 저장 중에는 입력이 잠기며 글자가 바뀐다
 * - 알림: 성공은 `status`, 오류·충돌은 경고 상자이고 충돌에만 [새로 불러오기]가 있다
 * - 한국어를 그리는 요소에 줄바꿈 클래스(`break-keep wrap-break-word`)가 붙어 있다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { JAM_FIELDS } from '@/lib/admin/balance/jam'
import { draftFromValues } from '@/lib/admin/balance/fields'
import {
  BalanceSectionFormView,
  groupFields,
  NOTE_LABEL,
  RELOAD_LABEL,
  SAVE_LABEL,
  SAVING_LABEL,
  type BalanceSectionFormViewProps,
} from '../BalanceSectionForm'

const SAVED = {
  intensity_light: 1,
  intensity_normal: 2,
  intensity_hard: 3,
  mass_earn_alert_multiplier: 3,
  mass_earn_alert_weeks: 4,
  mass_earn_alert_no_history_amount: 1200,
}

function view(overrides: Partial<BalanceSectionFormViewProps> = {}): string {
  const props: BalanceSectionFormViewProps = {
    idBase: 'balance-jam',
    fields: JAM_FIELDS,
    savedValues: SAVED,
    draft: draftFromValues(JAM_FIELDS, SAVED),
    note: '',
    errors: {},
    canSave: false,
    saving: false,
    notice: null,
    onDraftChange: vi.fn(),
    onTouch: vi.fn(),
    onNoteChange: vi.fn(),
    onSubmit: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  }
  return renderToStaticMarkup(<BalanceSectionFormView {...props} />).replace(/<!-- -->/g, '')
}

describe('칸 묶음', () => {
  it('같은 묶음 제목이 이어지는 칸끼리 묶는다', () => {
    const groups = groupFields(JAM_FIELDS)
    expect(groups.map((g) => [g.title, g.fields.length])).toEqual([
      ['강도 배율', 3],
      ['대량 수령 경보 기준', 3],
    ])
    expect(groupFields([{ ...JAM_FIELDS[0], group: undefined }, { ...JAM_FIELDS[1], group: undefined }])).toHaveLength(1)
  })
})

describe('BalanceSectionFormView — 처음 모양', () => {
  const out = view()

  it('두 묶음 제목과 칸 6개의 이름표·입력이 보인다', () => {
    expect([...out.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map((m) => m[1])).toEqual(['강도 배율', '대량 수령 경보 기준'])
    for (const def of JAM_FIELDS) {
      expect(out).toContain(`for="balance-jam-${def.key}"`)
      expect(out).toContain(`id="balance-jam-${def.key}"`)
      expect(out).toContain(def.label)
    }
    expect([...out.matchAll(/<input /g)]).toHaveLength(6)
  })

  it('입력에 저장된 값이 들어 있다', () => {
    expect(out).toMatch(/id="balance-jam-intensity_normal"[^>]*value="2"/)
    expect(out).toMatch(/id="balance-jam-mass_earn_alert_no_history_amount"[^>]*value="1200"/)
  })

  it('칸마다 단위와 안내와 기본값이 보인다', () => {
    expect(out).toContain('걷기, 전기자전거')
    expect(out).toContain('기본값 1배')
    expect(out).toContain('기본값 3배')
    expect(out).toContain('기본값 4주')
    expect(out).toContain('기본값 1,200잼')
  })

  it('바꾼 칸이 없으면 «바꾼 값» 줄이 없고 [저장]은 비활성이다', () => {
    expect(out).not.toContain('바꾼 값')
    expect(out).toContain('바뀐 칸이 없어요')
    expect(out).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*disabled[^>]*>${SAVE_LABEL}</button>`))
  })

  it('메모는 선택이고 200자 제한이 걸려 있다', () => {
    expect(out).toContain(NOTE_LABEL)
    expect(out).toMatch(/<textarea[^>]*maxLength="200"/)
    expect(out).toContain('최대 200자 · 0자')
    expect(out).not.toMatch(/<textarea[^>]*required/)
  })

  it('«기본값으로 되돌리기» 버튼은 없다', () => {
    expect(out).not.toContain('되돌리기')
  })
})

describe('BalanceSectionFormView — 고치는 중', () => {
  it('바꾼 칸에만 «바꾼 값 이전 → 새 값»이 단위와 함께 보이고 바뀐 칸 수가 보인다', () => {
    const draft = { ...draftFromValues(JAM_FIELDS, SAVED), intensity_normal: '4', mass_earn_alert_no_history_amount: '2400' }
    const out = view({ draft, canSave: true })
    expect(out).toContain('바꾼 값 2배 → 4배')
    expect(out).toContain('바꾼 값 1,200잼 → 2,400잼')
    expect([...out.matchAll(/바꾼 값/g)]).toHaveLength(2)
    expect(out).toContain('바뀐 칸 2개')
    expect(out).not.toMatch(new RegExp(`<button[^>]*type="submit"[^>]*disabled`))
  })

  it('읽을 수 없는 글자는 바꾼 값 줄이 없다(오류가 따로 알린다)', () => {
    const out = view({ draft: { ...draftFromValues(JAM_FIELDS, SAVED), intensity_light: 'x' } })
    expect(out).not.toContain('바꾼 값')
  })

  it('칸 오류는 같은 칸 아래 알림으로 나오고 입력이 잘못된 값으로 표시된다', () => {
    const out = view({ errors: { intensity_hard: '0 이상의 정수로 입력해 주세요.' } })
    expect(out).toMatch(/id="balance-jam-intensity_hard"[^>]*aria-invalid="true"/)
    expect(out).toMatch(/aria-describedby="balance-jam-intensity_hard-error balance-jam-intensity_hard-hint"/)
    expect(out).toMatch(/<p id="balance-jam-intensity_hard-error" role="alert"[^>]*>0 이상의 정수로 입력해 주세요\.<\/p>/)
    expect([...out.matchAll(/role="alert"/g)]).toHaveLength(1)
  })

  it('메모 글자 수가 보인다', () => {
    expect(view({ note: '주말 이벤트' })).toContain('최대 200자 · 6자')
  })
})

describe('BalanceSectionFormView — 저장 중과 알림', () => {
  it('저장 중에는 입력이 잠기고 버튼 글자가 바뀌며 폼이 바쁜 상태다', () => {
    const out = view({ saving: true, canSave: false })
    expect(out).toContain(SAVING_LABEL)
    expect(out).toContain('aria-busy="true"')
    expect([...out.matchAll(/<input [^>]*disabled/g)]).toHaveLength(6)
    expect(out).toMatch(/<textarea[^>]*disabled/)
  })

  it('성공 알림은 상태 문장이고 경고 상자가 아니다', () => {
    const out = view({ notice: { kind: 'success', text: '저장했어요. 바뀐 값은 staging과 프로덕션에 바로 반영돼요.' } })
    expect(out).toMatch(/<p role="status"[^>]*>저장했어요\. 바뀐 값은 staging과 프로덕션에 바로 반영돼요\.<\/p>/)
    expect(out).not.toContain('role="alert"')
    expect(out).not.toContain(RELOAD_LABEL)
  })

  it('오류 알림은 경고 상자이고 [새로 불러오기]가 없다', () => {
    const out = view({ notice: { kind: 'error', text: '서버에 연결하지 못했어요.' } })
    expect(out).toMatch(/role="alert"[^>]*>.*서버에 연결하지 못했어요\./)
    expect(out).not.toContain(RELOAD_LABEL)
  })

  it('충돌 알림에는 [새로 불러오기]가 있다', () => {
    const out = view({ notice: { kind: 'conflict', text: '다른 사람이 먼저 바꿨어요. 새로 불러온 뒤 다시 바꿔 주세요.' } })
    expect(out).toContain('다른 사람이 먼저 바꿨어요. 새로 불러온 뒤 다시 바꿔 주세요.')
    expect(out).toContain(RELOAD_LABEL)
  })
})

describe('한국어 줄바꿈', () => {
  it('이름표·안내·기본값·메모·알림 문장에 break-keep wrap-break-word가 붙어 있다', () => {
    const out = view({ errors: { intensity_light: '문장' }, notice: { kind: 'error', text: '오류' }, draft: { ...draftFromValues(JAM_FIELDS, SAVED), intensity_light: '5' } })
    for (const text of ['강도 배율', '가벼움', '걷기, 전기자전거', '기본값 1배', '바꾼 값 1배 → 5배', '문장', '오류', NOTE_LABEL]) {
      const match = out.match(new RegExp(`<(label|legend|p)[^>]*class="([^"]*)"[^>]*>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
      expect(match, text).not.toBeNull()
      expect(match?.[2], text).toContain('break-keep')
      expect(match?.[2], text).toContain('wrap-break-word')
    }
  })
})
