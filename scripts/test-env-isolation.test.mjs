// 루트 테스트가 훅 환경의 GIT_* 변수를 받아도 실제 저장소 설정을 건드리지 않는지 확인한다 (티켓 20260921_1116)
//
// 배경: push 훅(.githooks/pre-push)이 scripts/verify.sh를 돌리면 git이 GIT_DIR를 물려준다. 아현은 링크드
// 워크트리에서 push하므로 그 값은 `<저장소>/.git/worktrees/<이름>`(워크트리 관리 디렉터리)이고
// GIT_WORK_TREE는 없다. 임시 저장소를 만드는 테스트가 이 값을 그대로 받으면:
//   - `git init -q`가 임시 폴더가 아니라 GIT_DIR가 가리키는 기존 저장소를 다시 초기화한다. 이때 git은
//     GIT_DIR가 `<cwd>/.git`가 아니므로 bare 저장소로 판단해 공용 .git/config에 core.bare = true를 쓴다
//     (git 2.54에서 확인. GIT_DIR가 메인 `.git`이면 일어나지 않고, 워크트리 관리 디렉터리일 때만 일어난다).
//   - `git config user.name tester`, `git config core.hooksPath /dev/null`이 같은 공용 config에 써진다.
// 실제로 메인 저장소가 작업 트리로 인식되지 않고, 훅이 꺼지고, 커밋 작성자가 바뀌는 사고가 났다.
//
// 방법: 감시용 저장소와 링크드 워크트리를 만들고, 워크트리 관리 디렉터리를 GIT_DIR로 가리킨 채 다른 루트
// 테스트를 하나씩 실행한다. 실행 뒤 감시용 저장소의 공용 설정이 실행 전과 다르면 실패한다. 새 테스트가
// 생겨도 자동으로 검사 대상이 된다.
// 실행: node scripts/test-env-isolation.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const SELF = basename(fileURLToPath(import.meta.url))

// 이 테스트가 만드는 감시용 저장소는 호출한 셸의 GIT_* 변수와 상관없이 만든다.
const plainEnv = () => {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: plainEnv() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout.trim()
}

const base = mkdtempSync(join(tmpdir(), 'test-env-isolation-'))
const main = join(base, 'main')
const linked = join(base, 'linked')
git(['init', '-q', main], base)
git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], main)
git(['config', 'extensions.worktreeConfig', 'true'], main)
git(['worktree', 'add', '-q', linked, 'HEAD'], main)
const worktreeGitDir = git(['rev-parse', '--absolute-git-dir'], linked)
assert.match(worktreeGitDir, /[\\/]worktrees[\\/]/, '링크드 워크트리의 관리 디렉터리를 얻지 못했다')
const configPath = join(main, '.git', 'config')
const before = readFileSync(configPath, 'utf8')

// pre-push 훅 안에서 물려받는 값을 그대로 흉내 낸다. GIT_WORK_TREE는 없다.
const hookEnv = { ...process.env, GIT_DIR: worktreeGitDir, GIT_PREFIX: '' }

const targets = readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.mjs') && f !== SELF).sort()
let failed = 0
try {
  for (const file of targets) {
    spawnSync('node', [join(SCRIPTS, file)], { cwd: join(SCRIPTS, '..'), encoding: 'utf8', env: hookEnv })
    const after = readFileSync(configPath, 'utf8')
    try {
      assert.equal(after, before, `${file}이(가) GIT_DIR로 가리킨 저장소의 공용 설정을 바꿨다:\n${after}`)
    } catch (e) {
      failed++
      console.error(`실패: ${e.message}`)
    }
  }
} finally {
  rmSync(base, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log(`통과: ${targets.length}개 테스트가 훅 환경(링크드 워크트리 GIT_DIR)에서도 저장소 설정을 바꾸지 않는다`)
