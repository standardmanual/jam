// .claude/hooks/ui-guard.mjs 의 판정을 확인한다 (티켓 20261125_2050).
// 임시 폴더에 작은 저장소 구조를 만들고(규칙 엔진은 실제 파일을 복사, 기준선은 빈 객체) 훅 JSON을 표준 입력으로 넣는다.
// 실행: node scripts/ui-guard.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, '..', '.claude', 'hooks', 'ui-guard.mjs')
const ENGINE = join(HERE, 'check-ui-rules.mjs')

const tmp = mkdtempSync(join(tmpdir(), 'ui-guard-'))
const repo = join(tmp, 'repo')
mkdirSync(join(repo, 'scripts'), { recursive: true })
mkdirSync(join(repo, 'jam-web/src/components'), { recursive: true })
mkdirSync(join(repo, 'jam-web/src/app/admin'), { recursive: true })
copyFileSync(ENGINE, join(repo, 'scripts/check-ui-rules.mjs'))
copyFileSync(join(HERE, 'strip-code-comments.mjs'), join(repo, 'scripts/strip-code-comments.mjs'))

const target = join(repo, 'jam-web/src/components/Foo.tsx')
const clean = 'export const Foo = () => <p className="text-sm">a</p>\n'
const dirty = 'export const Foo = () => <p className="text-[13px]">a</p>\n'
writeFileSync(target, clean)

const run = (payload, hook = HOOK) =>
  spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8' })

try {
  let r = run({ tool_name: 'Write', tool_input: { file_path: target, content: dirty } })
  assert.equal(r.status, 2, 'Write 위반 → 2')
  assert.match(r.stderr, /arbitrary/, '표준 오류에 규칙 키')
  assert.match(r.stderr, /거절/, '거절 안내')

  r = run({ tool_name: 'Write', tool_input: { file_path: target, content: clean } })
  assert.equal(r.status, 0, '깨끗한 Write → 0')

  r = run({ tool_name: 'Edit', tool_input: { file_path: target, old_string: 'text-sm', new_string: 'text-[13px]' } })
  assert.equal(r.status, 2, 'Edit로 위반 추가 → 2')

  writeFileSync(target, dirty)
  r = run({ tool_name: 'Edit', tool_input: { file_path: target, old_string: 'text-[13px]', new_string: 'text-sm' } })
  assert.equal(r.status, 0, 'Edit로 위반 제거 → 0')
  writeFileSync(target, clean)

  r = run({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: target,
      edits: [
        { old_string: 'text-sm', new_string: 'text-[13px]' },
        { old_string: 'text-[13px]', new_string: 'text-base' },
      ],
    },
  })
  assert.equal(r.status, 0, 'MultiEdit는 순서대로 적용(위반을 더했다 뺌) → 0')

  r = run({
    tool_name: 'MultiEdit',
    tool_input: { file_path: target, edits: [{ old_string: 'text-sm', new_string: 'text-[13px]' }] },
  })
  assert.equal(r.status, 2, 'MultiEdit로 위반 추가 → 2')

  r = run({
    tool_name: 'Write',
    tool_input: { file_path: join(repo, 'jam-web/src/app/admin/page.tsx'), content: dirty },
  })
  assert.equal(r.status, 0, '어드민 경로 → 0')

  r = run({ tool_name: 'Read', tool_input: { file_path: target } })
  assert.equal(r.status, 0, '다른 도구 → 0')

  r = run({ tool_name: 'Write', tool_input: { file_path: join(tmp, 'elsewhere/Foo.tsx'), content: dirty } })
  assert.equal(r.status, 0, '저장소 루트를 못 찾음 → 0')

  writeFileSync(join(repo, 'scripts/check-ui-rules.mjs'), 'process.exit(7)\n')
  r = run({ tool_name: 'Write', tool_input: { file_path: target, content: dirty } })
  assert.equal(r.status, 1, '엔진 고장 → 1(차단하지 않는 경고)')

  console.log('ui-guard.test: 통과')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
