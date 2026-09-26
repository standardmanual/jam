// scripts/doc-section.mjs 가 제목 접두로 절만 잘라 내는지 확인한다 (티켓 20260926_1543).
// 임시 파일은 os 임시 폴더에 만들고 끝나면 지운다.
// 실행: node scripts/doc-section.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'doc-section-'))

const run = (file, ...rest) =>
  spawnSync('node', ['scripts/doc-section.mjs', file, ...rest], { cwd: ROOT, encoding: 'utf8' })
const write = (name, text) => {
  const p = join(dir, name)
  writeFileSync(p, text)
  return p
}

try {
  const doc = write(
    'doc.md',
    [
      '---',
      'type: spec',
      '# frontmatter 주석은 제목이 아니다',
      '---',
      '# 문서 제목',
      '## 7. 앞 절',
      '앞 절 본문',
      '## 8. 대상 절',
      '8 본문',
      '```bash',
      '# 코드 펜스 안의 주석',
      '## 9. 펜스 안 가짜 제목',
      '```',
      '### 8-1. 하위 절',
      '하위 본문',
      '## 9. 다음 절',
      '9 본문',
      '## 10. 마지막 절',
      '마지막 본문',
      '',
    ].join('\n'),
  )

  // 1) 접두가 "## 8."이면 §8 전체(하위 포함, 펜스 안 가짜 제목 무시)만 나오고 다음 절은 빠진다.
  const s8 = run(doc, '## 8.')
  assert.equal(s8.status, 0, s8.stderr)
  assert.match(s8.stdout, /^## 8\. 대상 절/)
  assert.match(s8.stdout, /8 본문/)
  assert.match(s8.stdout, /# 코드 펜스 안의 주석/)
  assert.match(s8.stdout, /## 9\. 펜스 안 가짜 제목/)
  assert.match(s8.stdout, /### 8-1\. 하위 절/)
  assert.doesNotMatch(s8.stdout, /## 9\. 다음 절/)
  assert.doesNotMatch(s8.stdout, /앞 절 본문/)

  // 2) 하위 제목(###)은 같은 수준 이하 제목이 나올 때까지만이다.
  const sub = run(doc, '### 8-1.')
  assert.equal(sub.status, 0, sub.stderr)
  assert.equal(sub.stdout, '### 8-1. 하위 절\n하위 본문\n')

  // 3) 없는 접두: 종료 코드 1 + stderr 후보 목록. 펜스 안 제목과 frontmatter 주석은 후보에 없다.
  const none = run(doc, '## 99.')
  assert.equal(none.status, 1)
  assert.equal(none.stdout, '')
  assert.match(none.stderr, /## 7\. 앞 절/)
  assert.match(none.stderr, /## 10\. 마지막 절/)
  assert.doesNotMatch(none.stderr, /코드 펜스 안의 주석/)
  assert.doesNotMatch(none.stderr, /frontmatter/)
  assert.doesNotMatch(none.stderr, /펜스 안 가짜/)

  // 4) 마지막 절은 파일 끝까지, 끝의 빈 줄은 뺀다.
  const last = run(doc, '## 10.')
  assert.equal(last.status, 0, last.stderr)
  assert.equal(last.stdout, '## 10. 마지막 절\n마지막 본문\n')

  // 5) 절이 하나뿐인 파일.
  const single = write('single.md', '# 유일한 절\n본문 한 줄\n')
  const one = run(single, '# 유일')
  assert.equal(one.status, 0, one.stderr)
  assert.equal(one.stdout, '# 유일한 절\n본문 한 줄\n')

  // 6) 펜스 안 가짜 제목은 일치로 세지 않고, # 없는 텍스트 접두도 된다.
  const dup = run(doc, '9.')
  assert.equal(dup.status, 0, `펜스 안 가짜 제목은 세지 않아야 한다: ${dup.stderr}`)
  assert.match(dup.stdout, /^## 9\. 다음 절/)

  // 7) 일치가 둘 이상이면 종료 코드 1 + 후보, --all-matches면 모두 출력한다.
  const twin = write('twin.md', '## 가 절\nA\n## 가 절 둘째\nB\n')
  const amb = run(twin, '## 가')
  assert.equal(amb.status, 1)
  assert.match(amb.stderr, /## 가 절 둘째/)
  const allm = run(twin, '## 가', '--all-matches')
  assert.equal(allm.status, 0, allm.stderr)
  assert.match(allm.stdout, /A/)
  assert.match(allm.stdout, /B/)

  console.log('doc-section 테스트 통과')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
