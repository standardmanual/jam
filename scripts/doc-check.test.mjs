// doc-check.mjs 테스트 (티켓 20260919_1245)
//
// verify.sh는 루트 scripts/의 테스트를 돌리지 않으므로 직접 실행한다.
// 실행: node scripts/doc-check.test.mjs
//
// 순수 함수 단위 테스트 + 임시 git 저장소를 만들어 --staged 동작(차단·통과·엔진 자체 실패)을 검증한다.
// 저장소의 실제 훅 경로 설정은 건드리지 않는다.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkFrontmatter,
  cleanLinkTarget,
  extractRefs,
  inScope,
  loadConfig,
  makeExistence,
  normalizeConfig,
  parseAddedLines,
  parseFrontmatter,
  parseNameStatus,
  resolveTarget,
  EXIT_VIOLATION,
} from './doc-check.mjs'

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), 'doc-check.mjs')

const RAW_CFG = {
  schemaVersion: '1',
  scope: { include: ['docs/', 'ext/'], exclude: ['docs/skip/', '**/IGNORED.md'] },
  externalPrefixes: ['ext/'],
  codeSpanRoots: ['docs/', 'src/', 'ext/'],
  typeByPath: [{ pattern: '^docs/entries/', type: 'entry' }],
  statusSets: { life: ['draft', 'active'], entry: ['OPEN', 'CLOSED'] },
  types: {
    note: { active: true, statusSet: 'life', required: ['tags'], enums: { level: ['low', 'high'] }, fields: ['level'] },
    entry: { active: true, statusSet: 'entry', exempt: ['type', 'description'] },
    later: { active: false },
  },
  tags: { vocabulary: ['alpha', 'beta'], forbidden: ['gamma'] },
  report: { groups: [{ name: 'entries', prefix: 'docs/entries/' }] },
}
const cfg = normalizeConfig(RAW_CFG)

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
  } catch (e) {
    console.error(`실패: ${name}\n${e.stack}`)
    process.exitCode = 1
  }
}

// ───────── 참조 추출 ─────────

test('코드 블록(``` 와 ~~~) 안의 링크·경로는 제외한다', () => {
  const md = [
    '본문 [a](a.md)',
    '```',
    '[b](b.md) `docs/b.md`',
    '```',
    '~~~js',
    '[c](c.md)',
    '~~~',
    '끝 [d](d.md)',
  ].join('\n')
  assert.deepEqual(extractRefs(md, cfg).map((r) => r.target), ['a.md', 'd.md'])
})

test('더 긴 펜스 안의 짧은 펜스는 닫는 펜스가 아니다', () => {
  const md = ['````', '```', '[x](x.md)', '```', '````', '[y](y.md)'].join('\n')
  assert.deepEqual(extractRefs(md, cfg).map((r) => r.target), ['y.md'])
})

test('앵커·외부 URL·mailto는 무시하고 파일 부분만 남긴다', () => {
  const md = '[a](#top) [b](https://example.com/x.md) [c](mailto:a@b.c) [d](d.md#sec) [e](e.md?x=1)'
  assert.deepEqual(extractRefs(md, cfg).map((r) => r.target), ['d.md', 'e.md'])
})

test('상대 링크·부모 경로·꺾쇠 괄호·제목이 있는 링크', () => {
  const md = '[a](../up/a.md) [b](<sp/b.md>) [c](c.md "제목") ![img](img/p.png)'
  assert.deepEqual(extractRefs(md, cfg).map((r) => r.target), ['../up/a.md', 'sp/b.md', 'c.md', 'img/p.png'])
})

test('퍼센트 인코딩 링크는 디코딩한다', () => {
  assert.equal(cleanLinkTarget('%ED%95%9C%EA%B8%80.md'), '한글.md')
  assert.equal(cleanLinkTarget('100%.md'), '100%.md')
})

test('참조 정의 링크를 수집한다', () => {
  assert.deepEqual(extractRefs('[ref]: docs/r.md', cfg).map((r) => r.target), ['docs/r.md'])
})

test('백틱 경로: 루트 접두어가 맞는 것만, :줄번호·#앵커 제거, 와일드카드·자리표시자 제외', () => {
  const md = '`docs/a.md:317` `docs/b.md#x` `docs/*/c.md` `docs/{x}/d.md` `docs/e...` `other/f.md` `docs/g h.md` `docs/i.md`'
  const refs = extractRefs(md, cfg)
  assert.deepEqual(refs.map((r) => r.target), ['docs/a.md', 'docs/b.md', 'docs/i.md'])
  assert.ok(refs.every((r) => r.kind === 'codespan'))
})

test('코드 스팬 안의 마크다운 링크는 링크로 세지 않는다', () => {
  const refs = extractRefs('`[a](a.md)` [b](b.md)', cfg)
  assert.deepEqual(refs.map((r) => `${r.kind}:${r.target}`), ['link:b.md'])
})

test('frontmatter 안은 훑지 않고 줄 번호는 원문 기준이다', () => {
  const md = ['---', 'description: `docs/in-front.md`', '---', '', '[a](a.md)'].join('\n')
  assert.deepEqual(extractRefs(md, cfg), [{ line: 5, kind: 'link', target: 'a.md' }])
})

// ───────── 경로 해석·존재 ─────────

test('상대 링크는 문서 위치 기준, 백틱 경로는 작업 폴더 기준으로 해석한다', () => {
  assert.equal(resolveTarget('docs/a/x.md', { kind: 'link', target: '../b/y.md' }), 'docs/b/y.md')
  assert.equal(resolveTarget('docs/a/x.md', { kind: 'link', target: '/src/z.ts' }), 'src/z.ts')
  assert.equal(resolveTarget('docs/a/x.md', { kind: 'codespan', target: 'docs/b/y.md' }), 'docs/b/y.md')
  assert.equal(resolveTarget('docs/x.md', { kind: 'link', target: '../../out.md' }), null)
})

test('존재 판정: 파일·폴더는 ok, 없으면 missing, 외부 접두어 폴더가 없으면 unresolvable', () => {
  const ex = makeExistence({ files: ['docs/a/b.md'], rootDir: join(tmpdir(), 'no-such-root-xyz'), externalPrefixes: ['ext/'] })
  assert.equal(ex.status('docs/a/b.md'), 'ok')
  assert.equal(ex.status('docs/a'), 'ok')
  assert.equal(ex.status('docs/a/c.md'), 'missing')
  assert.equal(ex.status('ext/x.md'), 'unresolvable')
})

test('범위 판정: 포함·제외 폴더·기본 이름 제외', () => {
  assert.equal(inScope('docs/a.md', cfg), true)
  assert.equal(inScope('docs/skip/a.md', cfg), false)
  assert.equal(inScope('docs/sub/IGNORED.md', cfg), false)
  assert.equal(inScope('docs/a.json', cfg), false)
  assert.equal(inScope('other/a.md', cfg), false)
})

// ───────── frontmatter ─────────

test('frontmatter 파서: 스칼라·목록·인라인 목록·따옴표 문자열', () => {
  const fm = parseFrontmatter(['---', 'id: "20260101_0001"', 'tags: [alpha, beta]', 'basis:', '  - docs/a.md', '  - docs/b.md', 'x: y # 주석', '---', '본문'].join('\n'))
  assert.deepEqual(fm.data, { id: '20260101_0001', tags: ['alpha', 'beta'], basis: ['docs/a.md', 'docs/b.md'], x: 'y' })
  assert.equal(parseFrontmatter('본문만'), null)
})

test('frontmatter 검사: 정상 문서는 문제가 없다', () => {
  const text = '---\ntype: note\ndescription: 설명\nstatus: active\ntags: [alpha]\n---\n'
  assert.deepEqual(checkFrontmatter('docs/a.md', text, cfg), [])
})

test('frontmatter 검사: 필수 필드·status·태그 어휘·금지 태그·열거값·알 수 없는 필드', () => {
  const text = '---\ntype: note\nstatus: weird\ntags: [alpha, zzz, gamma]\nlevel: mid\nextra: 1\n---\n'
  const msgs = checkFrontmatter('docs/a.md', text, cfg).map((p) => p.message).join('\n')
  assert.match(msgs, /'description'/)
  assert.match(msgs, /status 'weird'/)
  assert.match(msgs, /어휘에 없는 태그 'zzz'/)
  assert.match(msgs, /금지 표기 태그 'gamma'/)
  assert.match(msgs, /'level' 값 'mid'/)
  assert.match(msgs, /알 수 없는 필드 'extra'/)
})

test('frontmatter 검사: 없음·미지의 type·비활성 type은 경고 등급', () => {
  const none = checkFrontmatter('docs/a.md', '본문', cfg)
  assert.equal(none.length, 1)
  assert.equal(none[0].severity, 'warn')
  assert.match(checkFrontmatter('docs/a.md', '---\ntype: nope\ndescription: d\n---\n', cfg)[0].message, /알 수 없는 type/)
  assert.match(checkFrontmatter('docs/a.md', '---\ntype: later\ndescription: d\n---\n', cfg)[0].message, /활성화되지 않은/)
})

test('frontmatter 검사: 경로로 type이 정해지는 문서는 type·description이 면제다', () => {
  assert.deepEqual(checkFrontmatter('docs/entries/e.md', '---\nstatus: OPEN\n---\n', cfg), [])
  assert.match(checkFrontmatter('docs/entries/e.md', '---\nstatus: open\n---\n', cfg)[0].message, /status 'open'/)
})

test('엄격 모드에서는 미지의 type이 오류가 되고, 등급 설정으로 필드 검사를 오류로 올릴 수 있다', () => {
  const strict = normalizeConfig({ ...RAW_CFG, strict: true })
  assert.equal(checkFrontmatter('docs/a.md', '---\ntype: nope\ndescription: d\n---\n', strict)[0].severity, 'error')
  const hard = normalizeConfig({ ...RAW_CFG, severity: { field: 'error' } })
  assert.equal(checkFrontmatter('docs/a.md', '본문', hard)[0].severity, 'error')
})

// ───────── git 출력 파싱 ─────────

test('diff 헝크에서 추가된 줄 번호를 뽑는다', () => {
  const diff = ['@@ -1,2 +1,0 @@', '@@ -5 +4,2 @@', '@@ -9,0 +12 @@'].join('\n')
  assert.deepEqual([...parseAddedLines(diff)], [4, 5, 12])
})

test('name-status -z 출력을 이동·삭제 항목까지 파싱한다', () => {
  const out = 'A\0docs/new.md\0R100\0docs/old.md\0docs/moved.md\0D\0docs/gone.md\0'
  assert.deepEqual(parseNameStatus(out), [
    { status: 'A', path: 'docs/new.md' },
    { status: 'R', oldPath: 'docs/old.md', path: 'docs/moved.md' },
    { status: 'D', path: 'docs/gone.md' },
  ])
})

// ───────── 설정 ─────────

test('설정 오류는 예외로 알린다', () => {
  assert.throws(() => normalizeConfig([]), /객체/)
  assert.throws(() => normalizeConfig({ scope: { include: 'x' } }), /배열/)
  assert.throws(() => normalizeConfig({ types: { t: { statusSet: 'none' } } }), /statusSet/)
  assert.throws(() => loadConfig(join(tmpdir(), 'no-such-config.json')), /읽을 수 없습니다/)
})

// ───────── 임시 저장소 통합: --staged ─────────

const tmpDirs = []

function run(cmd, args, cwd, env = {}) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
}

function makeRepo(files, config = RAW_CFG) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-test-'))
  tmpDirs.push(dir)
  run('git', ['init', '-q'], dir)
  run('git', ['config', 'user.email', 't@example.com'], dir)
  run('git', ['config', 'user.name', 'tester'], dir)
  run('git', ['config', 'core.hooksPath', '/dev/null'], dir)
  writeFile(dir, 'check.config.json', JSON.stringify(config))
  for (const [p, body] of Object.entries(files)) writeFile(dir, p, body)
  run('git', ['add', '-A'], dir)
  run('git', ['commit', '-q', '-m', 'base'], dir)
  return dir
}

function writeFile(dir, rel, body) {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function staged(dir, mutate) {
  mutate(dir)
  run('git', ['add', '-A'], dir)
  return run('node', [ENGINE, '--staged', '--config', 'check.config.json'], dir)
}

const FM = '---\ntype: note\ndescription: d\ntags: [alpha]\n---\n'

test('없는 경로로 링크를 추가하면 차단(종료 10)', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문\n[x](missing.md)\n`))
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  assert.match(r.stderr, /docs\/a\.md:\d+ \[오류\] 링크 대상이 없습니다: missing\.md/)
})

test('존재하는 경로로 링크를 추가하면 통과', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n`, 'docs/b.md': `${FM}b\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문\n[x](b.md#앵커)\n`))
  assert.equal(r.status, 0, r.stderr)
})

test('기존에 깨진 링크만 있는 문서의 다른 줄을 고쳐도 통과(추가된 줄만 검사)', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}옛 [깨짐](gone.md)\n다른 줄\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}옛 [깨짐](gone.md)\n고친 줄\n`))
  assert.equal(r.status, 0, r.stderr)
})

test('기존 깨진 링크가 있는 줄 자체를 고치면 그 링크는 검사 대상이 된다', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}옛 [깨짐](gone.md)\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}옛 [깨짐](gone.md) 수정\n`))
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
})

test('코드 블록 안의 깨진 링크는 무시한다', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문\n\`\`\`\n[x](nope.md)\n\`\`\`\n`))
  assert.equal(r.status, 0, r.stderr)
})

test('백틱 경로가 깨지면 경고만 하고 통과', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문 \`docs/none.md\`\n`))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /\[경고\] 경로가 없습니다: docs\/none\.md/)
})

test('링크된 파일을 git mv 하면 차단, 참조 문서를 같은 커밋에서 고치면 통과', () => {
  const files = { 'docs/a.md': `${FM}[t](target.md)\n`, 'docs/target.md': `${FM}t\n`, 'docs/c/other.md': `${FM}o\n` }
  const dir = makeRepo(files)
  mkdirSync(join(dir, 'docs/moved'), { recursive: true })
  run('git', ['mv', 'docs/target.md', 'docs/moved/target.md'], dir)
  let r = run('node', [ENGINE, '--staged', '--config', 'check.config.json'], dir)
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  assert.match(r.stderr, /docs\/a\.md:\d+ \[오류\] 링크가 이동·삭제된 파일을 가리킵니다: target\.md/)

  writeFile(dir, 'docs/a.md', `${FM}[t](moved/target.md)\n`)
  run('git', ['add', '-A'], dir)
  r = run('node', [ENGINE, '--staged', '--config', 'check.config.json'], dir)
  assert.equal(r.status, 0, r.stderr)
})

test('링크된 파일을 삭제하면 차단, 링크되지 않은 파일 삭제는 통과', () => {
  const files = { 'docs/a.md': `${FM}[t](target.md)\n`, 'docs/target.md': `${FM}t\n`, 'docs/free.md': `${FM}f\n` }
  const dir = makeRepo(files)
  let r = staged(dir, (d) => rmSync(join(d, 'docs/target.md')))
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  run('git', ['reset', '-q', '--hard'], dir)
  r = staged(dir, (d) => rmSync(join(d, 'docs/free.md')))
  assert.equal(r.status, 0, r.stderr)
})

test('이동·삭제된 경로를 가리키는 옛 링크는 기존에 깨진 다른 링크와 무관하게 전수 검사된다', () => {
  const files = { 'docs/a.md': `${FM}[old](gone.md)\n`, 'docs/x/deep.md': `${FM}[t](../target.md)\n`, 'docs/target.md': `${FM}t\n` }
  const dir = makeRepo(files)
  const r = staged(dir, (d) => rmSync(join(d, 'docs/target.md')))
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  assert.match(r.stderr, /docs\/x\/deep\.md/)
  assert.ok(!r.stderr.includes('docs/a.md:'), '이동·삭제와 무관한 기존 깨진 링크는 보고하지 않는다')
})

test('문서를 다른 폴더로 옮기면 그 문서의 상대 링크 전체를 다시 검사한다', () => {
  const files = { 'docs/a/x.md': `${FM}[s](../sib.md)\n`, 'docs/sib.md': `${FM}s\n` }
  const dir = makeRepo(files)
  mkdirSync(join(dir, 'docs/a/b'), { recursive: true })
  run('git', ['mv', 'docs/a/x.md', 'docs/a/b/x.md'], dir)
  const r = run('node', [ENGINE, '--staged', '--config', 'check.config.json'], dir)
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  assert.match(r.stderr, /docs\/a\/b\/x\.md/)
})

test('외부 접두어 폴더가 없으면 해석 불가 경고로 통과, 폴더가 있는데 파일이 없으면 차단', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  let r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문\n[e](../ext/x.md)\n`))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /해석 불가/)
  mkdirSync(join(dir, 'ext'), { recursive: true })
  r = staged(dir, (d) => writeFile(d, 'docs/a.md', `${FM}본문\n[e](../ext/x.md) 수정\n`))
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
})

test('frontmatter 문제는 경고만 하고 통과', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/b.md', '본문만 있는 문서\n'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /frontmatter가 없습니다/)
})

test('범위 밖 문서의 깨진 링크는 검사하지 않는다', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => writeFile(d, 'docs/skip/z.md', '[x](nope.md)\n'))
  assert.equal(r.status, 0, r.stderr)
})

test('설정 파싱 오류는 종료 2와 경고 메시지(호출자가 통과 처리)', () => {
  const dir = makeRepo({ 'docs/a.md': `${FM}본문\n` })
  const r = staged(dir, (d) => {
    writeFile(d, 'check.config.json', '{ 깨진 json')
    writeFile(d, 'docs/a.md', `${FM}본문\n[x](missing.md)\n`)
  })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /스스로 실패/)
})

test('git 저장소가 아니면 종료 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-nogit-'))
  tmpDirs.push(dir)
  writeFile(dir, 'check.config.json', JSON.stringify(RAW_CFG))
  const r = run('node', [ENGINE, '--staged', '--config', 'check.config.json'], dir, { GIT_CEILING_DIRECTORIES: tmpdir() })
  assert.equal(r.status, 2)
})

test('--all 실측: 코드 블록을 제외하고 그룹별로 센다', () => {
  const files = {
    'docs/a.md': `${FM}[ok](b.md) [bad](nope.md)\n\`\`\`\n[bad](nope2.md)\n\`\`\`\n`,
    'docs/b.md': `${FM}b\n`,
    'docs/entries/e.md': '---\nstatus: OPEN\n---\n[bad](nope.md) [bad2](nope2.md)\n',
  }
  const dir = makeRepo(files)
  const r = run('node', [ENGINE, '--all', '--summary', '--config', 'check.config.json'], dir)
  assert.equal(r.status, EXIT_VIOLATION, r.stderr)
  assert.match(r.stdout, /entries: 깨진 링크 2/)
  assert.match(r.stdout, /기타: 깨진 링크 1/)
  assert.match(r.stdout, /합계: 깨진 링크 3/)
})

for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
console.log(`doc-check 테스트 ${process.exitCode ? '실패 있음' : '통과'} (${passed}건 통과)`)
