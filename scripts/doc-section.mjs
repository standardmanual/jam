#!/usr/bin/env node
// 마크다운 문서에서 필요한 절만 출력한다 (티켓 20260926_1543).
// 큰 문서를 통째로 읽지 않고 절 단위로 읽어 토큰을 줄이기 위한 도구다.
//
// 사용: node scripts/doc-section.mjs <파일> <제목 접두> [--all-matches]
//   - 제목 접두는 제목 줄 전체("## 8. 제목")나 `#` 없는 제목 텍스트("8. 제목")의 앞부분이다.
//   - 절은 일치한 제목부터 다음 "같은 수준 이하" 제목 직전까지다(하위 제목은 포함).
//   - 코드 펜스(``` / ~~~) 안의 `#`와 맨 앞 frontmatter는 제목으로 보지 않는다.
//   - 일치가 없거나 둘 이상이면(--all-matches 없이) 종료 코드 1, stderr에 후보 제목 목록을 낸다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 제목 목록을 뽑는다: { line(0부터), level, raw(제목 줄), text(# 뗀 텍스트) }
export function parseHeadings(lines) {
  const headings = []
  let fence = null
  let i = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---')
    if (end > 0) i = end + 1
  }
  for (; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (f) {
      const marker = f[1]
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/)
    if (h) headings.push({ line: i, level: h[1].length, raw: line.trimEnd(), text: h[2] })
  }
  return headings
}

export function findSections(content, prefix) {
  const lines = content.split('\n')
  const headings = parseHeadings(lines)
  const want = prefix.trim()
  const matches = headings.filter((h) => h.raw.startsWith(want) || h.text.startsWith(want))
  const sections = matches.map((h) => {
    const next = headings.find((n) => n.line > h.line && n.level <= h.level)
    const end = next ? next.line : lines.length
    const body = lines.slice(h.line, end)
    while (body.length > 1 && body[body.length - 1].trim() === '') body.pop()
    return { heading: h.raw, body: body.join('\n') }
  })
  return { sections, headings }
}

function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all-matches')
  const [file, prefix] = args.filter((a) => a !== '--all-matches')
  if (!file || !prefix) {
    console.error('사용: node scripts/doc-section.mjs <파일> <제목 접두> [--all-matches]')
    process.exit(2)
  }
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`파일을 읽을 수 없다: ${file} (${e.code ?? e.message})`)
    process.exit(2)
  }
  const { sections, headings } = findSections(content, prefix)
  if (sections.length === 0) {
    console.error(`"${prefix}"로 시작하는 제목이 없다. 후보 제목:`)
    for (const h of headings) console.error(`  ${h.raw}`)
    process.exit(1)
  }
  if (sections.length > 1 && !all) {
    console.error(`"${prefix}"로 시작하는 제목이 ${sections.length}개다. 접두를 더 구체적으로 주거나 --all-matches를 쓴다. 후보:`)
    for (const s of sections) console.error(`  ${s.heading}`)
    process.exit(1)
  }
  process.stdout.write(sections.map((s) => s.body).join('\n\n') + '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
