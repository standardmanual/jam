// 루트 테스트가 훅 환경의 GIT_* 변수를 받아도 실제 저장소 설정을 건드리지 않는지 확인한다 (티켓 20260921_1116)
//
// 배경: push 훅(.githooks/pre-push)이 scripts/verify.sh를 돌리면 git이 GIT_DIR 등을 물려준다. 임시 저장소를
// 만들어 `git init`·`git config`를 실행하는 테스트가 이 값을 그대로 받으면 임시 저장소가 아니라 실제
// 저장소 설정에 쓴다. 실제로 core.bare=true, core.hooksPath=/dev/null, user.name=tester가 메인 저장소에
// 써졌고 메인 체크아웃이 작업 트리로 인식되지 않는 사고가 났다.
//
// 방법: 감시용 임시 저장소를 만들고 GIT_DIR·GIT_WORK_TREE로 가리킨 채 다른 루트 테스트를 하나씩 실행한다.
// 실행 뒤 그 저장소의 설정 파일이 실행 전과 다르면 실패한다. 새 테스트가 생겨도 자동으로 검사 대상이 된다.
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

const sentinel = mkdtempSync(join(tmpdir(), 'test-env-isolation-'))
const init = spawnSync('git', ['init', '-q'], { cwd: sentinel, encoding: 'utf8', env: plainEnv() })
assert.equal(init.status, 0, init.stderr)
const configPath = join(sentinel, '.git', 'config')
const before = readFileSync(configPath, 'utf8')

// 훅 안에서 물려받는 값을 흉내 낸다.
const hookEnv = {
  ...process.env,
  GIT_DIR: join(sentinel, '.git'),
  GIT_WORK_TREE: sentinel,
  GIT_INDEX_FILE: join(sentinel, '.git', 'index'),
}

const targets = readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.mjs') && f !== SELF).sort()
let failed = 0
try {
  for (const file of targets) {
    spawnSync('node', [join(SCRIPTS, file)], { cwd: join(SCRIPTS, '..'), encoding: 'utf8', env: hookEnv })
    const after = readFileSync(configPath, 'utf8')
    try {
      assert.equal(after, before, `${file}이(가) GIT_DIR로 가리킨 저장소의 설정을 바꿨다:\n${after}`)
    } catch (e) {
      failed++
      console.error(`실패: ${e.message}`)
    }
  }
} finally {
  rmSync(sentinel, { recursive: true, force: true })
}

if (failed > 0) process.exit(1)
console.log(`통과: ${targets.length}개 테스트가 훅 환경(GIT_DIR)에서도 저장소 설정을 바꾸지 않는다`)
