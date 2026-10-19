/**
 * MODULAR 디자인 시스템 컴포넌트에 다크 바탕을 전제로 직접 적은 색이 남지 않았는지 확인한다 (티켓 20261015_2134, 3회)
 *
 * `design-system/components/**\/*.jsx`의 코드(주석 제외)에 리터럴 흰·검정, 옛 빨강, Base 직접 참조,
 * 진행 상태 색(`--progress-short`·`--progress-done`·`--warning`·`--success`)을 쓴 글자색,
 * 불투명도로 만든 글자색이 다시 생기면 실패한다. 진행 상태 색은 선·링·점·막대 면 전용이다
 * (흰 면 위 2.07~2.19:1). 스토리 `play`는 CI에서 돌지 않으므로 이 파일이 유일한 자동 가드다.
 *
 * 허용 목록은 사유가 있는 것만 둔다. 서비스 화면은 `app/(main)/__tests__/serviceLiteralColors.test.ts`(1회),
 * 공통 컴포넌트·lib·CSS는 `commonLiteralColors.test.ts`(2회)가 맡는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/dsLiteralColors.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const COMPONENTS_DIR = path.resolve(__dirname, '../../../design-system/components')

/** components 기준 상대 경로의 `.jsx` 파일 전부 */
function listJsx(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const full = path.join(dir, name)
      return statSync(full).isDirectory() ? listJsx(full) : [full]
    })
    .filter((f) => f.endsWith('.jsx'))
}

const FILES = listJsx(COMPONENTS_DIR)
  .map((f) => path.relative(COMPONENTS_DIR, f))
  .sort()

/** 주석을 지운다. 줄 번호가 밀리지 않게 블록 주석은 개행만 남긴다 */
function stripComments(source: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  return noBlock
    .split('\n')
    .map((line) => line.replace(/(^|[^:\w'"`])\/\/.*$/, '$1'))
    .join('\n')
}

function load(file: string): string {
  return stripComments(readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8'))
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** 리터럴 흰·검정, 옛 빨강, Tailwind 흰/검정 유틸리티, 반투명 rgba, Base 직접 참조 */
const LITERAL_COLOR =
  /text-white|bg-black|bg-white|border-white|white\/|black\/|rgba\(|#fff|#000|#e8461f|--base-(?:black|white|neutral)/i

/** 사유가 있는 예외 — 파일 경로와 줄 내용으로 가린다(줄 번호는 바뀌므로 쓰지 않는다) */
const ALLOWED_LITERAL: { file: string; line: RegExp; reason: string }[] = [
  {
    file: 'patterns/ItemSerialCode.jsx',
    line: /radial-gradient\(120% 90% at 22% 12%, rgba\(255,255,255,0\.19\)/,
    reason: '어두운 인장 면 자체의 재질(흰 하이라이트 19%) — 페이지 바탕에 따라 바뀌는 값이 아니고 위 글자는 --snow(최저 4.63:1)',
  },
  {
    file: 'patterns/ItemSerialCode.jsx',
    line: /var\(--base-neutral-600\) 0%, var\(--base-neutral-800\) 100%/,
    reason: '인장 그라디언트 — 팔레트 단계 값이고 대응하는 역할 토큰이 없다',
  },
]

/** 글자 `color:`에 진행 상태 색을 쓰면 안 된다 — 선·링·점·막대 면 전용 */
const TEXT_COLOR_WITH_PROGRESS_TOKEN =
  /(?<![A-Za-z-])color\s*:[^,;{}]*var\(--(?:progress-short|progress-done|warning|success)\)/g

/** 글자색을 담는 변수(`captionColor` 등)에 진행 상태 색을 넣어도 같다 */
const TEXT_COLOR_VARIABLE =
  /\b(?:const|let)\s+(\w*(?:caption|text|value|label|pct|ramp)\w*Color)\s*=\s*([^;]*);/gi

/** 정적 불투명도(`opacity: .4`)와 같은 스타일 객체에 글자 `color:`가 함께 있으면 불투명도로 글자색을 만든 것이다 */
const STATIC_OPACITY = /opacity\s*:\s*(0?\.\d+)/g
const TEXT_COLOR_KEY = /(?<![A-Za-z-])color\s*:\s*(?!'?inherit)/

/** 사유가 있는 예외 — 비활성·장식 표현 */
const ALLOWED_OPACITY: { file: string; snippet: RegExp; reason: string }[] = [
  {
    file: 'patterns/MixerSlot.jsx',
    snippet: /fontSize:\s*20,\s*lineHeight:\s*1,\s*opacity:\s*0\.4/,
    reason: '잠긴 슬롯의 「+」 — 채울 후보가 없다는 비활성 표현이라 대비 대상이 아니다',
  },
  {
    file: 'feedback/EmptyState.jsx',
    snippet: /color:\s*'var\(--muted\)',\s*opacity:\s*0\.5/,
    reason: '장식 일러스트 아이콘 — 정보가 없다. 시각이 크게 바뀌는 연결 컴포넌트라 별도 판단 대상(티켓 20261015_2134 범위 밖 발견물)',
  },
]

/** `pos`가 속한 가장 안쪽 `{ ... }` 블록 */
function enclosingBlock(text: string, pos: number): string {
  let depth = 0
  let start = 0
  for (let i = pos; i >= 0; i--) {
    const ch = text[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth--
    }
  }
  depth = 0
  let end = text.length - 1
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      if (depth === 0) {
        end = i
        break
      }
      depth--
    }
  }
  return text.slice(start, end + 1)
}

describe('MODULAR 컴포넌트 직접 색 잔존', () => {
  it('jsx 파일을 하나 이상 찾았다(경로가 틀려 빈 목록으로 통과하지 않는다)', () => {
    expect(FILES.length).toBeGreaterThan(30)
    expect(FILES).toContain('patterns/ItemSerialCode.jsx')
    expect(FILES).toContain('cards/RarityBadge.jsx')
  })

  it('주석 제거가 이력 주석(RarityBadge의 옛 #fff)을 지우고 코드는 남긴다', () => {
    const raw = readFileSync(path.join(COMPONENTS_DIR, 'cards/RarityBadge.jsx'), 'utf-8')
    expect(raw).toMatch(/#fff/)
    expect(stripComments(raw)).not.toMatch(/#fff/)
    const serial = load('patterns/ItemSerialCode.jsx')
    expect(serial).toMatch(/--base-neutral-600/)
  })

  describe('리터럴 흰·검정·옛 빨강·Base 직접 참조가 없다', () => {
    for (const file of FILES) {
      it(file, () => {
        const hits = load(file)
          .split('\n')
          .map((text, index) => ({ no: index + 1, text }))
          .filter(({ text }) => LITERAL_COLOR.test(text))
          .filter(({ text }) => !ALLOWED_LITERAL.some((a) => a.file === file && a.line.test(text)))
        expect(hits.map(({ no, text }) => `${no}: ${text.trim()}`)).toEqual([])
      })
    }
  })

  describe('글자색에 진행 상태 색(--progress-short·--progress-done·--warning·--success)을 쓰지 않는다', () => {
    for (const file of FILES) {
      it(file, () => {
        const code = load(file)
        const hits: string[] = []
        for (const m of code.matchAll(TEXT_COLOR_WITH_PROGRESS_TOKEN)) {
          hits.push(`${lineOf(code, m.index ?? 0)}: ${m[0].replace(/\s+/g, ' ').trim()}`)
        }
        for (const m of code.matchAll(TEXT_COLOR_VARIABLE)) {
          if (/var\(--(?:progress-short|progress-done|warning|success)\)/.test(m[2])) {
            hits.push(`${lineOf(code, m.index ?? 0)}: ${m[1]} = ${m[2].replace(/\s+/g, ' ').trim()}`)
          }
        }
        expect(hits).toEqual([])
      })
    }
  })

  describe('불투명도로 글자색을 만들지 않는다', () => {
    for (const file of FILES) {
      it(file, () => {
        const code = load(file)
        const hits: string[] = []
        for (const m of code.matchAll(STATIC_OPACITY)) {
          const block = enclosingBlock(code, m.index ?? 0)
          if (!TEXT_COLOR_KEY.test(block)) continue
          if (ALLOWED_OPACITY.some((a) => a.file === file && a.snippet.test(block))) continue
          hits.push(`${lineOf(code, m.index ?? 0)}: ${block.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
        }
        expect(hits).toEqual([])
      })
    }
  })
})
