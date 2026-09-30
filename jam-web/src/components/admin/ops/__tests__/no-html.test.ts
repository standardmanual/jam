/**
 * 제출 문자열은 HTML로 그리지 않는다 — 소스 계약 (티켓 20260930_1817)
 *
 * 받은 기획함에는 에이전트가 보낸 문자열(문안·가설·에이전트 이름·형식 오류 문장·제출 원본)이 그대로 들어온다. 이 문자열을
 * HTML로 해석하면 저장형 XSS가 된다. 화면(`components/admin/ops/**`, `app/admin/ops-inbox/**`)은 React 텍스트 노드로만
 * 그리고, 색 견본만 값이 `#rrggbb`를 통과할 때 `style`에 넣는다. 이 테스트는 소스를 훑어 그 규칙이 깨지면 잡는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/__tests__/no-html.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')
const ROOTS = [join(SRC, 'components/admin/ops'), join(SRC, 'app/admin/ops-inbox')]

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

const sourceFiles = ROOTS.flatMap((root) => walk(root)).filter(
  (file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${sep}__tests__${sep}`)
)

describe('받은 기획함 화면 소스 계약', () => {
  it('화면 파일을 실제로 찾았다(빈 목록으로 통과하지 않는다)', () => {
    const names = sourceFiles.map(rel)
    expect(names).toContain('components/admin/ops/OpsItemDetail.tsx')
    expect(names).toContain('components/admin/ops/OpsBundleWorkspace.tsx')
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

  it('`style` 속성은 색 견본 한 곳뿐이고 `HEX_COLOR_PATTERN`을 통과한 값만 넣는다', () => {
    const withStyle = sourceFiles.filter((file) => /\bstyle=\{/.test(stripComments(readFileSync(file, 'utf8'))))
    expect(withStyle.map(rel)).toEqual(['components/admin/ops/OpsItemDetail.tsx'])

    const code = stripComments(readFileSync(withStyle[0], 'utf8'))
    expect(code).toMatch(/import\s*\{\s*HEX_COLOR_PATTERN\s*\}\s*from\s*'@\/components\/admin\/BackgroundColorField'/)
    // 견본을 그리는 분기 조건이 정규식 검사다
    expect(code).toMatch(/const\s+isHex\s*=\s*HEX_COLOR_PATTERN\.test\(/)
    expect(code).toMatch(/\{isHex\s*&&\s*\(/)
    // style에는 검사를 통과한 값(text)만 들어가고 다른 속성은 없다
    expect(code.match(/style=\{\{[^}]*\}\}/g)).toEqual(['style={{ backgroundColor: text }}'])
  })

  it('화면에 내부 테이블 이름을 쓰지 않는다', () => {
    const offenders = sourceFiles
      .filter((file) => /ops_bundles|ops_bundle_items|ops_decisions/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('S2·S3는 서버에서 렌더한다(loading.tsx를 만들지 않는다)', () => {
    expect(existsSync(join(SRC, 'app/admin/ops-inbox/loading.tsx'))).toBe(false)
    expect(existsSync(join(SRC, 'app/admin/ops-inbox/[bundleId]/loading.tsx'))).toBe(false)
  })
})
