/**
 * 생태계 상황판 화면 부품 (티켓 20261026_2027 3-1) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다. 지키는 것:
 * - 정상·주의·중단·부족·읽지 못함·목표 없음 여섯 상태가 모두 기호와 글자로 그려진다
 * - 목표 대비 줄은 주의·중단이 맨 위로 오고, 막대의 목표 띠·현재 값 위치는 `%` 속성이며 인라인 `style`이 없다
 * - 값이 없는 칸은 막대 없이 「부족」과 사유(표본 N/M명·관찰 기간이 모자라요)만 보이고, 읽지 못한 줄은 고정 문장이다
 * - 순환 지도: 마디 10개가 `?node=` 링크이고 선택은 `aria-current`, 필드 순환 끝 인벤토리는 같은 마디로 가는 바로가기
 * - 정책 카드: 설정값 / 코드 고정 / 열린 요청 세 상태, 순환 밖 정책은 접힘 목록
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { ECOSYSTEM_NODE_IDS } from '@/lib/admin/ecosystem/types'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { EcosystemGoalRows } from '../EcosystemGoalRows'
import { EcosystemLoopMap } from '../EcosystemLoopMap'
import { EcosystemPolicyCard, LIVE_VALUE_MISSING_TEXT } from '../EcosystemPolicyCard'
import { EcosystemPolicyPanel } from '../EcosystemPolicyPanel'
import { EcosystemSummary } from '../EcosystemSummary'
import { barGeometry } from '../GoalBar'
import { GOAL_ROW_ERROR_TEXT, STATUS_LABEL, STATUS_SYMBOL } from '../format'
import { fixtureGoalRows, fixtureNodes, GENERATED_AT } from './fixtures'

const html = (element: React.ReactElement) => renderToStaticMarkup(element).replace(/<!-- -->/g, '')
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('EcosystemSummary', () => {
  it('주의 이상 N · 읽지 못함 M과 기준 시각(KST)을 쓴다', () => {
    const text = textOf(html(<EcosystemSummary attention={2} errors={1} generatedAt={GENERATED_AT} />))
    expect(text).toContain('주의 이상 2')
    expect(text).toContain('읽지 못함 1')
    expect(text).toContain('15:30')
  })

  it('0이면 경고 기호를 붙이지 않는다', () => {
    const markup = html(<EcosystemSummary attention={0} errors={0} generatedAt={GENERATED_AT} />)
    expect(textOf(markup)).toContain('주의 이상 0')
    expect(markup).not.toContain('▲')
    expect(markup).not.toContain('! ')
  })

  it('0보다 크면 기호가 앞에 붙는다 (색만으로 알리지 않는다)', () => {
    const markup = html(<EcosystemSummary attention={1} errors={3} generatedAt={GENERATED_AT} />)
    expect(markup).toContain('▲')
    expect(markup).toContain('!')
  })
})

describe('EcosystemGoalRows', () => {
  const markup = html(<EcosystemGoalRows rows={fixtureGoalRows()} />)

  it('주의·중단 줄이 맨 위고 그다음 읽지 못함·부족·정상·목표 없음 순이다', () => {
    const order = [...markup.matchAll(/<li data-policy-id="([^"]+)"/g)].map((match) => match[1])
    expect(order).toEqual([
      'ch19-kpi-stop',
      'ch19-kpi-warn',
      'ch19-kpi-error',
      'ch19-kpi-insufficient',
      'ch19-kpi-ok',
      'ch19-kpi-no-target',
    ])
  })

  it('여섯 상태가 모두 기호와 글자로 그려진다', () => {
    for (const status of ['ok', 'warn', 'stop', 'insufficient', 'error', 'no_target'] as const) {
      expect(markup).toContain(`data-status="${status}"`)
      expect(textOf(markup)).toContain(`${STATUS_SYMBOL[status]} ${STATUS_LABEL[status]}`)
    }
  })

  it('막대는 목표 띠와 현재 값을 % 속성으로 그리고 인라인 style이 없다', () => {
    // 중단 줄: 목표 0.25~0.5, 현재 0.125 → 띠 x 25% 너비 25%, 값 x 11.75%
    expect(markup).toContain('x="25%"')
    expect(markup).toContain('width="25%"')
    expect(markup).toContain('x="11.75%"')
    expect(markup).not.toContain('style=')
    expect(markup).toContain('aria-label="챕터 1: 현재 주 0.5번, 목표 주 1~2번"')
  })

  it('값이 없는 칸은 막대 없이 «부족»과 사유만 보인다', () => {
    const insufficient = markup.split('<li data-policy-id="ch19-kpi-insufficient"')[1].split('<li data-policy-id=')[0]
    expect(insufficient).not.toContain('<svg')
    expect(textOf(insufficient)).toContain('부족 · 표본 3/10명')
    expect(textOf(insufficient)).toContain('부족 · 관찰 기간이 모자라요')
    // 값 자리는 0이 아니라 «–»다
    expect(textOf(insufficient)).toContain('현재 – ·')
  })

  it('읽지 못한 정책은 고정 문장만 보인다', () => {
    const error = markup.split('<li data-policy-id="ch19-kpi-error"')[1].split('<li data-policy-id=')[0]
    expect(textOf(error)).toContain(GOAL_ROW_ERROR_TEXT)
    expect(error).not.toContain('<svg')
  })

  it('목표가 없는 칸은 «목표 없음»이고 막대가 없다', () => {
    const noTarget = markup.split('<li data-policy-id="ch19-kpi-no-target"')[1].split('<li data-policy-id=')[0]
    expect(textOf(noTarget)).toContain('목표 없음')
    expect(noTarget).not.toContain('<svg')
  })
})

describe('barGeometry', () => {
  it('목표가 한 점이어도 띠가 보이게 최소 너비를 둔다', () => {
    const { band } = barGeometry({ scaleMax: 2, low: 0.5, high: 0.5, value: 0.25 })
    expect(band).toEqual({ x: 50, width: 1.5 })
  })

  it('값이 눈금 밖이어도 막대 안에 붙는다', () => {
    const over = barGeometry({ scaleMax: 1, low: 0.2, high: 0.4, value: 1.4 })
    expect(over.value.x + over.value.width).toBeLessThanOrEqual(100)
    const under = barGeometry({ scaleMax: 1, low: 0.2, high: 0.4, value: -0.2 })
    expect(under.value.x).toBe(0)
  })

  it('띠가 오른쪽 끝에 닿아도 막대 밖으로 나가지 않는다', () => {
    const { band } = barGeometry({ scaleMax: 1, low: 1, high: 1, value: 0.5 })
    expect(band.x + band.width).toBeLessThanOrEqual(100)
  })
})

describe('EcosystemLoopMap', () => {
  const markup = (selected: Parameters<typeof EcosystemLoopMap>[0]['selected']) =>
    html(<EcosystemLoopMap nodes={fixtureNodes()} selected={selected} />)

  it('마디 10개가 모두 ?node= 링크이고 필드 쪽 인벤토리는 바로가기로 하나 더 있다', () => {
    const view = markup(null)
    for (const id of ECOSYSTEM_NODE_IDS) {
      expect(view).toContain(`href="/admin/ecosystem?node=${id}"`)
    }
    expect([...view.matchAll(/data-node="inventory"/g)]).toHaveLength(2)
    expect([...view.matchAll(/data-shortcut=""/g)]).toHaveLength(1)
    expect([...view.matchAll(/<a /g)]).toHaveLength(11)
  })

  it('성장 순환은 6마디가 화살표 5개로, 필드 순환은 3개로 이어진다 (SVG 선은 없다)', () => {
    const view = markup(null)
    const growth = view.split('data-loop="field"')[0]
    const field = view.split('data-loop="field"')[1]
    expect([...growth.matchAll(/→/g)]).toHaveLength(5)
    expect([...field.matchAll(/→/g)]).toHaveLength(3)
    expect(view).not.toContain('<svg')
  })

  it('필드 순환은 2층 카드(시스템/유저 드랍) 높이 오버플로우 방지를 위해 items-center와 flex-col gap-2를 쓴다', () => {
    const view = markup(null)
    const field = view.split('data-loop="field"')[1]
    expect(field).toContain('items-center')
    expect(field).toContain('flex flex-col gap-2')
  })

  it('선택하지 않으면 aria-current가 없고, 선택한 마디에만 붙는다', () => {
    expect(markup(null)).not.toContain('aria-current')
    const view = markup('capsule')
    expect([...view.matchAll(/aria-current="true"/g)]).toHaveLength(1)
    expect(view).toMatch(/<a [^>]*aria-current="true"[^>]*data-node="capsule"|<a [^>]*data-node="capsule"[^>]*aria-current="true"/)
  })

  it('인벤토리를 고르면 성장 쪽 마디와 필드 쪽 바로가기가 함께 선택 표시다', () => {
    expect([...markup('inventory').matchAll(/aria-current="true"/g)]).toHaveLength(2)
  })

  it('마디 카드가 상태·대표 값·보조 값·기간을 보인다', () => {
    const text = textOf(markup(null))
    expect(text).toContain('1,234건') // 활동 동기화
    expect(text).toContain('동기화 실패 건수 2건')
    expect(text).toContain('0잼') // 잼
    expect(text).toContain('쓴 잼 합계 40잼')
    expect(text).toContain('2,063건') // 지점
    expect(text).toContain('최근 7일')
    expect(text).toContain('30명 기준') // 밸런스 마디의 표본
  })

  it('표본이 부족한 밸런스 마디는 값 대신 사유를 쓴다', () => {
    const collection = markup(null).split('data-node="collection"')[1].split('data-node=')[0]
    expect(textOf(collection)).toContain('표본 3/10명')
    expect(textOf(collection)).toContain('–')
  })

  it('읽지 못한 마디는 고정 문장을 보이고 값은 «–»다', () => {
    const systemDrop = markup(null).split('data-node="system_drop"')[1].split('data-node=')[0]
    expect(textOf(systemDrop)).toContain('지표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  })

  it('여섯 상태가 마디 카드에 모두 나온다', () => {
    const view = markup(null)
    for (const status of ['ok', 'warn', 'stop', 'insufficient', 'error', 'no_target'] as const) {
      expect(view).toContain(`data-status="${status}"`)
    }
  })
})

const CHANGEABLE: PolicyItem = {
  id: 't-change',
  chapter: 8,
  chapterTitle: '인벤토리',
  title: '인벤토리 기본 칸 수',
  type: 'admin_link',
  currentSpec: '기본 20칸',
  defaultValue: 20,
  userExperience: '보관 칸',
  basisDoc: '운영 로직 8장',
  adminLink: { href: '/admin/balance#inventory', liveField: 'base_slots', unit: '칸' },
  nodes: ['inventory'],
}
const CODE_FIXED: PolicyItem = {
  id: 't-code',
  chapter: 8,
  chapterTitle: '인벤토리',
  title: '믹스 재료 수',
  type: 'code_constant',
  currentSpec: '5개 고정',
  userExperience: '재료',
  basisDoc: '운영 로직 8장',
  nodes: ['inventory'],
}
const OTHER: PolicyItem = {
  id: 't-other',
  chapter: 8,
  chapterTitle: '인벤토리',
  title: '오픈 전 대기 정책',
  type: 'pre_launch_pending',
  currentSpec: '오픈 전 확정',
  userExperience: '대기',
  basisDoc: '티켓',
  nodes: ['inventory'],
}
const OUTSIDE: PolicyItem = {
  id: 't-outside',
  chapter: 2,
  chapterTitle: '계정',
  title: '순환 밖 정책',
  type: 'code_constant',
  currentSpec: '고정',
  userExperience: '계정',
  basisDoc: '운영 로직 2장',
}

describe('EcosystemPolicyCard', () => {
  it('설정값 정책: 현재 값(단위 포함)과 [값 바꾸기] 링크를 보이고 개발 요청은 없다', () => {
    const view = html(<EcosystemPolicyCard policy={CHANGEABLE} liveValues={{ base_slots: 24 }} openRequest={null} />)
    expect(textOf(view)).toContain('현재 값: 24칸')
    expect(textOf(view)).toContain('(기본값 20칸)')
    expect(view).toContain('href="/admin/balance#inventory"')
    expect(textOf(view)).toContain('값 바꾸기')
    expect(textOf(view)).not.toContain('개발 요청')
  })

  it('설정값을 읽지 못했으면 값을 지어내지 않고 안내만 쓴다', () => {
    const view = html(<EcosystemPolicyCard policy={CHANGEABLE} liveValues={{}} openRequest={null} />)
    expect(textOf(view)).toContain(LIVE_VALUE_MISSING_TEXT)
    expect(textOf(view)).not.toContain('undefined')
    expect(view).toContain('href="/admin/balance#inventory"')
  })

  it('코드 고정 정책: [개발 요청] 버튼이 있고 값 바꾸기 링크는 없다', () => {
    const view = html(<EcosystemPolicyCard policy={CODE_FIXED} liveValues={{}} openRequest={null} />)
    expect(textOf(view)).toContain('개발 요청')
    expect(textOf(view)).not.toContain('값 바꾸기')
    expect(textOf(view)).not.toContain('접수됨')
  })

  it('열린 요청이 있는 코드 고정 정책: 버튼 대신 «요청 N번 접수됨»과 [접기]', () => {
    const view = html(<EcosystemPolicyCard policy={CODE_FIXED} liveValues={{}} openRequest={{ id: 'req-1', no: 5 }} />)
    expect(textOf(view)).toContain('요청 5번 접수됨')
    expect(textOf(view)).toContain('접기')
    expect(view).not.toContain('>개발 요청<')
  })

  it('그 밖의 정책(오픈 전 대기 등)은 기준 글자만 보인다', () => {
    const view = html(<EcosystemPolicyCard policy={OTHER} liveValues={{}} openRequest={null} />)
    expect(textOf(view)).toContain('오픈 전 확정')
    expect(textOf(view)).not.toContain('값 바꾸기')
    expect(textOf(view)).not.toContain('개발 요청')
  })
})

describe('EcosystemPolicyPanel', () => {
  const policies = [OUTSIDE, OTHER, CODE_FIXED, CHANGEABLE]

  it('마디를 고르면 설정값 → 코드 고정 → 그 밖 순서로 열린다', () => {
    const view = html(
      <EcosystemPolicyPanel nodeId="inventory" policies={policies} liveValues={{ base_slots: 20 }} openRequests={new Map()} />
    )
    expect(textOf(view)).toContain('인벤토리 정책')
    const order = [...view.matchAll(/data-policy-id="(t-[a-z]+)"/g)].map((match) => match[1])
    expect(order.filter((id) => id !== 't-outside')).toEqual(['t-change', 't-code', 't-other'])
  })

  it('정책 ID로 찾은 열린 요청이 해당 카드에 이어진다', () => {
    const view = html(
      <EcosystemPolicyPanel
        nodeId="inventory"
        policies={policies}
        liveValues={{}}
        openRequests={new Map([['t-code', { id: 'req-1', no: 8 }]])}
      />
    )
    expect(textOf(view)).toContain('요청 8번 접수됨')
  })

  it('마디를 고르지 않으면 안내만 보이고 정책 카드는 없다', () => {
    const view = html(<EcosystemPolicyPanel nodeId={null} policies={policies} liveValues={{}} openRequests={new Map()} />)
    expect(textOf(view)).toContain('지도에서 마디를 누르면')
    expect(view).not.toContain('data-policy-type')
  })

  it('걸린 정책이 없는 마디는 빈 목록 안내다', () => {
    const view = html(<EcosystemPolicyPanel nodeId="pickup" policies={policies} liveValues={{}} openRequests={new Map()} />)
    expect(textOf(view)).toContain('이 마디에 걸린 정책이 없어요')
  })

  it('순환 밖 정책은 접힘 목록에 개수와 함께 둔다', () => {
    const view = html(<EcosystemPolicyPanel nodeId={null} policies={policies} liveValues={{}} openRequests={new Map()} />)
    const outside = view.split('data-outside-loop=""')[1]
    expect(textOf(outside)).toContain('순환 밖 정책 1개')
    expect(textOf(outside)).toContain('순환 밖 정책')
    expect(view).not.toContain('<details open')
  })

  it('실제 정책 데이터에서 인벤토리 마디를 고르면 정책이 하나 이상 열린다', () => {
    const view = html(
      <EcosystemPolicyPanel nodeId="inventory" policies={POLICIES_DATA} liveValues={{}} openRequests={new Map()} />
    )
    expect(view).toContain('data-policy-type')
  })
})

describe('화면 소스 규칙', () => {
  const dir = path.resolve(__dirname, '..')
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), 'utf8') }))

  it('인라인 style을 쓰지 않는다', () => {
    for (const { name, text } of sources) expect(text, name).not.toMatch(/style=\{/)
  })

  it('DevRequestButton은 서버 모듈을 가져오지 않는다', () => {
    const button = readFileSync(path.join(dir, 'DevRequestButton.tsx'), 'utf8')
    expect(button.startsWith("'use client'")).toBe(true)
    expect(button).not.toMatch(/from '@\/lib\/supabase/)
    expect(button).not.toMatch(/devRequests\/store/)
    expect(button).not.toMatch(/ecosystem\/load/)
  })
})
