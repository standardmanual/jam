/**
 * 패턴 만들기·고치기 폼의 렌더 (티켓 20261008_1617 ⑩a-2, 채원 판정 「⑩a 만들기·고치기·상태」)
 *
 * 저장소에 jsdom·testing-library가 없어(`patternDetail.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양을 고정한다:
 * - 5구역과 레일 목차, 필수 표시, 저장 버튼 비활성(안 고침), 「바뀐 칸 0개」(고치기만), 안내 문장, 취소가 되돌아갈 링크, 번호·출처·상태 칸 없음
 * - 칸 부품: 오류가 같은 칸 아래 붉은 글로 붙고 `aria-invalid`·`aria-describedby`로 이어진다, 글자 수는 상한 80%부터, 메뉴 10개·샘플 20개 상한
 * - 저장 실패 알림: 붉은 실패 / 고치기 충돌(+[최신 내용 불러오기]) / 만들기 충돌(버튼 없음)
 * 클릭으로 일어나는 저장·충돌·불러오기 흐름은 브라우저 동작이라 여기서 다루지 않는다(요청·응답 가르기는 `patternSubmit.test.ts`).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-patterns/new',
  useSearchParams: () => new URLSearchParams(''),
}))

import { OpsPatternForm, ChangedFieldsList, PATTERN_FORM_NOTE, PATTERN_FORM_SECTIONS, PatternFailureAlerts } from '../OpsPatternForm'
import { CardShapeRows, CharCount, KnobGroups, MenuChips, SampleRows, TextField, nextSampleNo } from '../OpsPatternFormParts'
import { draftFromRecord, emptyDraft } from '@/lib/admin/opsPatterns/formDraft'

const html = (node: ReactElement) => renderToStaticMarkup(node)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 글자로 그 버튼을 찾아 여는 태그부터 닫는 태그까지 돌려준다. */
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

const RECORD = {
  name: '비 오는 날 카페',
  principle: '비가 오면 카페에서 쓰는 배지를 연다',
  userExperience: '비 오는 날 알림을 받는다',
  menus: ['홈피드', '탐색'],
  samples: [
    { no: 1, name: '첫째 샘플', role: 'main', impl: '본체' },
    { no: 2, name: '둘째 샘플', role: 'aux', impl: '' },
  ],
  cardShapes: [{ shape: 'hero', note: '큰 사진' }],
  knobs: {
    condition: { open: '비 오는 날', closed: '평일 낮' },
    place: { open: '카페', closed: '병원' },
    time: { open: '', closed: '' },
    reward: { open: '', closed: '' },
    tribe: { rule: '한 트라이브만', example: '야행성' },
  },
  pitfalls: '비가 안 오면 비어 보여요',
}

const header = <h1>머리</h1>

describe('만들기 폼', () => {
  const out = flat(<OpsPatternForm mode="create" initial={emptyDraft()} header={header} />)

  it('5구역이 순서대로 있고 레일 목차가 각 구역으로 이어진다', () => {
    const positions = PATTERN_FORM_SECTIONS.map((section) => out.indexOf(`id="pattern-form-section-${section.id}"`))
    expect(positions.every((position) => position > 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(PATTERN_FORM_SECTIONS.map((section) => section.label)).toEqual(['기본', '메뉴와 카드 모양', '손잡이', '샘플', '주의점'])
    for (const section of PATTERN_FORM_SECTIONS) expect(out).toContain(`href="#pattern-form-section-${section.id}"`)
  })

  it('필수 칸 셋(이름·작동 원리·유저가 겪는 것)에 필수 표시가 있다', () => {
    for (const path of ['name', 'principle', 'userExperience']) {
      const tag = new RegExp(`<(?:input|textarea)[^>]*id="pattern-field-${path}"[^>]*>`).exec(out)?.[0] ?? ''
      expect(tag).toContain('aria-required="true"')
    }
    expect(out).toContain('<span class="sr-only"> (필수)</span>')
    // 주의점·손잡이는 선택이다
    expect(new RegExp('<textarea[^>]*id="pattern-field-pitfalls"[^>]*>').exec(out)?.[0]).not.toContain('aria-required')
  })

  it('고친 칸이 없으면 저장이 꺼져 있고 「저장 전」 칩이 없다', () => {
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(true)
    expect(out).not.toContain('저장 전')
  })

  it('안내 문장이 있고 확인창은 처음에 닫혀 있다 (저장은 확인창 없이)', () => {
    expect(out).toContain(PATTERN_FORM_NOTE)
    expect(PATTERN_FORM_NOTE).toBe('이전 내용은 남지 않아요. 저장하면 에이전트가 바로 새 내용을 읽어요')
    expect(out).not.toContain('role="alertdialog"')
  })

  it('만들기에는 「바뀐 칸」 목록이 없고 취소는 목록으로 가는 링크다', () => {
    expect(out).not.toContain('바뀐 칸')
    expect(out).toMatch(/<a[^>]*href="\/admin\/ops-patterns"[^>]*>취소<\/a>/)
  })

  it('번호·출처·상태를 고르는 칸이 없다', () => {
    expect(out).not.toContain('pattern-field-patternNo')
    expect(out).not.toContain('pattern-field-status')
    expect(out).not.toContain('pattern-field-origin')
  })

  it('손잡이 5종과 샘플·카드 모양 더하기 버튼이 있다', () => {
    for (const label of ['조건', '장소', '시간', '보상', '트라이브']) expect(out).toContain(`>${label}</p>`)
    expect(out).toContain('열 수 있는 값')
    expect(out).toContain('닫은 값')
    expect(out).toContain('>규칙<')
    expect(out).toContain('>예시<')
    expect(out).toContain('샘플 더하기')
    expect(out).toContain('카드 모양 더하기')
    expect(out).toContain('aria-label="쓰는 메뉴 이름"')
  })
})

describe('고치기 폼', () => {
  const initial = draftFromRecord(RECORD as never)
  const out = flat(<OpsPatternForm mode="edit" patternNo="P03" updatedAt="2026-10-08T07:05:00.123456+00:00" initial={initial} header={header} />)

  it('읽어 온 값이 칸에 채워져 있다', () => {
    expect(out).toContain('value="비 오는 날 카페"')
    expect(out).toContain('비가 오면 카페에서 쓰는 배지를 연다</textarea>')
    expect(out).toContain('홈피드')
    expect(out).toContain('첫째 샘플')
    expect(out).toContain('샘플 2')
    expect(out).toContain('한 트라이브만</textarea>')
  })

  it('안 고쳤으면 저장이 꺼져 있고 「바뀐 칸 0개」가 보인다', () => {
    expect(isDisabled(buttonOf(out, '저장하기'))).toBe(true)
    expect(out).toContain('바뀐 칸 0개')
  })

  it('취소는 상세로 돌아가는 링크다', () => {
    expect(out).toMatch(/<a[^>]*href="\/admin\/ops-patterns\/P03"[^>]*>취소<\/a>/)
  })

  it('안내 문장이 있다', () => {
    expect(out).toContain(PATTERN_FORM_NOTE)
  })
})

describe('바뀐 칸 목록', () => {
  it('개수와 칸 이름을 보인다', () => {
    const out = flat(<ChangedFieldsList fields={['이름', '손잡이 · 장소', '샘플']} />)
    expect(out).toContain('바뀐 칸 3개')
    for (const name of ['이름', '손잡이 · 장소', '샘플']) expect(out).toContain(`<li class="break-words">${name}</li>`)
  })
})

describe('칸 오류', () => {
  it('오류 문장이 같은 칸 아래에 붙고 칸이 aria-invalid로 이어진다', () => {
    const out = flat(<TextField path="name" label="이름" required value="" error="이름을 적어 주세요." onChange={() => {}} />)
    expect(out).toContain('id="pattern-field-name-error"')
    expect(out).toContain('이름을 적어 주세요.')
    const input = /<input[^>]*>/.exec(out)?.[0] ?? ''
    expect(input).toContain('aria-invalid="true"')
    expect(input).toContain('aria-describedby="pattern-field-name-error"')
    expect(input).toContain('border-destructive')
  })

  it('오류가 없으면 aria-invalid도 오류 문장도 없다', () => {
    const out = flat(<TextField path="name" label="이름" required value="이름" onChange={() => {}} />)
    expect(out).not.toContain('aria-invalid')
    expect(out).not.toContain('-error')
  })

  it('샘플 오류는 경로(samples.2.role)가 가리키는 그 줄의 그 칸 아래에 붙는다', () => {
    const rows = [
      { no: '1', name: 'a', role: 'main' as const, impl: '' },
      { no: '2', name: 'b', role: 'aux' as const, impl: '' },
      { no: '3', name: 'c', role: '' as const, impl: '' },
    ]
    const out = flat(<SampleRows rows={rows} errors={{ 'samples.2.role': '샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.' }} onChange={() => {}} />)
    const at = out.indexOf('id="pattern-field-samples-2-role-error"')
    expect(at).toBeGreaterThan(out.indexOf('샘플 3'))
    expect(out).toContain('샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.')
    expect(out.match(/ id="[^"]*-error"/g)).toHaveLength(1)
    const trigger = /<button[^>]*id="pattern-field-samples-2-role"[^>]*>/.exec(out)?.[0] ?? ''
    expect(trigger).toContain('aria-invalid="true"')
    expect(trigger).toContain('aria-describedby="pattern-field-samples-2-role-error"')
  })

  it('카드 모양 오류와 손잡이 오류도 자기 칸 아래에 붙는다', () => {
    const shapes = flat(<CardShapeRows rows={[{ shape: '', note: '' }]} errors={{ 'cardShapes.0.shape': '카드 모양은 hero 중에서 골라 주세요.' }} onChange={() => {}} />)
    expect(shapes).toContain('id="pattern-field-cardShapes-0-shape-error"')
    const knobs = flat(
      <KnobGroups
        knobs={emptyDraft().knobs}
        errors={{ 'knobs.place.open': '장소 열린 값은 2,000자까지 적을 수 있어요. 줄여서 다시 적어 주세요.' }}
        onChange={() => {}}
      />
    )
    expect(knobs).toContain('id="pattern-field-knobs-place-open-error"')
  })

  it('메뉴 칩 오류(menus.1)와 목록 오류(menus)가 보인다', () => {
    const out = flat(<MenuChips menus={['홈피드', '']} errors={{ 'menus.1': '메뉴 이름을 적어 주세요.', menus: '메뉴는 10개까지 넣을 수 있어요.' }} onChange={() => {}} />)
    expect(out).toContain('id="pattern-field-menus-1-error"')
    expect(out).toContain('id="pattern-field-menus-error"')
  })
})

describe('글자 수와 상한', () => {
  it('글자 수는 상한의 80%부터 보이고 넘으면 붉다', () => {
    expect(flat(<CharCount length={47} max={60} />)).toBe('')
    expect(flat(<CharCount length={48} max={60} />)).toContain('48 / 60')
    const over = flat(<CharCount length={61} max={60} />)
    expect(over).toContain('61 / 60')
    expect(over).toContain('text-destructive')
  })

  it('메뉴가 10개 차면 더하기와 입력이 꺼지고 안내가 보인다', () => {
    const menus = Array.from({ length: 10 }, (_, index) => `메뉴${index + 1}`)
    const out = flat(<MenuChips menus={menus} errors={{}} onChange={() => {}} />)
    expect(isDisabled(buttonOf(out, '더하기'))).toBe(true)
    expect(out).toContain('메뉴는 10개까지 넣을 수 있어요')
    expect(out).toContain('aria-label="메뉴1 지우기"')
    const few = flat(<MenuChips menus={['홈피드']} errors={{}} onChange={() => {}} />)
    expect(few).not.toContain('메뉴는 10개까지')
  })

  it('샘플이 20개 차면 더하기가 꺼지고, 줄마다 지우기 버튼이 있다', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ no: String(index + 1), name: `샘플${index + 1}`, role: 'main' as const, impl: '' }))
    const out = flat(<SampleRows rows={rows} errors={{}} onChange={() => {}} />)
    expect(isDisabled(buttonOf(out, '샘플 더하기'))).toBe(true)
    expect(out).toContain('샘플은 20개까지 넣을 수 있어요')
    expect(out).toContain('aria-label="샘플 20 지우기"')
    const few = flat(<SampleRows rows={rows.slice(0, 2)} errors={{}} onChange={() => {}} />)
    expect(isDisabled(buttonOf(few, '샘플 더하기'))).toBe(false)
  })

  it('새 샘플 번호는 지금 있는 가장 큰 숫자 + 1이다', () => {
    expect(nextSampleNo([])).toBe('1')
    expect(
      nextSampleNo([
        { no: '3', name: '', role: '', impl: '' },
        { no: 'x', name: '', role: '', impl: '' },
        { no: '1', name: '', role: '', impl: '' },
      ])
    ).toBe('4')
  })
})

describe('저장 실패 알림', () => {
  const noop = () => {}

  it('실패가 없으면 아무것도 그리지 않는다', () => {
    expect(html(<PatternFailureAlerts failure={null} reloading={false} onReload={noop} />)).toBe('')
  })

  it('저장 실패는 붉은 알림이고 입력이 남아 있다고 알린다', () => {
    const out = flat(<PatternFailureAlerts failure={{ kind: 'error', message: '패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }} reloading={false} onReload={noop} />)
    expect(out).toContain('저장하지 못했어요')
    expect(out).toContain('패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(out).toContain('입력한 값은 그대로 있어요')
    expect(out).not.toContain('최신 내용 불러오기')
  })

  it('고치기 충돌은 경고 알림과 [최신 내용 불러오기]를 보인다 (눌러도 곧바로 지우지 않고 확인창을 거친다)', () => {
    const out = flat(<PatternFailureAlerts failure={{ kind: 'conflict', message: '그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.' }} reloading={false} onReload={noop} />)
    expect(out).toContain('그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.')
    expect(buttonOf(out, '최신 내용 불러오기')).not.toBe('')
    expect(isDisabled(buttonOf(out, '최신 내용 불러오기'))).toBe(false)
  })

  it('불러오는 중에는 [최신 내용 불러오기]가 꺼진다', () => {
    const out = flat(<PatternFailureAlerts failure={{ kind: 'conflict', message: '충돌' }} reloading onReload={noop} />)
    expect(isDisabled(buttonOf(out, '최신 내용 불러오기'))).toBe(true)
  })

  it('만들기 충돌은 서버 문장만 보이고 불러오기 버튼이 없다', () => {
    const out = flat(<PatternFailureAlerts failure={{ kind: 'create-conflict', message: '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.' }} reloading={false} onReload={noop} />)
    expect(out).toContain('그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.')
    expect(out).not.toContain('최신 내용 불러오기')
    expect(out).not.toContain('<button')
  })
})
