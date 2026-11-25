// check-ui-approval.mjs 시험 (티켓 20261125_2013). 임시 git 저장소 픽스처로 8가지 경우와 실제 훅 차단을 확인한다.
// 실행: node scripts/check-ui-approval.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'check-ui-approval.mjs')
const HOOK = join(HERE, '..', '.githooks', 'commit-msg')

const env = () => {
  const e = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) e[k] = v
  return { ...e, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
}
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env() })
  assert.equal(r.status, 0, `git ${args.join(' ')} 실패:\n${r.stderr}`)
  return r.stdout
}
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const APPROVED = '---\nid: "20261125_0001"\n---\n- 사용자 승인: 2026-11-25 — 새 토큰\n'
const PLAIN = (id, parent) => `---\nid: "${id}"\n${parent ? `parent: "${parent}"\n` : ''}---\n본문\n`
const newRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'ui-approval-'))
  git(['init', '-q'], root)
  git(['config', 'user.email', 't@t'], root)
  git(['config', 'user.name', 't'], root)
  put(root, 'README.md', 'x')
  git(['add', '.'], root)
  git(['commit', '-qm', 'init'], root)
  return root
}
const run = (root, message, staged, status) => {
  const msgFile = join(root, 'MSG')
  writeFileSync(msgFile, message)
  const args = [SCRIPT, msgFile, '--root', root, '--staged', ...staged]
  if (status) args.push('--status', ...status)
  return spawnSync('node', args, { cwd: root, encoding: 'utf8', env: env() })
}

const dirs = []
const fx = () => {
  const r = newRepo()
  dirs.push(r)
  return r
}
const TOKEN = 'jam-web/design-system/tokens/color.json'
const BTN = 'jam-web/src/components/ui/button.tsx'
const BTN_STORY = 'jam-web/src/components/ui/button.stories.tsx'

try {
  let r = fx()
  assert.equal(run(r, '문서 수정', ['docs/a.md']).status, 0, '보호 경로 없음 → 통과')

  r = fx()
  put(r, 'docs/tickets/p2-normal/20261125_0001_Infra_a.md', APPROVED)
  assert.equal(run(r, '토큰 변경 (티켓 20261125_0001)', [TOKEN]).status, 0, '승인 줄 있는 티켓 → 통과')

  r = fx()
  put(r, 'docs/tickets/p2-normal/20261125_0002_Infra_b.md', PLAIN('20261125_0002', '20261125_0001'))
  put(r, 'docs/tickets/p2-normal/20261125_0001_Infra_a.md', APPROVED)
  assert.equal(run(r, '토큰 변경 20261125_0002', [TOKEN]).status, 0, '상위 티켓에만 승인 줄 → 통과')

  r = fx()
  put(r, 'docs/tickets/p2-normal/20261125_0003_Infra_c.md', PLAIN('20261125_0003'))
  const noApproval = run(r, '토큰 변경 20261125_0003', [TOKEN])
  assert.equal(noApproval.status, 1, '승인 줄 없음 → 실패')
  assert.match(noApproval.stderr, /사용자 승인 기록이 없습니다/)

  r = fx()
  assert.equal(run(r, '번호 없는 메시지', [TOKEN]).status, 1, '티켓 번호 없음 → 실패')

  r = fx()
  put(r, 'docs/tickets/p2-normal/20261125_0001_Infra_a.md', APPROVED)
  const noStory = run(r, '새 컴포넌트 20261125_0001', [BTN], ['A'])
  assert.equal(noStory.status, 1, '새 정본 컴포넌트 + 스토리 없음 → 실패')
  assert.match(noStory.stderr, /스토리/)
  assert.equal(run(r, '새 컴포넌트 20261125_0001', [BTN, BTN_STORY], ['A', 'A']).status, 0, '스토리 함께 → 통과')

  r = fx()
  git(['commit', '-q', '--allow-empty', '-m', 'x'], r)
  const head = git(['rev-parse', 'HEAD'], r).trim()
  writeFileSync(join(r, '.git', 'MERGE_HEAD'), head + '\n')
  assert.equal(run(r, '머지', [TOKEN]).status, 0, '머지 진행 중 → 건너뜀')

  r = fx()
  const only = run(r, '시험만', [
    'jam-web/src/components/ui/button.test.tsx',
    BTN_STORY,
    'jam-web/src/components/ui/__tests__/x.tsx',
  ])
  assert.equal(only.status, 0, '시험·스토리만 → 통과')

  // 실제 훅: 보호 경로를 스테이징하고 승인 없는 티켓 번호로 커밋하면 막힌다.
  r = fx()
  copyHook(r)
  put(r, 'docs/tickets/p2-normal/20261125_0003_Infra_c.md', PLAIN('20261125_0003'))
  put(r, TOKEN, '{}')
  git(['add', TOKEN, 'docs'], r)
  const blocked = spawnSync('git', ['commit', '-m', '토큰 20261125_0003'], { cwd: r, encoding: 'utf8', env: env() })
  assert.notEqual(blocked.status, 0, '훅이 커밋을 막아야 한다')
  assert.match(blocked.stderr, /UI 승인 관문/)
  put(r, 'docs/tickets/p2-normal/20261125_0003_Infra_c.md', PLAIN('20261125_0003') + '- 사용자 승인: 2026-11-25 — 토큰\n')
  git(['add', 'docs'], r)
  const ok = spawnSync('git', ['commit', '-m', '토큰 20261125_0003'], { cwd: r, encoding: 'utf8', env: env() })
  assert.equal(ok.status, 0, `승인 줄을 더하면 통과해야 한다:\n${ok.stderr}`)

  console.log('check-ui-approval 시험 통과')
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

function copyHook(r) {
  mkdirSync(join(r, '.githooks'), { recursive: true })
  mkdirSync(join(r, 'scripts'), { recursive: true })
  copyFileSync(HOOK, join(r, '.githooks', 'commit-msg'))
  copyFileSync(SCRIPT, join(r, 'scripts', 'check-ui-approval.mjs'))
  chmodSync(join(r, '.githooks', 'commit-msg'), 0o755)
  git(['config', 'core.hooksPath', '.githooks'], r)
}
