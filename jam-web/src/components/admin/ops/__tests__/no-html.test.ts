/**
 * 제출 문자열은 HTML로 그리지 않는다 — 소스 계약 (티켓 20260930_1817)
 *
 * 받은 기획함에는 에이전트가 보낸 문자열(문안·가설·에이전트 이름·형식 오류 문장·제출 원본)이 그대로 들어온다. 이 문자열을
 * HTML로 해석하면 저장형 XSS가 된다. 화면(`components/admin/ops/**`, `app/admin/ops-inbox/**`, `app/admin/ops-schedule/**`와 일정표가 함께 쓰는
 * `app/admin/WeeklyCalendar.tsx`)은 React 텍스트 노드로만 그리고, 색 견본만 값이 `#rrggbb`를 통과할 때 `style`에 넣는다(주간 캘린더의 미션 막대 열 위치와
 * 타임라인의 격자 위치·오늘 선 위치는 날짜에서 계산한 숫자라 예외 두 곳이다). 이 테스트는 소스를 훑어 그 규칙이 깨지면 잡는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/__tests__/no-html.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { TIMELINE_WINDOW_DAYS } from '@/lib/admin/opsSchedule/params'

const SRC = join(process.cwd(), 'src')
const ROOTS = [join(SRC, 'components/admin/ops'), join(SRC, 'app/admin/ops-inbox'), join(SRC, 'app/admin/ops-schedule')]
/** 폴더가 아닌 단일 파일 화면 부품: 일정표(티켓 20261006_1536)가 운영 홈과 함께 쓰는 주간 캘린더. 운영 항목의 제목·상태를 그린다. */
const FILES = [join(SRC, 'app/admin/WeeklyCalendar.tsx')]

function walk(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const rel = (file: string) => relative(SRC, file).split(sep).join('/')

/** 주석(블록·줄·JSX 주석)을 벗긴다. 설명 글이 규칙 검사에 걸리지 않게 한다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const sourceFiles = [...ROOTS.flatMap((root) => walk(root)), ...FILES].filter(
  (file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${sep}__tests__${sep}`)
)

describe('받은 기획함 화면 소스 계약', () => {
  it('화면 파일을 실제로 찾았다(빈 목록으로 통과하지 않는다)', () => {
    const names = sourceFiles.map(rel)
    expect(names).toContain('components/admin/ops/OpsItemDetail.tsx')
    expect(names).toContain('components/admin/ops/OpsBundleWorkspace.tsx')
    expect(names).toContain('components/admin/ops/OpsBalanceWarnings.tsx')
    // 운영 홈·일정표 공용 부품(티켓 20261006_1339): 신호 문장은 에이전트가 보낸 제목이 섞일 수 있어 같은 검사를 받는다
    expect(names).toContain('components/admin/ops/OpsSignalRow.tsx')
    expect(names).toContain('components/admin/ops/OpsSampleSwitch.tsx')
    expect(names).toContain('components/admin/ops/OpsStatusBadge.tsx')
    // 운영 홈 부품(티켓 20261006_1340): 신호 문장·에이전트 이름·결정 문장이 섞여 들어오는 패널·이력·상태 칸도 같은 검사를 받는다
    expect(names).toContain('components/admin/ops/OpsSignalPanel.tsx')
    expect(names).toContain('components/admin/ops/OpsRecentDecisions.tsx')
    expect(names).toContain('components/admin/ops/OpsWeekStatus.tsx')
    expect(names).toContain('components/admin/ops/OpsSectionNotice.tsx')
    // 일정표(티켓 20261006_1536): 운영 항목 제목이 칸·막대에 그대로 들어오는 화면과 주간 캘린더도 같은 검사를 받는다
    expect(names).toContain('app/admin/ops-schedule/page.tsx')
    expect(names).toContain('app/admin/ops-schedule/ScheduleBody.tsx')
    expect(names).toContain('app/admin/ops-schedule/ScheduleToolbar.tsx')
    expect(names).toContain('app/admin/ops-schedule/OpsScheduleBoard.tsx')
    expect(names).toContain('app/admin/WeeklyCalendar.tsx')
    // 일정표 서랍(티켓 20261006_1537): 항목 상세·신호 문장·제목이 서랍에 그대로 들어오므로 같은 검사를 받는다
    expect(names).toContain('components/admin/ops/OpsScheduleDrawer.tsx')
    expect(names).toContain('components/admin/ops/OpsScheduleDayDrawer.tsx')
    expect(names).toContain('components/admin/ops/OpsItemFooter.tsx')
    // 일정표 월간·타임라인·범례(티켓 20261006_1538): 운영 항목 제목이 칸·막대에 그대로 들어오므로 같은 검사를 받는다
    expect(names).toContain('components/admin/ops/OpsScheduleMonth.tsx')
    expect(names).toContain('components/admin/ops/OpsScheduleTimeline.tsx')
    expect(names).toContain('components/admin/ops/OpsStatusLegend.tsx')
    expect(names).toContain('app/admin/ops-inbox/page.tsx')
    expect(names).toContain('app/admin/ops-inbox/[bundleId]/page.tsx')
    expect(sourceFiles.length).toBeGreaterThanOrEqual(12)
  })

  it('dangerouslySetInnerHTML·innerHTML·outerHTML·insertAdjacentHTML을 쓰지 않는다', () => {
    const offenders = sourceFiles
      .filter((file) => /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('제출 문자열을 코드로 실행하지 않는다(eval·Function 생성자·JSON 밖 파싱 없음)', () => {
    const offenders = sourceFiles
      .filter((file) => /\beval\s*\(|new\s+Function\s*\(/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('`style` 속성은 색 견본 한 곳과 숫자로 계산한 위치 두 곳(미션 막대 열, 타임라인 격자)뿐이고, 색 견본은 `HEX_COLOR_PATTERN`을 통과한 값만 넣는다', () => {
    const withStyle = sourceFiles.filter((file) => /\bstyle=\{/.test(stripComments(readFileSync(file, 'utf8'))))
    expect(withStyle.map(rel)).toEqual([
      'components/admin/ops/OpsItemDetail.tsx',
      'components/admin/ops/OpsScheduleTimeline.tsx',
      'app/admin/WeeklyCalendar.tsx',
    ])

    const code = stripComments(readFileSync(withStyle[0], 'utf8'))
    expect(code).toMatch(/import\s*\{\s*HEX_COLOR_PATTERN\s*\}\s*from\s*'@\/components\/admin\/BackgroundColorField'/)
    // 견본을 그리는 분기 조건이 정규식 검사다
    expect(code).toMatch(/const\s+isHex\s*=\s*HEX_COLOR_PATTERN\.test\(/)
    expect(code).toMatch(/\{isHex\s*&&\s*\(/)
    // style에는 검사를 통과한 값(text)만 들어가고 다른 속성은 없다
    expect(code.match(/style=\{\{[^}]*\}\}/g)).toEqual(['style={{ backgroundColor: text }}'])

    // 주간 캘린더의 `style`은 막대가 걸치는 열(숫자 `startCol`·`endCol`에서 계산한 `grid-column`) 하나뿐이다. 제출 문자열은 거기에 닿지 않는다.
    const calendar = stripComments(readFileSync(withStyle[2], 'utf8'))
    expect(calendar.match(/\bstyle=\{/g)).toHaveLength(1)
    expect(calendar).toContain('style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}')

    // 타임라인의 `style`은 숫자 열·줄 번호로 만든 격자 위치(`placement(…)`)와 오늘 선의 `left` 비율 하나뿐이다. 제목 같은 제출 문자열은 거기에 닿지 않는다.
    const timeline = stripComments(readFileSync(withStyle[1], 'utf8'))
    const usages = timeline.match(/\bstyle=\{.{0,28}/g) ?? []
    expect(usages.length).toBeGreaterThan(0)
    for (const usage of usages) {
      expect(usage, usage).toMatch(/^style=\{(placement\(|style\}|\{ left: `\$\{todayLeft\}%`)/)
    }
    expect(timeline.match(/style=\{\{/g)).toHaveLength(1)
    expect(timeline).toContain('const style = placement(')
    expect(timeline).toMatch(/function placement\([^)]*\): CSSProperties \{\s*return \{ gridColumn: `\$\{startCol\} \/ \$\{endCol \+ 1\}`, gridRow: `\$\{row\} \/ span \$\{rowSpan\}` \}/)
  })

  it('타임라인의 열 개수 글자(repeat(42, …))는 창 길이 상수와 같다(Tailwind 클래스는 숫자를 조립할 수 없어 글자로 적는다)', () => {
    const timeline = readFileSync(join(SRC, 'components/admin/ops/OpsScheduleTimeline.tsx'), 'utf8')
    const counts = [...timeline.matchAll(/repeat\((\d+),/g)].map((match) => Number(match[1]))
    expect(counts.length).toBeGreaterThan(0)
    expect(new Set(counts)).toEqual(new Set([TIMELINE_WINDOW_DAYS]))
  })

  it('화면에 내부 테이블 이름을 쓰지 않는다', () => {
    const offenders = sourceFiles
      .filter((file) => /ops_bundles|ops_bundle_items|ops_decisions/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('화면 부품은 밸런스 평가·서비스 상태 모듈을 값으로 가져오지 않는다(서버 전용 코드가 클라이언트 번들로 들어간다)', () => {
    // `balance/evaluate`는 JAM! 행동 지표 키(`badge-engine`, 서버 클라이언트를 끌어온다)를, `balance/state`는 DB 조회를 쓴다.
    // 화면은 타입(`import type`)만 가져오고 값은 `rules`·`messages`·`view`에서만 가져온다.
    const valueImport = /^import\s+(?!type\b)[^;]*from\s+'@\/lib\/admin\/opsInbox\/balance\/(evaluate|state)'/m
    const offenders = sourceFiles
      .filter((file) => file.includes(`${sep}components${sep}`) && valueImport.test(readFileSync(file, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('S2·S3는 서버에서 렌더한다(loading.tsx를 만들지 않는다)', () => {
    expect(existsSync(join(SRC, 'app/admin/ops-inbox/loading.tsx'))).toBe(false)
    expect(existsSync(join(SRC, 'app/admin/ops-inbox/[bundleId]/loading.tsx'))).toBe(false)
  })

  it('S4는 본문만 Suspense로 읽는다(머리·도구줄은 바로 보여야 해서 loading.tsx를 만들지 않는다)', () => {
    expect(existsSync(join(SRC, 'app/admin/ops-schedule/loading.tsx'))).toBe(false)
  })
})
