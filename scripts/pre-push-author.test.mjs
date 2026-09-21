// pre-push 끝 커밋 작성자 검사 테스트 (티켓 20260921_1231)
// 임시 저장소에서 훅을 직접 실행한다. GIT_* 변수와 전역 설정은 격리해 실제 저장소를 건드리지 않는다.
// 실행: node scripts/pre-push-author.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks', 'pre-push')
const ZERO = '0'.repeat(40)

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

const base = mkdtempSync(join(tmpdir(), 'pre-push-author-'))
try {
  git(['init', '-q', base], base)
  const commitAs = (email) => {
    git(['-c', 'user.name=x', '-c', `user.email=${email}`, 'commit', '-q', '--allow-empty', '-m', email], base)
    return git(['rev-parse', 'HEAD'], base)
  }
  const good = commitAs('sihyunrr@gmail.com')
  const bad = commitAs('t@example.com')

  const run = (sha, ref, extra) =>
    spawnSync('bash', [HOOK], {
      cwd: base,
      encoding: 'utf8',
      env: env({ JAM_SHIP: '1', JAM_SKIP_LINT: '1', ...extra }),
      input: `refs/heads/x ${sha} ${ref} ${ZERO}\n`,
    })

  for (const ref of ['refs/heads/staging', 'refs/heads/main']) {
    const blocked = run(bad, ref)
    assert.equal(blocked.status, 1, `${ref}: example.com 작성자는 차단되어야 한다`)
    assert.match(blocked.stderr, /t@example\.com/)
    assert.equal(run(good, ref).status, 0, `${ref}: 정상 작성자는 통과해야 한다`)
  }

  const skipped = run(bad, 'refs/heads/staging', { JAM_SKIP_AUTHOR_CHECK: '1' })
  assert.equal(skipped.status, 0)
  assert.match(skipped.stderr, /JAM_SKIP_AUTHOR_CHECK=1/)

  assert.equal(run(ZERO, 'refs/heads/staging').status, 0, '삭제 push는 검사하지 않는다')

  const cfg = spawnSync('git', ['config', '--local', '--list'], { cwd: base, encoding: 'utf8', env: env() }).stdout
  assert.doesNotMatch(cfg, /example\.com/, '테스트가 저장소 설정을 오염시켰다')
  console.log('통과: pre-push 끝 커밋 작성자 검사')
} finally {
  rmSync(base, { recursive: true, force: true })
}
