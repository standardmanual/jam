#!/usr/bin/env node
// ingest-muse-notes — Muse 수집함 저장소의 파일을 검사해 jam의 주제 폴더 notes/로 가져온다 (티켓 20261102_1500).
//
// 배경: 트렌드 수집은 외부 AI(Muse)가 하고, Muse의 GitHub 연결은 수집함 저장소 하나에만 허용한다. 수집함의 글은
// 웹 문서를 읽은 외부 AI의 출력이라 믿을 수 없는 입력이다. 이 스크립트가 그 문 앞의 검사다 — 위치와 이름, 주제, 크기,
// 날짜, 의심스러운 문장을 확인하고, 통과한 것만 머리말을 붙여 `docs/operations/trendresearch/<그룹>/<주제>/notes/`에 쓴다.
// 이미 가져온 파일은 건너뛰므로 몇 번을 돌려도 같은 결과다.
//
// 사용법:
//   node scripts/ingest-muse-notes.mjs --inbox <수집함 폴더> [--root <저장소 루트>] [--today YYYY-MM-DD] [--dry-run]
//
// 종료 코드: 거절한 파일이 하나라도 있으면 1(통과한 파일은 그래도 가져온다), 없으면 0.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { README, parseTopics } from './trend-requests.mjs'

/** `<그룹>/<주제>/YYYY-MM-DD_muse-제목.md` */
export const NAME_RE = /^(places|sports|service|culture)\/([a-z0-9_-]+)\/(\d{4}-\d{2}-\d{2})_(muse-[^/\s]+)\.md$/

export const LIMITS = {
  maxBytes: 48 * 1024,
  maxLines: 300,
  maxFiles: 60,
  /** 이 일수보다 오래된 파일은 이미 한 번 검사한 것으로 보고 조용히 건너뛴다(거절된 파일이 매주 실패를 되풀이하지 않게). */
  maxAgeDays: 14,
  maxFutureDays: 1,
}

/** 트렌드 노트에는 나올 이유가 없는 문장들이다. 걸리면 그 파일은 가져오지 않는다. */
export const SUSPICIOUS = [
  ['이전 지시 무시', /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)/i],
  ['이전 지시 무시', /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above)/i],
  ['이전 지시 무시', /(이전|위|앞)(의|에서)?\s*(지시|명령|규칙|프롬프트)(를|을)?\s*(모두\s*)?(무시|잊어)/],
  ['시스템 프롬프트 언급', /(system|developer)\s+prompt/i],
  ['역할 재지정', /\byou\s+are\s+now\b/i],
  ['스크립트·삽입 태그', /<\s*(script|iframe|object|embed)\b/i],
  ['javascript 링크', /javascript:/i],
  ['비밀 값', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['비밀 값', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['비밀 값', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['비밀 값', /\bAKIA[0-9A-Z]{16}\b/],
  ['셸 명령', /\b(git\s+(push|commit|config|reset)|npm\s+(install|run)|rm\s+-rf)\b/i],
  ['셸 명령', /curl\b[^\n]*\|\s*(sh|bash)\b/i],
]

const DAY_MS = 86_400_000
const toMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`)

/** 수집함 폴더 안의 .md 파일을 상대 경로(슬래시)로 모은다. 점으로 시작하는 폴더와 루트의 README.md는 뺀다. */
export function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, base, out)
    else if (entry.name.endsWith('.md')) {
      const rel = path.relative(base, full).split(path.sep).join('/')
      if (rel !== 'README.md') out.push(rel)
    }
  }
  return out
}

/** 파일 하나를 검사한다. 통과하면 { ok: true, ...분해값 }, 아니면 { ok: false, reason } 또는 { skip: 사유 }. */
export function checkFile(rel, text, ctx) {
  const m = NAME_RE.exec(rel)
  if (!m) return { ok: false, reason: '위치나 이름이 규칙에 맞지 않음(<그룹>/<주제>/YYYY-MM-DD_muse-제목.md)' }
  const [, group, slug, date] = m
  if (!ctx.topics.has(`${group}/${slug}`)) return { ok: false, reason: `주제 표에 없는 주제: ${group}/${slug}` }
  const ageDays = (toMs(ctx.today) - toMs(date)) / DAY_MS
  if (Number.isNaN(ageDays)) return { ok: false, reason: `날짜를 읽을 수 없음: ${date}` }
  if (ageDays < -LIMITS.maxFutureDays) return { ok: false, reason: `미래 날짜: ${date}` }
  if (ageDays > LIMITS.maxAgeDays) return { skip: '지난 파일' }
  if (Buffer.byteLength(text, 'utf8') > LIMITS.maxBytes) return { ok: false, reason: `크기가 ${LIMITS.maxBytes / 1024}KB를 넘음` }
  if (text.includes('\u0000')) return { ok: false, reason: '널 문자가 들어 있음' }
  if (text.split('\n').length > LIMITS.maxLines) return { ok: false, reason: `${LIMITS.maxLines}줄을 넘음` }
  if (text.trim() === '') return { ok: false, reason: '내용이 비어 있음' }
  for (const [label, re] of SUSPICIOUS) {
    if (re.test(text)) return { ok: false, reason: `의심스러운 문장(${label})` }
  }
  return { ok: true, group, slug, date, base: `${date}_${m[4]}.md` }
}

/** 본문 앞의 머리말 블록을 걷어 낸다. 머리말은 우리가 새로 붙인다. */
export function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

export function extractSources(body, max = 20) {
  const found = body.match(/https?:\/\/[^\s)>\]"'`]+/g) ?? []
  const clean = found.map((u) => u.replace(/[.,;:]+$/, ''))
  return [...new Set(clean)].slice(0, max)
}

export function describeBody(body, group, slug) {
  const heading = body.match(/^#{2,4}\s+(.+)$/m)?.[1]
  const first = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && !l.startsWith('-'))
  const raw = (heading ?? first ?? `Muse가 모은 ${group}/${slug} 트렌드`).replace(/[*_`>"]/g, '').replace(/\s+/g, ' ').trim()
  return raw.length > 100 ? `${raw.slice(0, 99)}…` : raw
}

/** 통과한 파일에 머리말을 붙여 notes/에 들어갈 최종 본문을 만든다. */
export function buildNote(text, { group, slug }) {
  const body = stripFrontmatter(text).replace(/\r\n/g, '\n').trim()
  const sources = extractSources(body)
  const lines = [
    '---',
    'type: research-note',
    `description: "${describeBody(body, group, slug)}"`,
    `tags: [muse, ${group}/${slug}]`,
  ]
  if (sources.length) lines.push('sources:', ...sources.map((u) => `  - ${u}`))
  lines.push('---', '', body, '')
  return lines.join('\n')
}

export function ingest({ inbox, root, today, dryRun = false }) {
  const readme = path.join(root, ...README)
  const topics = new Set(parseTopics(readFileSync(readme, 'utf8')).map((t) => `${t.group}/${t.slug}`))
  const result = { accepted: [], existing: [], skippedOld: [], rejected: [] }
  const files = listFiles(inbox)
  const ctx = { topics, today }
  let counted = 0
  for (const rel of files) {
    const text = readFileSync(path.join(inbox, rel), 'utf8')
    const checked = checkFile(rel, text, ctx)
    if (checked.skip) {
      result.skippedOld.push(rel)
      continue
    }
    if (!checked.ok) {
      result.rejected.push({ rel, reason: checked.reason })
      continue
    }
    if (++counted > LIMITS.maxFiles) {
      result.rejected.push({ rel, reason: `한 번에 ${LIMITS.maxFiles}개까지만 가져옴` })
      continue
    }
    const target = path.join(root, 'docs', 'operations', 'trendresearch', checked.group, checked.slug, 'notes', checked.base)
    if (existsSync(target)) {
      result.existing.push(rel)
      continue
    }
    if (!dryRun) {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, buildNote(text, checked))
    }
    result.accepted.push(rel)
  }
  return result
}

export function summarize(result, dryRun) {
  const lines = [`# Muse 수집함 반입${dryRun ? ' (검사만, 쓰지 않음)' : ''}`, '']
  lines.push(`- 가져옴 ${result.accepted.length}개, 이미 있음 ${result.existing.length}개, 지난 파일 ${result.skippedOld.length}개, 거절 ${result.rejected.length}개`)
  for (const r of result.accepted) lines.push(`  - 가져옴: ${r}`)
  for (const r of result.rejected) lines.push(`  - 거절: ${r.rel} (${r.reason})`)
  return lines.join('\n')
}

export function main(argv, out = console.log) {
  const opt = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const inbox = opt('--inbox')
  const root = opt('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const today = opt('--today') ?? new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  const dryRun = argv.includes('--dry-run')
  if (!inbox || !existsSync(inbox) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    out('사용법: node scripts/ingest-muse-notes.mjs --inbox <수집함 폴더> [--root <루트>] [--today YYYY-MM-DD] [--dry-run]')
    return 2
  }
  const result = ingest({ inbox, root, today, dryRun })
  out(summarize(result, dryRun))
  return result.rejected.length > 0 ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
