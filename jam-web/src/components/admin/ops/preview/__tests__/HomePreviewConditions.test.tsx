/**
 * 홈피드 미리보기의 조건 줄 (티켓 20261026_2025 2회차)
 *
 * Radix `Select`의 값 글자는 브라우저에서만 채워져 서버 렌더로는 보이지 않는다. 훅이 없는 `HomePreviewConditionsRow`를 함수로 불러
 * 얻은 요소 트리에서 선택지와 값 연결을 확인하고, 바꿀 때 바깥으로 나가는 조건(`onChange`)을 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/preview/__tests__/HomePreviewConditions.test.tsx
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Select, SelectItem, SelectTrigger } from '@/components/admin/ui/select'
import { HomePreviewConditionsRow } from '../HomePreviewConditions'
import { DEFAULT_CONDITIONS, type HomePreviewConditions } from '../homePreviewClient'

type El = ReactElement<Record<string, unknown>>

function findAll(node: ReactNode, match: (element: El) => boolean): El[] {
  const found: El[] = []
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit)
    if (!isValidElement<Record<string, unknown>>(current)) return
    if (match(current)) found.push(current)
    visit(current.props.children as ReactNode)
  }
  visit(node)
  return found
}

const TRIBES = [
  { id: '11111111-1111-4111-8111-111111111111', name: '러너' },
  { id: '22222222-2222-4222-8222-222222222222', name: '라이더' },
]

function row(over: Partial<Parameters<typeof HomePreviewConditionsRow>[0]> = {}) {
  const onChange = vi.fn<(next: HomePreviewConditions) => void>()
  const tree = HomePreviewConditionsRow({
    fromDate: '2026-10-05',
    onFromDateChange: vi.fn(),
    conditions: DEFAULT_CONDITIONS,
    onChange,
    tribes: TRIBES,
    storedWeatherName: null,
    missingStored: [],
    ...over,
  })
  return { tree, onChange }
}

/** aria-label이 label인 Select 하나 */
function selectOf(tree: ReactNode, label: string): El {
  const selects = findAll(tree, (el) => el.type === Select).filter((select) => findAll(select, (el) => el.type === SelectTrigger && el.props['aria-label'] === label).length > 0)
  expect(selects).toHaveLength(1)
  return selects[0]
}

const optionsOf = (select: El) => findAll(select, (el) => el.type === SelectItem).map((item) => [item.props.value, item.props.children])

describe('HomePreviewConditionsRow', () => {
  it('트라이브 선택지는 «전체(트라이브 없음)»과 응답으로 받은 트라이브 목록이다', () => {
    const { tree } = row()
    expect(optionsOf(selectOf(tree, '트라이브'))).toEqual([
      ['__none__', '전체(트라이브 없음)'],
      [TRIBES[0].id, '러너'],
      [TRIBES[1].id, '라이더'],
    ])
  })

  it('트라이브를 고르면 tribeId가 바뀌고, «전체»를 고르면 null이 된다', () => {
    const { tree, onChange } = row()
    const select = selectOf(tree, '트라이브')
    ;(select.props.onValueChange as (v: string) => void)(TRIBES[1].id)
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, tribeId: TRIBES[1].id })
    ;(select.props.onValueChange as (v: string) => void)('__none__')
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, tribeId: null })
    expect(select.props.value).toBe('__none__')
  })

  it('시간대 선택지는 새벽·아침·낮·저녁·밤 다섯 개이고 기본은 아침이다', () => {
    const { tree } = row()
    const select = selectOf(tree, '시간대')
    expect(optionsOf(select)).toEqual([
      ['time_dawn', '새벽'],
      ['time_morning', '아침'],
      ['time_afternoon', '낮'],
      ['time_evening', '저녁'],
      ['time_night', '밤'],
    ])
    expect(select.props.value).toBe('time_morning')
  })

  it('날씨 선택지는 «저장된 값»과 맑음·흐림·비·극단이다. 저장된 날씨가 있으면 이름을 덧붙인다', () => {
    expect(optionsOf(selectOf(row().tree, '날씨'))).toEqual([
      ['stored', '저장된 값'],
      ['clear', '맑음'],
      ['mild', '흐림'],
      ['rain', '비'],
      ['extreme', '극단'],
    ])
    expect(optionsOf(selectOf(row({ storedWeatherName: '비' }).tree, '날씨'))[0]).toEqual(['stored', '저장된 값 (비)'])
    const { tree, onChange } = row()
    ;(selectOf(tree, '날씨').props.onValueChange as (v: string) => void)('rain')
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, weather: 'rain' })
  })

  const specialButtons = (tree: ReactNode) => findAll(tree, (el) => el.type === Button)

  it('특일은 «저장된 값»·공휴일·절기·기념일 토글이고 기본은 «저장된 값»이 눌려 있다', () => {
    const buttons = specialButtons(row().tree)
    expect(buttons.map((b) => [b.props.children, b.props['aria-pressed']])).toEqual([
      ['저장된 값', true],
      ['공휴일', false],
      ['절기', false],
      ['기념일', false],
    ])
  })

  it('특일을 고르면 «저장된 값»이 풀리고 고른 것만 남는다. 다 끄면 빈 배열(특일 없음)이다. «저장된 값»을 누르면 되돌아온다', () => {
    const first = row()
    ;(specialButtons(first.tree)[1].props.onClick as () => void)()
    expect(first.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, special: ['holiday_today'] })

    const second = row({ conditions: { ...DEFAULT_CONDITIONS, special: ['holiday_today'] } })
    ;(specialButtons(second.tree)[3].props.onClick as () => void)()
    expect(second.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, special: ['holiday_today', 'anniversary_today'] })
    ;(specialButtons(second.tree)[1].props.onClick as () => void)()
    expect(second.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, special: [] })
    ;(specialButtons(second.tree)[0].props.onClick as () => void)()
    expect(second.onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, special: 'stored' })
  })

  it('신규 유저를 체크하면 newUser가 참이 된다', () => {
    const { tree, onChange } = row()
    const [checkbox] = findAll(tree, (el) => el.type === Checkbox)
    ;(checkbox.props.onCheckedChange as (v: boolean) => void)(true)
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CONDITIONS, newUser: true })
  })

  it('시작 날짜를 바꾸면 날짜 형식일 때만 바깥에 알린다(미래 날짜도 고른다)', () => {
    const onFromDateChange = vi.fn()
    const { tree } = row({ onFromDateChange })
    const [input] = findAll(tree, (el) => el.props.type === 'date')
    const change = input.props.onChange as (event: { target: { value: string } }) => void
    change({ target: { value: '2026-12-30' } })
    change({ target: { value: '' } })
    expect(onFromDateChange).toHaveBeenCalledTimes(1)
    expect(onFromDateChange).toHaveBeenCalledWith('2026-12-30')
  })

  it('저장된 값이 없는 항목이 있으면 «저장된 값이 없어요» 한 줄을 그리고, 없으면 그리지 않는다', () => {
    const texts = (tree: ReactNode) => findAll(tree, (el) => el.type === 'p').map((p) => p.props.children)
    expect(texts(row({ missingStored: ['날씨', '특일'] }).tree)).toEqual(['저장된 값이 없어요: 날씨, 특일. 위에서 직접 골라 볼 수 있어요.'])
    expect(texts(row().tree)).toEqual([])
  })
})
