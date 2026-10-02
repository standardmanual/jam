/**
 * 예약 등록 버튼과 요약창의 초기 렌더 (티켓 20261002_1648, 운영툴 PRD §8.2)
 *
 * 저장소에 jsdom·testing-library가 없어(`render.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * - 버튼 문구: 예약할 항목 수 N이 있으면 「N개 예약 등록하기」, 0이면 「예약 등록하기」(끄지 않는다)
 * - 요약창: 구역 순서와 문구, 연결 묶음은 한 덩어리, 경고, 시험 묶음 문장, 비어 있는 구역은 그리지 않는다
 * - 주 버튼: 「N개 예약 등록하기」 · 「실패로 닫기」 · 꺼짐(「지금 예약할 수 있는 항목이 없어요」), 진행형 문구
 * - 불러오는 중·실패는 창 안 문장이고 주 버튼은 꺼진다
 * - 소스 계약: 「공개는 아직 연결 전이에요」가 화면 소스에서 사라졌고, 화면은 레지스트리·사전 점검 모듈을 값으로 가져오지 않는다
 * 열기 → 사전 점검 요청 → 실행 → 토스트 흐름은 브라우저 동작이라 여기서 다루지 않는다(순수 함수는 `executeView.test.ts`, 호출은 `executeClient.test.ts`).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { TooltipProvider } from '@/components/admin/ui/tooltip'
import { AlertDialog } from '@/components/admin/ui/alert-dialog'
import { buildExecuteSummary, type PrecheckView, type SummarySource } from '@/lib/admin/opsInbox/executeView'
import { OpsExecuteBundle, OpsExecutePanel } from '../OpsExecuteBundle'

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')
/** 확인창 껍데기 안쪽 부품은 Radix 창 문맥이 필요해 열린 창으로 감싸서 그린다(포털은 쓰지 않는다). */
const inDialog = (node: ReactElement) => flat(<AlertDialog open>{node}</AlertDialog>)
/** 글자로 그 버튼을 찾아 여는 태그부터 닫는 태그까지 돌려준다. */
const buttonOf = (out: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(out)?.[0] ?? ''
/** 여는 태그에 `disabled` 속성이 있는지(클래스 이름의 `disabled:`는 세지 않는다). */
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(tag)

function source(id: string, overrides: Partial<SummarySource> = {}): SummarySource {
  return {
    id,
    position: Number(id.replace(/\D/g, '')) || 0,
    kind: 'home_feed_card',
    startsAt: '2026-10-05T00:00:00Z',
    original: { user_experience: `${id} 경험` },
    edited: null,
    ...overrides,
  }
}

const ITEMS: SummarySource[] = [
  source('a1', { startsAt: '2026-10-07T00:00:00Z' }),
  source('a2', { startsAt: '2026-10-05T00:00:00Z' }),
  source('a3', { startsAt: '2026-10-06T00:00:00Z' }),
  source('a4'),
  source('a5'),
  source('a6'),
]

function precheck(overrides: Partial<PrecheckView> = {}): PrecheckView {
  return { ready: [], waiting: [], blocked: [], failClose: [], groups: [], warnings: [], ...overrides }
}

const noop = () => {}
const panel = (summary: ReturnType<typeof buildExecuteSummary> | null, extra: Partial<Parameters<typeof OpsExecutePanel>[0]> = {}) =>
  inDialog(<OpsExecutePanel summary={summary} onConfirm={noop} onCancel={noop} {...extra} />)

describe('OpsExecuteBundle — 버튼', () => {
  const props = { bundleId: 'bundle-1', items: [], isSample: false, onExecuted: noop, onConflict: noop }

  it('예약할 항목이 N개면 「N개 예약 등록하기」다', () => {
    const out = flat(<OpsExecuteBundle {...props} readyCount={3} />)
    expect(out).toContain('>3개 예약 등록하기<')
  })

  it('예약할 항목이 0개면 「예약 등록하기」이고, 눌러서 이유를 볼 수 있게 끄지 않는다', () => {
    const out = flat(<OpsExecuteBundle {...props} readyCount={0} />)
    expect(out).toContain('>예약 등록하기<')
    expect(isDisabled(buttonOf(out, '예약 등록하기'))).toBe(false)
  })

  it('요약창은 처음에 닫혀 있다(열 때 사전 점검 요청을 보낸다)', () => {
    const out = flat(<OpsExecuteBundle {...props} readyCount={3} />)
    expect(out).not.toContain('예약 등록 전에 확인해 주세요')
    expect(out).not.toContain('role="alertdialog"')
  })
})

describe('OpsExecutePanel — 구역', () => {
  const full = buildExecuteSummary(
    precheck({
      ready: ['a1', 'a2'],
      groups: [{ executeIds: ['a2'] }, { executeIds: ['a1'] }],
      waiting: ['a3'],
      blocked: [{ id: 'a4', reasons: ['공개 시각이 이미 지났어요', '아직 연결하지 않은 종류예요'] }],
      failClose: [{ id: 'a5', reason: '연결된 미션이 반려됐어요' }],
      warnings: [{ itemIds: ['a1', 'a2'], message: '연결된 항목의 공개 시각이 서로 달라요' }],
    }),
    ITEMS,
    false
  )

  it('제목은 「예약 등록 전에 확인해 주세요」이고 보조 버튼은 「닫기」다', () => {
    const out = panel(full)
    expect(out).toContain('예약 등록 전에 확인해 주세요')
    expect(out).toContain('>닫기<')
    expect(out).not.toContain('>취소<')
  })

  it('네 구역이 예약할 항목 → 기다리는 항목 → 예약할 수 없는 항목 → 실패로 닫을 항목 → 경고 순으로 나온다', () => {
    const out = panel(full)
    const order = [
      '예약할 항목 2개',
      '기다리는 항목 1개',
      '예약할 수 없는 항목 1개',
      '실패로 닫을 항목 1개',
      '연결된 항목의 공개 시각이 서로 달라요',
    ].map((text) => out.indexOf(text))
    expect(order.every((at) => at > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('예약할 항목은 공개 시각 순이고 이름은 목록 행과 같은 표시(종류 · 공개 시각 시작 · 유저가 겪는 것)다', () => {
    const out = panel(full)
    expect(out).toContain('홈피드 카드 · 10/5(월) 09:00 시작 · a2 경험')
    expect(out.indexOf('a2 경험')).toBeLessThan(out.indexOf('a1 경험'))
  })

  it('기다리는 항목에는 사전 점검 문장, 예약할 수 없는 항목에는 이유, 실패로 닫을 항목에는 이유와 「예약 등록하면 실패로 닫혀요」가 붙는다', () => {
    const out = panel(full)
    expect(out).toContain('연결된 항목이 아직 결정 전이에요')
    expect(out).toContain('공개 시각이 이미 지났어요 · 아직 연결하지 않은 종류예요')
    expect(out).toContain('연결된 미션이 반려됐어요. 예약 등록하면 실패로 닫혀요')
  })

  it('경고는 warning 상자로 그리고 가리키는 항목 이름을 함께 보인다', () => {
    const out = panel(full)
    expect(out).toContain('border-amber-300')
    const warning = out.slice(out.indexOf('연결된 항목의 공개 시각이 서로 달라요'))
    expect(warning).toContain('a1 경험')
    expect(warning).toContain('a2 경험')
  })

  it('연결 묶음은 한 덩어리(중첩 목록)로 묶어 보이고 안은 생성 순서다', () => {
    const summary = buildExecuteSummary(
      precheck({ ready: ['a1', 'a2', 'a3'], groups: [{ executeIds: ['a3', 'a1'] }, { executeIds: ['a2'] }] }),
      ITEMS,
      false
    )
    const out = panel(summary)
    // 묶음은 목록 안의 목록이다
    expect(out).toMatch(/<li><ul[^>]*border-l-2[^>]*><li[^>]*>.*a3 경험.*<\/li><li[^>]*>.*a1 경험.*<\/li><\/ul><\/li>/)
    // 묶음 밖의 단독 항목(a2)은 중첩 목록이 아니다
    expect(out.match(/border-l-2/g)).toHaveLength(1)
    // 덩어리는 가장 이른 공개 시각 자리에 놓인다: a2(10/5) → 묶음(a3 10/6, a1 10/7)
    expect(out.indexOf('a2 경험')).toBeLessThan(out.indexOf('a3 경험'))
    expect(out.indexOf('a3 경험')).toBeLessThan(out.indexOf('a1 경험'))
  })

  it('비어 있는 구역은 그리지 않는다', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false))
    expect(out).toContain('예약할 항목 1개')
    for (const text of ['기다리는 항목', '예약할 수 없는 항목', '실패로 닫을 항목', 'border-amber-300']) expect(out).not.toContain(text)
  })

  it('시험 묶음이면 「시험 묶음이라 자원은 만들지 않아요」가 붙고, 아니면 없다', () => {
    expect(panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, true))).toContain('시험 묶음이라 자원은 만들지 않아요')
    expect(panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false))).not.toContain('시험 묶음이라')
  })

  it('긴 목록은 창 안에서 스크롤한다', () => {
    expect(panel(full)).toMatch(/class="[^"]*max-h-\[50vh\][^"]*overflow-y-auto/)
  })

  it('제출 문자열은 HTML로 해석되지 않는다', () => {
    // 이름은 24자까지만 보이므로 그 안에 드는 문자열로 확인한다.
    const evil = source('a1', { original: { user_experience: '<img src=x onerror=1>' } })
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), [evil], false))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
  })
})

describe('OpsExecutePanel — 주 버튼', () => {
  it('예약할 항목이 있으면 「N개 예약 등록하기」이고 켜져 있다(실패로 닫을 항목이 함께 있어도)', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1', 'a2'], failClose: [{ id: 'a5', reason: '이유' }] }), ITEMS, false))
    const button = buttonOf(out, '2개 예약 등록하기')
    expect(button).not.toBe('')
    expect(isDisabled(button)).toBe(false)
    expect(out).not.toContain('지금 예약할 수 있는 항목이 없어요')
  })

  it('예약할 항목은 0개여도 실패로 닫을 항목이 있으면 주 버튼은 「실패로 닫기」이고 켜져 있다', () => {
    const out = panel(buildExecuteSummary(precheck({ failClose: [{ id: 'a5', reason: '연결된 미션이 반려됐어요' }] }), ITEMS, false))
    const button = buttonOf(out, '실패로 닫기')
    expect(button).not.toBe('')
    expect(isDisabled(button)).toBe(false)
    expect(out).not.toContain('개 예약 등록하기')
    expect(out).not.toContain('지금 예약할 수 있는 항목이 없어요')
  })

  it('예약할 항목도 실패로 닫을 항목도 없으면 주 버튼이 꺼지고 「지금 예약할 수 있는 항목이 없어요」가 보인다(기다리는·못 하는 항목 이유는 그대로 보인다)', () => {
    const out = panel(buildExecuteSummary(precheck({ waiting: ['a3'], blocked: [{ id: 'a4', reasons: ['공개 시각이 없어요'] }] }), ITEMS, false))
    expect(isDisabled(buttonOf(out, '예약 등록하기'))).toBe(true)
    expect(out).toContain('지금 예약할 수 있는 항목이 없어요')
    expect(out).toContain('기다리는 항목 1개')
    expect(out).toContain('공개 시각이 없어요')
  })

  it('처리 중에는 진행형 문구이고 두 버튼이 모두 꺼진다', () => {
    const schedule = buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false)
    const running = panel(schedule, { pending: true })
    expect(isDisabled(buttonOf(running, '예약 등록하는 중'))).toBe(true)
    expect(isDisabled(buttonOf(running, '닫기'))).toBe(true)
    const closing = panel(buildExecuteSummary(precheck({ failClose: [{ id: 'a5', reason: '이유' }] }), ITEMS, false), { pending: true })
    expect(isDisabled(buttonOf(closing, '실패로 닫는 중'))).toBe(true)
  })

  it('실행 실패 문장은 요약을 그대로 둔 채 창 안에 붉은 글로 보인다', () => {
    const out = panel(buildExecuteSummary(precheck({ ready: ['a1'] }), ITEMS, false), {
      error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
    })
    expect(out).toContain('role="alert"')
    expect(out).toContain('예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).toContain('예약할 항목 1개')
    expect(isDisabled(buttonOf(out, '1개 예약 등록하기'))).toBe(false)
  })
})

describe('OpsExecutePanel — 불러오는 중·점검 실패', () => {
  it('불러오는 중에는 안내 글만 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { loading: true })
    expect(out).toContain('사전 점검하는 중이에요')
    expect(out).toContain('예약 등록 전에 확인해 주세요')
    expect(isDisabled(buttonOf(out, '예약 등록하기'))).toBe(true)
    expect(isDisabled(buttonOf(out, '닫기'))).toBe(false)
  })

  it('사전 점검이 실패하면 서버 문장이 창 안에 보이고 주 버튼은 꺼져 있다', () => {
    const out = panel(null, { error: '사전 점검을 하지 못했어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(out).toContain('사전 점검을 하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(out).not.toContain('사전 점검하는 중이에요')
    expect(isDisabled(buttonOf(out, '예약 등록하기'))).toBe(true)
  })
})

// ── 소스 계약 ────────────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

/** 주석을 벗긴다. 설명 글이 규칙 검사에 걸리지 않게 한다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

/** 값으로 가져오는(`import type`이 아닌) 모듈 경로. 여러 줄 import도 한 문장으로 읽는다. */
function valueImportPaths(code: string): string[] {
  const statements = code.match(/^import\s[\s\S]*?\sfrom\s+'[^']+'/gm) ?? []
  return statements.filter((statement) => !/^import\s+type\b/.test(statement)).map((statement) => /'([^']+)'$/.exec(statement)?.[1] ?? '')
}

describe('소스 계약 — 예약 등록 화면 (티켓 20261002_1648)', () => {
  const screenFiles = [join(SRC, 'components/admin/ops'), join(SRC, 'app/admin/ops-inbox')]
    .flatMap((root) => walk(root))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${sep}__tests__${sep}`))

  it('화면 파일을 실제로 찾았다(빈 목록으로 통과하지 않는다)', () => {
    expect(screenFiles.length).toBeGreaterThan(12)
    expect(existsSync(join(SRC, 'components/admin/ops/OpsExecuteBundle.tsx'))).toBe(true)
  })

  it('「공개는 아직 연결 전이에요」가 화면 소스(주석 밖)에 없다', () => {
    const offenders = screenFiles.filter((file) => /공개는 아직 연결 전이에요/.test(stripComments(readFileSync(file, 'utf8')))).map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('승인 확인창은 「예약은 승인한 뒤 [예약 등록하기]에서 해요.」로 안내한다', () => {
    const code = readFileSync(join(SRC, 'components/admin/ops/OpsItemActions.tsx'), 'utf8')
    expect(code).toContain('예약은 승인한 뒤 [예약 등록하기]에서 해요.')
  })

  it('화면은 레지스트리·카드 핸들러·사전 점검·실행 모듈과 서버 조회 모듈을 값으로 가져오지 않는다(사전 점검은 서버 로더와 dryRun API로만)', () => {
    // `import type`은 번들에 들어가지 않으므로 허용한다. 값 import만 잡는다.
    const serverOnly = /^@\/lib\/admin\/opsInbox\/(execute\/|query$)/
    const offenders = screenFiles
      .filter((file) => file.includes(`${sep}components${sep}`) && valueImportPaths(readFileSync(file, 'utf8')).some((path) => serverOnly.test(path)))
      .map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('값 import를 찾는 도우미가 type import와 여러 줄 import를 구분한다(빈 검사로 통과하지 않는다)', () => {
    const code = [
      "import { a } from '@/lib/admin/opsInbox/execute/registry'",
      "import type { B } from '@/lib/admin/opsInbox/query'",
      'import {',
      '  c,',
      "} from '@/lib/admin/opsInbox/query'",
    ].join('\n')
    expect(valueImportPaths(code)).toEqual(['@/lib/admin/opsInbox/execute/registry', '@/lib/admin/opsInbox/query'])
  })
})
