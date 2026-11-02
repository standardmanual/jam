/**
 * 한국어 줄바꿈 기본값이 전역에 남아 있고, 이를 덮어쓰는 옛 값이 다시 생기지 않았는지 확인한다 (티켓 20261102_1711, 1회)
 *
 * 모든 텍스트에 `text-wrap: balance`와 `word-break: keep-all`이 적용되어야 한다. 전역 기본값(`body`, `h1`~`h6`, `p`)은
 * 상속되지만, 요소에 `text-pretty`를 달면 그 요소의 balance가 덮어쓰이고 `word-break: break-word`는 한국어를 글자 단위로 끊는다.
 *
 * (가) `globals.css`(서비스)와 `design-system/styles.css`(디자인시스템)의 `body`와 `h1~h6, p` 블록에 두 속성이 모두 있다.
 * (나) `src`와 `design-system`(시험·`uploads` 제외)에 `text-pretty`·`text-wrap: pretty`·`break-word`형 `word-break`가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/app/__tests__/korean-wrap-global.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const JAM_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const GLOBAL_CSS = [
  { label: 'src/app/globals.css', file: 'src/app/globals.css' },
  { label: 'design-system/styles.css', file: 'design-system/styles.css' },
]

/** 규칙 블록 `<선택자> { ... }`의 본문을 돌려준다 */
function blockBody(css: string, selectorPattern: RegExp): string {
  const match = css.match(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : ''
}

describe('전역 한국어 줄바꿈 기본값', () => {
  for (const { label, file } of GLOBAL_CSS) {
    const css = readFileSync(path.join(JAM_WEB, file), 'utf8')

    it(`${label}의 body 블록에 text-wrap: balance와 word-break: keep-all이 있다`, () => {
      const body = blockBody(css, /(?:^|\n)\s*body/)
      expect(body).toMatch(/text-wrap:\s*balance/)
      expect(body).toMatch(/word-break:\s*keep-all/)
    })

    it(`${label}의 h1~h6, p 블록에 text-wrap: balance와 word-break: keep-all이 있다`, () => {
      const headings = blockBody(css, /h6\s*,\s*p/)
      expect(headings).toMatch(/text-wrap:\s*balance/)
      expect(headings).toMatch(/word-break:\s*keep-all/)
    })
  }
})

const SCAN_ROOTS = ['src', 'design-system']
const SCAN_EXT = /\.(?:ts|tsx|js|jsx|mjs|css)$/
const SKIP_DIRS = new Set(['node_modules', 'uploads', '__tests__'])
const SKIP_FILE = /\.(?:test|spec)\./

function collect(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), out)
    } else if (SCAN_EXT.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'text-pretty', pattern: /text-pretty/ },
  { name: 'text-wrap: pretty', pattern: /text-wrap:\s*pretty/ },
  { name: "textWrap: 'pretty'", pattern: /textWrap:\s*['"]pretty['"]/ },
  { name: 'word-break: break-word', pattern: /word-break:\s*break-word/ },
  { name: "wordBreak: 'break-word'", pattern: /wordBreak:\s*['"]break-word['"]/ },
]

describe('balance·keep-all을 덮어쓰는 옛 값이 없다', () => {
  const files = SCAN_ROOTS.flatMap((root) => collect(path.join(JAM_WEB, root), []))

  it('검사 대상 파일을 찾는다', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  for (const { name, pattern } of FORBIDDEN) {
    it(`${name}이(가) 어느 파일에도 없다`, () => {
      const hits = files
        .filter((f) => pattern.test(readFileSync(f, 'utf8')))
        .map((f) => path.relative(JAM_WEB, f))
      expect(hits).toEqual([])
    })
  }
})
