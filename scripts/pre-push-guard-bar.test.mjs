// pre-push 기준 방어(guard the bar) 검사 테스트 (티켓 20260921_2304)
//
// 임시 저장소에서 훅을 직접 실행한다. 시나리오마다 초기 커밋(root)으로 리셋한 뒤 그 위에
// 커밋 하나만 얹어, diff가 "이번 push 범위"만 반영하도록 만든다. GIT_* 변수와 전역 설정은
// 격리해 실제 저장소를 건드리지 않는다.
// 실행: node scripts/pre-push-guard-bar.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-push')

const env = (extra = {}) => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && !k.startsWith('JAM_')) e[k] = v
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}
const commit = (cwd, message) => {
  git(['-c', 'user.name=x', '-c', 'user.email=dev@jam.internal', 'commit', '-q', '-m', message], cwd)
  return git(['rev-parse', 'HEAD'], cwd)
}
const writeAndAdd = (cwd, relPath, content) => {
  const abs = join(cwd, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  git(['add', relPath], cwd)
}
const reset = (cwd, sha) => {
  git(['reset', '-q', '--hard', sha], cwd)
  git(['clean', '-q', '-fd'], cwd)
}
const runHook = (cwd, oldSha, newSha) =>
  spawnSync('bash', [HOOK], {
    cwd,
    encoding: 'utf8',
    env: env({ JAM_SKIP_LINT: '1' }),
    input: `refs/heads/x ${newSha} refs/heads/staging ${oldSha}\n`,
  })

const base = mkdtempSync(join(tmpdir(), 'pre-push-guard-bar-'))
try {
  git(['init', '-q', base], base)
  writeAndAdd(base, 'jam-web/package.json', JSON.stringify({ scripts: { 'lint:ci': 'eslint --cache --max-warnings 26' } }))
  writeAndAdd(base, 'jam-web/src/example.ts', 'export const x = 1\n')
  const root = commit(base, 'init')

  // 1) 사유 없는 eslint-disable 추가는 막힌다
  reset(base, root)
  writeAndAdd(
    base,
    'jam-web/src/example.ts',
    'export const x = 1\n// eslint-disable-next-line no-explicit-any\nexport const y: any = 2\n'
  )
  let sha = commit(base, 'add suppression without reason')
  let r = runHook(base, root, sha)
  assert.equal(r.status, 1, 'eslint-disable에 사유가 없으면 막혀야 한다')
  assert.match(r.stderr, /새 억제 주석에 사유가 없습니다/)

  // 2) 같은 줄에 "-- 사유"가 있으면 통과한다
  reset(base, root)
  writeAndAdd(
    base,
    'jam-web/src/example.ts',
    'export const x = 1\n// eslint-disable-next-line no-explicit-any -- 레거시 타입, 정리 예정\nexport const y: any = 2\n'
  )
  sha = commit(base, 'add suppression with reason')
  r = runHook(base, root, sha)
  assert.equal(r.status, 0, `사유가 있으면 통과해야 한다:\n${r.stderr}`)

  // 3) @ts-ignore도 사유가 없으면 막힌다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/example.ts', 'export const x = 1\n// @ts-ignore\nexport const y = 2\n')
  sha = commit(base, 'add ts-ignore')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '@ts-ignore에 사유가 없으면 막혀야 한다')

  // 4) jam-web 밖에서 같은 단어를 언급해도 통과한다 (훅·문서 자신을 오탐하지 않는다)
  reset(base, root)
  writeAndAdd(base, 'docs/note.md', '이 문서는 eslint-disable·@ts-ignore·it.skip(을 설명한다.\n')
  sha = commit(base, 'doc mentions guard words')
  r = runHook(base, root, sha)
  assert.equal(r.status, 0, `jam-web 밖의 언급은 통과해야 한다:\n${r.stderr}`)

  // 5) it.skip 추가는 막힌다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/example.test.ts', "it.skip('보류', () => {})\n")
  sha = commit(base, 'add skip')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '.skip 추가는 막혀야 한다')
  assert.match(r.stderr, /건너뛰거나 하나만 실행/)

  // 6) test.only 추가도 막힌다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/example.test.ts', "test.only('집중', () => {})\n")
  sha = commit(base, 'add only')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '.only 추가는 막혀야 한다')

  // 7) 사유 없는 테스트 파일 삭제는 막힌다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/todelete.test.ts', "it('x', () => {})\n")
  const withTestFile = commit(base, 'add test file')
  git(['rm', '-q', 'jam-web/src/todelete.test.ts'], base)
  sha = commit(base, 'remove test file without reason')
  r = runHook(base, withTestFile, sha)
  assert.equal(r.status, 1, '사유 없는 테스트 파일 삭제는 막혀야 한다')
  assert.match(r.stderr, /테스트 파일이 삭제됐습니다/)

  // 8) 커밋 메시지에 "테스트 삭제: <사유>" 줄이 있으면 통과한다
  reset(base, withTestFile)
  git(['rm', '-q', 'jam-web/src/todelete.test.ts'], base)
  sha = commit(base, '중복 테스트 정리\n\n테스트 삭제: todelete는 example.test로 통합됨')
  r = runHook(base, withTestFile, sha)
  assert.equal(r.status, 0, `커밋 메시지에 사유가 있으면 통과해야 한다:\n${r.stderr}`)

  // 9) --max-warnings 상향은 막힌다
  reset(base, root)
  writeAndAdd(base, 'jam-web/package.json', JSON.stringify({ scripts: { 'lint:ci': 'eslint --cache --max-warnings 40' } }))
  sha = commit(base, 'raise max-warnings')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '--max-warnings 상향은 막혀야 한다')
  assert.match(r.stderr, /--max-warnings 값을 높였습니다/)

  // 10) --max-warnings 하향은 통과한다
  reset(base, root)
  writeAndAdd(base, 'jam-web/package.json', JSON.stringify({ scripts: { 'lint:ci': 'eslint --cache --max-warnings 10' } }))
  sha = commit(base, 'lower max-warnings')
  r = runHook(base, root, sha)
  assert.equal(r.status, 0, `--max-warnings 하향은 통과해야 한다:\n${r.stderr}`)

  // 11~13) diff의 파일 경계 판별 (티켓 20260922_0206)
  //
  // 내용이 "++ "로 시작하는 추가 줄은 diff에서 "+++ "로 보인다. 이 줄을 파일 헤더(+++ b/경로)로
  // 오인하면 이후 줄이 엉뚱한 파일로 귀속된다.

  // 11) jam-web 파일에서 "++ " 줄 뒤에 오는 사유 없는 억제 주석도 막힌다
  //     (오인하면 뒤 줄이 "retryCount" 파일 것이 되어 jam-web 검사를 빠져나간다)
  reset(base, root)
  writeAndAdd(
    base,
    'jam-web/src/example.ts',
    'export const x = 1\nlet retryCount = 0\n++ retryCount\n// eslint-disable-next-line rule-in-example\nexport const y: any = retryCount\n'
  )
  sha = commit(base, 'plus-plus line before suppression without reason')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '"++ "로 시작하는 줄 뒤의 사유 없는 억제 주석도 막혀야 한다')
  assert.match(r.stderr, /새 억제 주석에 사유가 없습니다/)
  assert.match(r.stderr, /rule-in-example/)

  // 12) jam-web 밖 문서의 "++ jam-web/….ts" 줄이 뒤 줄을 jam-web 파일로 둔갑시키지 않는다
  //     (오인하면 문서의 eslint-disable 언급이 jam-web 억제 주석으로 판정돼 정상 push가 막힌다)
  reset(base, root)
  writeAndAdd(base, 'docs/note.md', '# 메모\n++ jam-web/src/fake.ts\n이 문서는 eslint-disable를 설명한다.\n')
  sha = commit(base, 'doc with plus-plus line naming a jam-web path')
  r = runHook(base, root, sha)
  assert.equal(r.status, 0, `jam-web 밖 문서의 "++ " 줄이 파일 경계를 바꾸면 안 된다:\n${r.stderr}`)

  // 13) 삭제(+++ /dev/null)·신규·수정이 섞인 diff에서도 파일 경계가 정확하다
  //     차단 메시지에는 jam-web 안의 위반 줄 둘만 나오고 문서의 언급 줄은 나오지 않는다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/old.ts', "export const legacyValue = 'aaaaaaaaaaaaaaaaaaaaaaaa'\n")
  const withOldFile = commit(base, 'add old file')
  git(['rm', '-q', 'jam-web/src/old.ts'], base)
  writeAndAdd(base, 'docs/note.md', '이 문서는 eslint-disable rule-in-docs 를 설명한다.\n')
  writeAndAdd(
    base,
    'jam-web/src/example.ts',
    'export const x = 1\nlet retryCount = 0\n++ retryCount\n// eslint-disable-next-line rule-in-example\nexport const y: any = retryCount\n'
  )
  writeAndAdd(base, 'jam-web/src/z-new.ts', '// eslint-disable-next-line rule-in-new-file\nexport const fresh: any = 2\n')
  sha = commit(base, 'mixed diff: delete, modify, add')
  r = runHook(base, withOldFile, sha)
  assert.equal(r.status, 1, '삭제·수정·신규가 섞인 diff에서도 사유 없는 억제 주석은 막혀야 한다')
  assert.match(r.stderr, /rule-in-example/, '"++ " 줄 뒤의 수정 파일 위반 줄이 목록에 있어야 한다')
  assert.match(r.stderr, /rule-in-new-file/, '삭제 헤더 뒤의 신규 파일 위반 줄이 목록에 있어야 한다')
  assert.doesNotMatch(r.stderr, /rule-in-docs/, '문서의 언급 줄이 jam-web 위반으로 올라오면 안 된다')

  // 14~16) 사용자·환경 git 설정에 검사가 흔들리지 않는다 (티켓 20260922_0605)
  //
  // 설정은 임시 저장소의 로컬 config에만 쓴다(전역 설정은 env()가 격리). 시나리오가 끝나면 되돌린다.

  // 14) color.diff=always여도 사유 없는 억제 주석은 막힌다
  //     (옛 훅은 ANSI 색상 코드 때문에 awk 패턴이 하나도 맞지 않아 아무것도 수집하지 못하고 통과했다)
  reset(base, root)
  git(['config', 'color.diff', 'always'], base)
  try {
    writeAndAdd(
      base,
      'jam-web/src/example.ts',
      'export const x = 1\n// eslint-disable-next-line rule-under-color\nexport const y: any = 2\n'
    )
    sha = commit(base, 'suppression without reason under color.diff=always')
    r = runHook(base, root, sha)
    assert.equal(r.status, 1, 'color.diff=always여도 사유 없는 억제 주석은 막혀야 한다')
    assert.match(r.stderr, /rule-under-color/)

    // 15) color.diff=always에서도 정상 push(사유 있는 억제 주석)는 새로 막히지 않는다
    reset(base, root)
    writeAndAdd(
      base,
      'jam-web/src/example.ts',
      'export const x = 1\n// eslint-disable-next-line no-explicit-any -- 레거시 타입, 정리 예정\nexport const y: any = 2\n'
    )
    sha = commit(base, 'suppression with reason under color.diff=always')
    r = runHook(base, root, sha)
    assert.equal(r.status, 0, `color.diff=always에서도 사유가 있으면 통과해야 한다:\n${r.stderr}`)
  } finally {
    git(['config', '--unset', 'color.diff'], base)
  }

  // 16) 비ASCII 경로(jam-web/src/한글.ts)의 위반도 막힌다
  //     (기본 core.quotePath=true에서 경로가 따옴표+8진수 이스케이프로 출력돼 ^jam-web/ 필터를 빠져나갔다)
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/한글.ts', '// eslint-disable-next-line rule-in-korean-path\nexport const 값 = 1\n')
  sha = commit(base, 'suppression without reason in non-ascii path')
  r = runHook(base, root, sha)
  assert.equal(r.status, 1, '비ASCII 경로의 사유 없는 억제 주석도 막혀야 한다')
  assert.match(r.stderr, /rule-in-korean-path/)

  // 17) 비ASCII 경로의 정상 변경은 새로 막히지 않는다
  reset(base, root)
  writeAndAdd(base, 'jam-web/src/한글.ts', 'export const 값 = 1\n')
  sha = commit(base, 'clean change in non-ascii path')
  r = runHook(base, root, sha)
  assert.equal(r.status, 0, `비ASCII 경로의 정상 변경은 통과해야 한다:\n${r.stderr}`)

  console.log('통과: pre-push 기준 방어(guard the bar) 검사')
} finally {
  rmSync(base, { recursive: true, force: true })
}
