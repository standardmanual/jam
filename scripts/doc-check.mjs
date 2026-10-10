#!/usr/bin/env node
// 문서 링크·참조·frontmatter 검사기 엔진 (티켓 20260919_1245, 문서 체계 정비 T1)
//
// 설계 원칙
//  - 외부 npm 의존 없이 node 내장 모듈만 쓴다.
//  - 이 파일에는 묶음(저장소)별 문자열을 넣지 않는다. 필수 필드, 열거값, 태그 어휘, 제외 폴더,
//    등급(오류/경고)은 모두 설정 JSON에서 읽는다. 다른 문서 묶음으로 복사해 설정만 바꿔 쓴다.
//  - 검사 방식은 "커밋에서 추가된 줄만 검사 + 파일이 삭제·이동되면 그 경로를 가리키는 모든 문서를
//    전수 검사"다. 기준선 목록을 두지 않으므로 기존에 깨진 링크는 건드리지 않는다.
//
// 사용법
//   node scripts/doc-check.mjs --staged [--config <경로>]   스테이지된 변경 검사 (pre-commit용)
//   node scripts/doc-check.mjs --all    [--config <경로>] [--summary]   전체 문서 실측
//   node scripts/doc-check.mjs --backlinks <문서 경로> [--config <경로>]   역링크 조회
//   node scripts/doc-check.mjs --orphans [--config <경로>]   고아 문서 조회
//
// 역링크·고아 문서 조회는 커밋되는 산출물을 만들지 않는 조회 명령이다(항상 종료 코드 0).
//
// 종료 코드: 0 = 통과(경고 포함), 10 = 오류 있음(차단), 그 밖 = 엔진 자체 실패(호출자가 경고 후 통과 처리).
// 차단 코드를 node의 기본 실패 코드(1)와 다르게 잡은 것은, 엔진 파일이 깨져 SyntaxError 같은 예외로
// 죽었을 때 그것이 '위반'으로 오인되어 모든 커밋을 막지 않게 하기 위해서다.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { posix, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXIT_VIOLATION = 10

const nfc = (s) => s.normalize('NFC')

// ───────────────────────── 설정 ─────────────────────────

export function loadConfig(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`설정 파일을 읽을 수 없습니다: ${path} (${e.message})`)
  }
  let cfg
  try {
    cfg = JSON.parse(raw)
  } catch (e) {
    throw new Error(`설정 파일 JSON 파싱 오류: ${path} (${e.message})`)
  }
  return normalizeConfig(cfg)
}

export function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error('설정 최상위는 객체여야 합니다')
  }
  const c = {
    schemaVersion: cfg.schemaVersion ?? null,
    strict: cfg.strict === true,
    scope: { include: [], exclude: [], ...(cfg.scope ?? {}) },
    externalPrefixes: cfg.externalPrefixes ?? [],
    codeSpanRoots: cfg.codeSpanRoots ?? [],
    codeSpanIgnore: cfg.codeSpanIgnore ?? [],
    codespanWarnPaths: cfg.codespanWarnPaths ?? [],
    severity: { link: 'error', codespan: 'warn', unresolvable: 'warn', field: 'warn', ...(cfg.severity ?? {}) },
    fields: {
      required: ['type', 'description'],
      common: ['type', 'description', 'status', 'tags', 'related', 'basis'],
      ignored: [],
      ...(cfg.fields ?? {}),
    },
    typeByPath: cfg.typeByPath ?? [],
    types: cfg.types ?? {},
    statusSets: cfg.statusSets ?? {},
    tags: { vocabulary: [], forbidden: [], ...(cfg.tags ?? {}) },
    report: { groups: [], ...(cfg.report ?? {}) },
    orphans: { excludeTypes: [], excludeSources: [], ...(cfg.orphans ?? {}) },
  }
  for (const key of ['include', 'exclude']) {
    if (!Array.isArray(c.scope[key])) throw new Error(`scope.${key}는 배열이어야 합니다`)
  }
  if (!Array.isArray(c.externalPrefixes) || !Array.isArray(c.codeSpanRoots)) {
    throw new Error('externalPrefixes와 codeSpanRoots는 배열이어야 합니다')
  }
  for (const [name, t] of Object.entries(c.types)) {
    if (t.statusSet && !c.statusSets[t.statusSet]) {
      throw new Error(`type '${name}'이 존재하지 않는 statusSet '${t.statusSet}'을 가리킵니다`)
    }
  }
  return c
}

// ───────────────────────── 범위 ─────────────────────────

export function inScope(path, cfg) {
  const p = nfc(path)
  if (!p.endsWith('.md')) return false
  if (!cfg.scope.include.some((pre) => p.startsWith(pre))) return false
  for (const ex of cfg.scope.exclude) {
    if (ex.startsWith('**/')) {
      if (posix.basename(p) === ex.slice(3)) return false
    } else if (ex.endsWith('/')) {
      if (p.startsWith(ex)) return false
    } else if (p === ex) {
      return false
    }
  }
  return true
}

// ───────────────────────── 참조 추출 ─────────────────────────

// frontmatter가 차지하는 마지막 줄 번호(1-based). 없으면 0.
function frontmatterEndLine(lines) {
  if (lines.length === 0 || lines[0].trim() !== '---') return 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i + 1
  }
  return 0
}

// 한 줄에서 인라인 코드 스팬을 뽑고, 코드 스팬 부분을 공백으로 지운 줄을 함께 돌려준다.
function splitCodeSpans(line) {
  const spans = []
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i++]
      continue
    }
    let j = i
    while (j < line.length && line[j] === '`') j++
    const run = j - i
    // 같은 길이의 닫는 백틱 런을 찾는다
    let k = j
    let close = -1
    while (k < line.length) {
      if (line[k] !== '`') {
        k++
        continue
      }
      let m = k
      while (m < line.length && line[m] === '`') m++
      if (m - k === run) {
        close = k
        break
      }
      k = m
    }
    if (close === -1) {
      out += line.slice(i, j)
      i = j
      continue
    }
    spans.push(line.slice(j, close))
    out += ' '.repeat(close + run - i)
    i = close + run
  }
  return { spans, text: out }
}

const LINK_RE = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/

export function cleanLinkTarget(raw) {
  let t = raw.trim()
  if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1).trim()
  if (!t || t.startsWith('#')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) || t.startsWith('//')) return null
  t = t.split('#')[0].split('?')[0]
  if (!t) return null
  try {
    t = decodeURIComponent(t)
  } catch {
    // 인코딩이 아닌 % 문자는 그대로 둔다
  }
  if (/[{}<>*$|]/.test(t)) return null
  return t
}

// 설정의 codeSpanIgnore(정규식 문자열 배열)에 걸리는 백틱 경로는 검사에서 뺀다.
// 자리표시자·시크릿·예정 위치처럼 일부러 존재하지 않는 경로를 적는 경우를 위한 예외다.
export function isCodeSpanIgnored(target, cfg) {
  return (cfg.codeSpanIgnore ?? []).some((re) => new RegExp(re).test(target))
}

export function cleanCodeSpanPath(content, roots) {
  let t = content.trim()
  if (!roots.some((r) => t.startsWith(r))) return null
  if (/\s/.test(t) || /[*{}<>$|[\]()]/.test(t) || t.includes('...') || t.includes('…')) return null
  t = t.split('#')[0]
  t = t.replace(/:\d+(?:-\d+)?$/, '')
  t = t.replace(/[,.;]+$/, '')
  return t || null
}

// 코드 블록(펜스)과 frontmatter를 제외하고 링크·코드 스팬 경로를 뽑는다.
export function extractRefs(text, cfg) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const fmEnd = frontmatterEndLine(lines)
  const refs = []
  let fence = null // { ch, len }
  for (let idx = fmEnd; idx < lines.length; idx++) {
    const line = lines[idx]
    const lineNo = idx + 1
    const fm = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (fm && fm[1][0] === fence.ch && fm[1].length >= fence.len && fm[2].trim() === '') fence = null
      continue
    }
    if (fm && !(fm[1][0] === '`' && fm[2].includes('`'))) {
      fence = { ch: fm[1][0], len: fm[1].length }
      continue
    }
    const { spans, text: stripped } = splitCodeSpans(line)
    LINK_RE.lastIndex = 0
    let m
    while ((m = LINK_RE.exec(stripped)) !== null) {
      const target = cleanLinkTarget(m[1])
      if (target) refs.push({ line: lineNo, kind: 'link', target })
    }
    const def = REF_DEF_RE.exec(stripped)
    if (def) {
      const target = cleanLinkTarget(def[1])
      if (target) refs.push({ line: lineNo, kind: 'link', target })
    }
    for (const span of spans) {
      const target = cleanCodeSpanPath(span, cfg.codeSpanRoots)
      if (target && !isCodeSpanIgnored(target, cfg)) refs.push({ line: lineNo, kind: 'codespan', target })
    }
  }
  return refs
}

// ───────────────────────── 경로 해석 ─────────────────────────

export function resolveTarget(fromFile, ref) {
  let p
  if (ref.kind === 'codespan' || ref.target.startsWith('/')) {
    p = posix.normalize(ref.target.replace(/^\//, ''))
  } else {
    p = posix.normalize(posix.join(posix.dirname(fromFile), ref.target))
  }
  p = nfc(p).replace(/\/+$/, '')
  if (p === '..' || p.startsWith('../')) return null // 작업 폴더 밖
  return p === '' ? '.' : p
}

// 존재 판정기. tracked = 인덱스에 있는 파일 경로 집합. 외부 접두어(저장소 밖에서 심볼릭 링크 등으로
// 들어오는 폴더)는 파일 시스템으로 확인하고, 그 폴더 자체가 없으면 '해석 불가'로 본다.
export function makeExistence({ files, rootDir, externalPrefixes }) {
  const tracked = new Set()
  const dirs = new Set()
  for (const f of files) {
    const p = nfc(f)
    tracked.add(p)
    let d = posix.dirname(p)
    while (d !== '.' && !dirs.has(d)) {
      dirs.add(d)
      d = posix.dirname(d)
    }
  }
  return {
    tracked,
    // 'ok' | 'missing' | 'unresolvable'
    status(p) {
      if (p === '.') return 'ok'
      const ext = externalPrefixes.find((pre) => p.startsWith(pre) || `${p}/` === pre)
      if (ext) {
        if (!existsSync(join(rootDir, ext))) return 'unresolvable'
        return existsSync(join(rootDir, p)) ? 'ok' : 'missing'
      }
      return tracked.has(p) || dirs.has(p) ? 'ok' : 'missing'
    },
  }
}

// ───────────────────────── frontmatter ─────────────────────────

function unquote(v) {
  const s = v.trim()
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1)
  }
  return s
}

// 필요한 만큼만 지원하는 YAML 부분집합 파서: `key: value`, 인라인 `[a, b]`, `- item` 목록, 블록 스칼라.
// 모든 값은 문자열이다(티켓 id를 숫자로 읽지 않는다). frontmatter가 없으면 null.
export function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const end = frontmatterEndLine(lines)
  if (!end) return null
  const body = lines.slice(1, end - 1)
  const data = {}
  let i = 0
  while (i < body.length) {
    const line = body[i]
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!m) {
      i++
      continue
    }
    const [, key, rest] = m
    i++
    const value = rest.replace(/\s+#.*$/, '')
    if (value === '') {
      const items = []
      while (i < body.length && /^\s*-\s+/.test(body[i])) {
        items.push(unquote(body[i].replace(/^\s*-\s+/, '').replace(/\s+#.*$/, '')))
        i++
      }
      data[key] = items.length ? items : ''
    } else if (/^[>|][+-]?$/.test(value)) {
      const parts = []
      while (i < body.length && (/^\s+/.test(body[i]) || body[i].trim() === '')) {
        parts.push(body[i].trim())
        i++
      }
      data[key] = parts.join(' ').trim()
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s))
        .filter((s) => s !== '')
    } else {
      data[key] = unquote(value)
    }
  }
  return { data, endLine: end }
}

// 미지의 type·필드는 등급 설정과 무관하게 경고이며 strict일 때만 오류다(스키마 §7.3).
function fieldSeverity(cfg, unknownKind) {
  if (unknownKind) return cfg.strict ? 'error' : 'warn'
  return cfg.severity.field
}

// frontmatter 검사. 반환: [{ severity, message }]
export function checkFrontmatter(path, text, cfg) {
  const problems = []
  const push = (message, unknownKind = false) =>
    problems.push({ severity: fieldSeverity(cfg, unknownKind), message })

  const derived = cfg.typeByPath.find((r) => new RegExp(r.pattern).test(path))?.type ?? null
  const fm = parseFrontmatter(text)
  if (!fm && !derived) {
    push(`frontmatter가 없습니다 (${cfg.fields.required.join('·')} 필요)`)
    return problems
  }
  const data = fm?.data ?? {}
  const type = derived ?? data.type
  const typeDef = type ? cfg.types[type] : null

  if (!type) {
    push('type이 없습니다')
  } else if (!typeDef) {
    push(`알 수 없는 type '${type}'`, true)
  } else if (typeDef.active === false) {
    push(`아직 활성화되지 않은 type '${type}'`, true)
  }
  if (!typeDef) return problems

  const exempt = new Set(typeDef.exempt ?? [])
  const required = [...cfg.fields.required.filter((f) => !exempt.has(f)), ...(typeDef.required ?? [])]
  for (const f of new Set(required)) {
    const v = data[f]
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) push(`필수 필드 '${f}'이 없습니다`)
  }

  if (data.status !== undefined) {
    if (!typeDef.statusSet) {
      push(`type '${type}'은 status를 쓰지 않습니다`)
    } else if (!cfg.statusSets[typeDef.statusSet].includes(data.status)) {
      push(`status '${data.status}'은 허용값이 아닙니다 (${cfg.statusSets[typeDef.statusSet].join('·')})`)
    }
  }

  for (const [field, allowed] of Object.entries(typeDef.enums ?? {})) {
    const v = data[field]
    if (v !== undefined && v !== '' && !allowed.includes(v)) {
      push(`'${field}' 값 '${v}'은 허용값이 아닙니다 (${allowed.join('·')})`)
    }
  }

  if (data.tags !== undefined && data.tags !== '') {
    if (!Array.isArray(data.tags)) {
      push('tags는 목록이어야 합니다')
    } else {
      for (const tag of data.tags) {
        if (cfg.tags.forbidden.includes(tag)) push(`금지 표기 태그 '${tag}'`)
        else if (cfg.tags.vocabulary.length > 0 && !cfg.tags.vocabulary.includes(tag)) push(`어휘에 없는 태그 '${tag}'`)
      }
    }
  }

  const known = new Set([...cfg.fields.common, ...cfg.fields.ignored, ...(typeDef.fields ?? [])])
  for (const key of Object.keys(data)) {
    if (!known.has(key)) push(`알 수 없는 필드 '${key}'`, true)
  }
  return problems
}

// ───────────────────────── 참조 검사 ─────────────────────────

function refProblem(file, ref, existence, cfg, via) {
  const resolved = resolveTarget(file, ref)
  const st = resolved === null ? 'missing' : existence.status(resolved)
  if (st === 'ok') return null
  const label = ref.kind === 'link' ? '링크' : '경로'
  if (st === 'unresolvable') {
    return {
      file,
      line: ref.line,
      kind: 'unresolvable',
      severity: cfg.severity.unresolvable,
      message: `${label} 해석 불가(외부 폴더 없음): ${ref.target}`,
      resolved,
    }
  }
  const msg =
    via === 'inbound'
      ? `${label}가 이동·삭제된 파일을 가리킵니다`
      : ref.kind === 'link'
        ? '링크 대상이 없습니다'
        : '경로가 없습니다'
  return {
    file,
    line: ref.line,
    kind: ref.kind,
    // 이력 문서(codespanWarnPaths, 예: 티켓)는 옛 경로 인용이 관례라 백틱 경로를 계속 경고로 둔다.
    severity:
      ref.kind === 'codespan' && (cfg.codespanWarnPaths ?? []).some((pre) => file.startsWith(pre))
        ? 'warn'
        : cfg.severity[ref.kind],
    message: `${msg}: ${ref.target}`,
    resolved,
  }
}

export function checkRefsInText({ file, text, cfg, existence, onlyLines = null }) {
  const problems = []
  for (const ref of extractRefs(text, cfg)) {
    if (onlyLines && !onlyLines.has(ref.line)) continue
    const p = refProblem(file, ref, existence, cfg, 'added')
    if (p) problems.push(p)
  }
  return problems
}

// ───────────────────────── git 도우미 ─────────────────────────

function git(args, cwd, opts = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd,
    encoding: opts.buffer ? undefined : 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: opts.input,
  })
}

export function parseNameStatus(out) {
  const parts = out.split('\0')
  const entries = []
  for (let i = 0; i < parts.length; ) {
    const st = parts[i++]
    if (!st) continue
    const code = st[0]
    if (code === 'R' || code === 'C') {
      const oldPath = parts[i++]
      const path = parts[i++]
      entries.push({ status: code, oldPath, path })
    } else {
      entries.push({ status: code, path: parts[i++] })
    }
  }
  return entries
}

export function parseAddedLines(diff) {
  const added = new Set()
  for (const line of diff.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!m) continue
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    for (let n = start; n < start + count; n++) added.add(n)
  }
  return added
}

function readIndexBatch(paths, cwd) {
  const result = new Map()
  if (paths.length === 0) return result
  const out = git(['cat-file', '--batch'], cwd, { buffer: true, input: `${paths.map((p) => `:${p}`).join('\n')}\n` })
  let pos = 0
  for (const p of paths) {
    const nl = out.indexOf(10, pos)
    if (nl === -1) break
    const header = out.toString('utf8', pos, nl)
    pos = nl + 1
    const m = /^\S+ \w+ (\d+)$/.exec(header)
    if (!m) {
      result.set(p, null)
      continue
    }
    const size = Number(m[1])
    result.set(p, out.toString('utf8', pos, pos + size))
    pos += size + 1
  }
  return result
}

// ───────────────────────── 검사 실행 ─────────────────────────

function dedupe(problems) {
  const seen = new Set()
  return problems.filter((p) => {
    const key = `${p.file}:${p.line ?? 0}:${p.kind}:${p.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function checkStaged(cfg, cwd) {
  const entries = parseNameStatus(git(['diff', '--cached', '--name-status', '-z', '--find-renames'], cwd))
  if (entries.length === 0) return { problems: [] }
  const files = git(['ls-files', '-z'], cwd).split('\0').filter(Boolean)
  const existence = makeExistence({ files, rootDir: cwd, externalPrefixes: cfg.externalPrefixes })
  const problems = []

  // ① 추가·수정·이동된 문서: 추가된 줄의 참조와 frontmatter
  const targets = entries.filter((e) => e.status !== 'D' && inScope(e.path, cfg))
  const contents = readIndexBatch(targets.map((e) => e.path), cwd)
  for (const e of targets) {
    const text = contents.get(e.path)
    if (text == null) continue
    let onlyLines = null // null = 전 줄
    const moved = (e.status === 'R' || e.status === 'C') && posix.dirname(e.oldPath) !== posix.dirname(e.path)
    if (e.status === 'M' || (e.status === 'R' && !moved)) {
      const paths = e.status === 'R' ? [e.oldPath, e.path] : [e.path]
      onlyLines = parseAddedLines(git(['diff', '--cached', '-U0', '--no-color', '--find-renames', '--', ...paths], cwd))
    }
    problems.push(...checkRefsInText({ file: e.path, text, cfg, existence, onlyLines }))
    for (const fp of checkFrontmatter(e.path, text, cfg)) {
      problems.push({ file: e.path, line: 1, kind: 'field', ...fp })
    }
  }

  // ② 삭제·이동된 경로를 가리키는 모든 문서 전수 검사
  const removed = entries.filter((e) => e.status === 'D' || e.status === 'R').map((e) => nfc(e.status === 'R' ? e.oldPath : e.path))
  if (removed.length > 0) {
    const removedSet = new Set(removed)
    const pointsToRemoved = (p) => removedSet.has(p) || removed.some((r) => r.startsWith(`${p}/`))
    const docs = files.filter((f) => inScope(f, cfg))
    const docContents = readIndexBatch(docs, cwd)
    for (const file of docs) {
      const text = docContents.get(file)
      if (text == null) continue
      for (const ref of extractRefs(text, cfg)) {
        const resolved = resolveTarget(file, ref)
        if (resolved === null || !pointsToRemoved(resolved)) continue
        const p = refProblem(file, ref, existence, cfg, 'inbound')
        if (p) problems.push(p)
      }
    }
  }
  // ③ 이번 커밋에서 새로 추가된 문서가 어디서도 링크되지 않으면 경고한다(기존 고아는 건드리지 않는다)
  const added = new Set(entries.filter((e) => e.status === 'A').map((e) => nfc(e.path)))
  if (added.size > 0) {
    const orphans = new Set(findOrphans(cfg, cwd))
    for (const file of [...added].sort()) {
      if (!orphans.has(file)) continue
      problems.push({
        file,
        line: 1,
        kind: 'orphan',
        severity: 'warn',
        message: '새 문서가 어디서도 링크되지 않았습니다. 관련 문서(상위 README나 같은 주제 문서)에 링크를 걸거나 frontmatter의 tags·related를 채우세요.',
      })
    }
  }
  return { problems: dedupe(problems) }
}

function walkExternal(rootDir, prefix) {
  const out = []
  const base = join(rootDir, prefix)
  if (!existsSync(base)) return out
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue
      const abs = join(dir, name)
      const relPath = posix.join(rel, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(abs, relPath)
      else out.push(relPath)
    }
  }
  walk(base, prefix.replace(/\/$/, ''))
  return out
}

export function checkAll(cfg, cwd) {
  const tracked = git(['ls-files', '-z'], cwd).split('\0').filter(Boolean)
  const external = cfg.externalPrefixes.flatMap((pre) => walkExternal(cwd, pre))
  const existence = makeExistence({ files: tracked, rootDir: cwd, externalPrefixes: cfg.externalPrefixes })
  const problems = []
  const totals = { link: 0, codespan: 0, docs: 0 }
  const all = [...new Set([...tracked, ...external].map(nfc))]
  for (const file of all) {
    if (!inScope(file, cfg)) continue
    let text
    try {
      text = readFileSync(join(cwd, file), 'utf8')
    } catch {
      continue
    }
    totals.docs++
    for (const ref of extractRefs(text, cfg)) {
      totals[ref.kind]++
      const p = refProblem(file, ref, existence, cfg, 'added')
      if (p) problems.push(p)
    }
    for (const fp of checkFrontmatter(file, text, cfg)) {
      problems.push({ file, line: 1, kind: 'field', ...fp })
    }
  }
  return { problems, totals }
}

// ───────────────────────── 역링크·고아 문서 ─────────────────────────

// 저장소 전체 문서에서 마크다운 링크·basis·related로 만들어지는 참조 그래프를 수집한다.
// 백틱 경로(codespan)는 예시 경로 오탐이 있어 역링크·고아 판정에 넣지 않는다(스키마 §5).
export function collectDocGraph(cfg, cwd) {
  const tracked = git(['ls-files', '-z'], cwd).split('\0').filter(Boolean)
  const external = cfg.externalPrefixes.flatMap((pre) => walkExternal(cwd, pre))
  const docs = [...new Set([...tracked, ...external].map(nfc))].filter((f) => inScope(f, cfg))
  const referencedBy = new Map() // 대상 경로 -> 그 경로를 참조한 문서 Set
  const tags = new Map() // 문서 경로 -> tags 배열
  const addRef = (target, from) => {
    if (!target) return
    if (!referencedBy.has(target)) referencedBy.set(target, new Set())
    referencedBy.get(target).add(from)
  }
  for (const file of docs) {
    let text
    try {
      text = readFileSync(join(cwd, file), 'utf8')
    } catch {
      continue
    }
    // 자동 생성 목록(INDEX 등)은 링크 출처로 세지 않는다 — 세면 모든 문서가 링크된 것이 된다.
    const isSource = !cfg.orphans.excludeSources.includes(file)
    for (const ref of extractRefs(text, cfg)) {
      if (ref.kind !== 'link' || !isSource) continue
      addRef(resolveTarget(file, ref), file)
    }
    const data = parseFrontmatter(text)?.data ?? {}
    for (const field of ['basis', 'related']) {
      const v = data[field]
      const items = Array.isArray(v) ? v : v ? [v] : []
      for (const item of items) if (isSource) addRef(resolveTarget(file, { kind: 'codespan', target: item }), file)
    }
    tags.set(file, Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [])
  }
  return { docs, referencedBy, tags }
}

function normalizeQueryPath(p) {
  return posix.normalize(nfc(p).replace(/^\.\//, '')).replace(/\/+$/, '')
}

// target 문서를 마크다운 링크·basis·related로 가리키는 문서 목록(정렬됨).
export function backlinks(cfg, cwd, target) {
  const { referencedBy } = collectDocGraph(cfg, cwd)
  return [...(referencedBy.get(normalizeQueryPath(target)) ?? [])].sort()
}

function typeOf(file, cfg) {
  const derived = cfg.typeByPath.find((r) => new RegExp(r.pattern).test(file))?.type
  return derived ?? null
}

// 어디서도 링크·basis·related로 언급되지 않고 태그도 없는 문서(정렬됨).
// 조회 대상에서 뺄 type은 설정의 orphans.excludeTypes에서 읽는다(`jam`에서는 'ticket').
export function findOrphans(cfg, cwd) {
  const { docs, referencedBy, tags } = collectDocGraph(cfg, cwd)
  const excluded = new Set(cfg.orphans.excludeTypes)
  return docs
    .filter((f) => !excluded.has(typeOf(f, cfg)) && !cfg.orphans.excludeSources.includes(f))
    .filter((f) => !(referencedBy.get(f)?.size > 0) && (tags.get(f) ?? []).length === 0)
    .sort()
}

// ───────────────────────── 보고 ─────────────────────────

function groupOf(file, cfg) {
  return cfg.report.groups.find((g) => file.startsWith(g.prefix))?.name ?? '기타'
}

export function summarize(problems, cfg) {
  const rows = new Map()
  for (const p of problems) {
    if (p.kind === 'field') continue
    const g = groupOf(p.file, cfg)
    if (!rows.has(g)) rows.set(g, { link: 0, codespan: 0, unresolvable: 0 })
    rows.get(g)[p.kind]++
  }
  return rows
}

export function formatProblems(problems) {
  return problems.map((p) => `  ${p.file}:${p.line ?? 1} [${p.severity === 'error' ? '오류' : '경고'}] ${p.message}`)
}

// ───────────────────────── CLI ─────────────────────────

function main(argv) {
  const args = argv.slice(2)
  const cfgIdx = args.indexOf('--config')
  const cfgPath = cfgIdx >= 0 ? args[cfgIdx + 1] : 'scripts/doc-check.config.json'
  const cfg = loadConfig(cfgPath)
  const cwd = process.cwd()

  if (args.includes('--staged')) {
    const { problems } = checkStaged(cfg, cwd)
    const errors = problems.filter((p) => p.severity === 'error')
    const warns = problems.filter((p) => p.severity !== 'error')
    if (warns.length > 0) {
      console.error(`\n경고(pre-commit): 문서 검사 경고 ${warns.length}건 (커밋은 진행합니다)`)
      console.error(formatProblems(warns).join('\n'))
    }
    if (errors.length > 0) {
      console.error(`\n차단(pre-commit): 문서 검사 오류 ${errors.length}건`)
      console.error(formatProblems(errors).join('\n'))
      if (errors.some((p) => p.kind !== 'field')) {
        console.error('  링크: 새로 추가한 링크는 존재하는 경로여야 하고, 이동·삭제한 파일을 가리키는 문서는 같은 커밋에서 고쳐야 합니다.')
      }
      if (errors.some((p) => p.kind === 'field')) {
        console.error('  frontmatter: type·description 등 필드 규칙은 docs/DOCUMENT_SCHEMA.md를 참고하세요.')
      }
      return EXIT_VIOLATION
    }
    return 0
  }

  if (args.includes('--all')) {
    const { problems, totals } = checkAll(cfg, cwd)
    if (!args.includes('--summary')) console.log(formatProblems(problems).join('\n'))
    console.log(`\n검사 문서 ${totals.docs}개 / 링크 ${totals.link}개 / 코드 스팬 경로 ${totals.codespan}개 (코드 블록 제외)`)
    let sumLink = 0
    let sumSpan = 0
    for (const [group, r] of summarize(problems, cfg)) {
      console.log(`  ${group}: 깨진 링크 ${r.link}, 깨진 경로(코드 스팬) ${r.codespan}, 해석 불가 ${r.unresolvable}`)
      sumLink += r.link
      sumSpan += r.codespan
    }
    console.log(`  합계: 깨진 링크 ${sumLink}, 깨진 경로(코드 스팬) ${sumSpan}`)
    console.log(`  frontmatter 경고/오류: ${problems.filter((p) => p.kind === 'field').length}건`)
    return problems.some((p) => p.severity === 'error') ? EXIT_VIOLATION : 0
  }

  if (args.includes('--backlinks')) {
    const target = args[args.indexOf('--backlinks') + 1]
    if (!target || target.startsWith('--')) {
      console.error('사용법: node scripts/doc-check.mjs --backlinks <문서 경로> [--config <경로>]')
      return 2
    }
    const result = backlinks(cfg, cwd, target)
    if (result.length === 0) {
      console.log(`${target}을(를) 링크·basis·related로 가리키는 문서가 없습니다.`)
    } else {
      console.log(`${target}을(를) 가리키는 문서 ${result.length}개:`)
      for (const f of result) console.log(`  ${f}`)
    }
    return 0
  }

  if (args.includes('--orphans')) {
    const result = findOrphans(cfg, cwd)
    console.log(`고아 문서 ${result.length}개(링크·basis·related·태그 어디에도 없음, 티켓 제외):`)
    for (const f of result) console.log(`  ${f}`)
    return 0
  }

  console.error(
    '사용법: node scripts/doc-check.mjs (--staged | --all [--summary] | --backlinks <경로> | --orphans) [--config <경로>]',
  )
  return 2
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let code
  try {
    code = main(process.argv)
  } catch (e) {
    console.error(`\n경고(pre-commit): 문서 검사기가 스스로 실패했습니다 — 검사를 건너뜁니다: ${e.message}`)
    code = 2
  }
  process.exit(code)
}
