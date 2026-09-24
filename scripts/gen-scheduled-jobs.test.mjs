// gen-scheduled-jobs.mjs 테스트 (티켓 20260924_0905)
// 실행: node scripts/gen-scheduled-jobs.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSchedule, parseTitle, parseScheduledJobsMd, renderGenerated, SRC, OUTPUT } from './gen-scheduled-jobs.mjs'

// 훅(pre-push -> verify.sh) 안에서 도는 경우 git이 GIT_DIR 등을 물려준다. 임시 저장소 명령이
// 실제 저장소 설정을 건드리지 않도록 물려받은 GIT_*를 버린다(티켓 20260921_1116 사고).
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]

const GEN = join(dirname(fileURLToPath(import.meta.url)), 'gen-scheduled-jobs.mjs')

// ── 일정 표기 4종 파싱 ─────────────────────────────────────────────────────────
assert.deepEqual(parseSchedule('화요일 09:00 KST'), { type: 'weekly', weekday: 2, hour: 9, minute: 0 })
assert.deepEqual(parseSchedule('매일 06:00 KST'), { type: 'daily', hour: 6, minute: 0 })
assert.deepEqual(parseSchedule('매월 1일 09:00 KST'), { type: 'monthly', day: 1, hour: 9, minute: 0 })
assert.deepEqual(parseSchedule('매주 목요일, 확인(15:00) → 실행(23:59) KST'), {
  type: 'weekly-labeled',
  weekday: 4,
  labels: [
    { label: '확인', hour: 15, minute: 0 },
    { label: '실행', hour: 23, minute: 59 },
  ],
})
// 해석할 수 없는 표기는 null
assert.equal(parseSchedule('화요일 오전 9시 KST'), null)
assert.equal(parseSchedule('매주 목요일 15:00 KST'), null)
assert.equal(parseSchedule(''), null)

// 제목 = 이름 + ' — ' + 일정 표기
assert.deepEqual(parseTitle('주간 — 화요일 09:00 KST'), {
  name: '주간',
  schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 },
})
assert.equal(parseTitle('공통 원칙'), null) // 구분자(' — ') 자체가 없음
assert.equal(parseTitle('주간 — 화요일 오전 9시'), null) // 구분자는 있으나 일정 표기 해석 실패

// ── 상태 첫 단어 판정 + 루틴 절 판별(공통 원칙처럼 '| 상태 |' 행이 없으면 제외) ───────────
const sampleMd = [
  '# 예약 작업 스펙',
  '',
  '## 공통 원칙',
  '',
  '| 허용 | 금지 |',
  '| --- | --- |',
  '| 저장소 읽기 | 코드 수정 |',
  '',
  '## 주간 — 화요일 09:00 KST',
  '',
  '| 항목 | 내용 |',
  '| --- | --- |',
  '| 목적 | 점검 |',
  '| 상태 | 켜짐 |',
  '',
  '## 선별 — 매일 06:00 KST',
  '',
  '| 상태 | 꺼짐 (2주 관찰 종료 후 재검토) |',
  '',
  '## 월간 — 매월 1일 09:00 KST',
  '',
  '| 상태 | 켜짐 (2026-09-22 등록, 루틴 ID `trig_x`) |',
  '',
].join('\n')

{
  const { jobs, errors } = parseScheduledJobsMd(sampleMd)
  assert.deepEqual(errors, [])
  assert.equal(jobs.length, 3) // 공통 원칙은 '| 상태 |' 행이 없어 루틴으로 세지 않는다
  assert.deepEqual(jobs[0], { name: '주간', enabled: true, schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 } })
  assert.equal(jobs[1].name, '선별')
  assert.equal(jobs[1].enabled, false) // 첫 단어가 '꺼짐'
  assert.equal(jobs[2].name, '월간')
  assert.equal(jobs[2].enabled, true) // '켜짐' 뒤 괄호 설명은 무시하고 첫 단어만 본다
}

// ── 파싱 실패 시 오류 ─────────────────────────────────────────────────────────
{
  const brokenMd = [
    '## 주간 — 화요일 오전 9시 KST', // '| 상태 |' 행이 있는데 일정 표기를 해석할 수 없다
    '',
    '| 상태 | 켜짐 |',
    '',
  ].join('\n')
  const { jobs, errors } = parseScheduledJobsMd(brokenMd)
  assert.equal(jobs.length, 0)
  assert.equal(errors.length, 1)
  assert.ok(errors[0].includes('화요일 오전 9시'))
}

// renderGenerated는 입력이 같으면 항상 같은 문자열을 만든다(생성기 --check의 전제)
{
  const { jobs } = parseScheduledJobsMd(sampleMd)
  assert.equal(renderGenerated(jobs), renderGenerated(jobs))
  assert.ok(renderGenerated(jobs).includes("name: '주간'"))
}

// ── 임시 저장소: 생성 → --check 통과 → 표기 변경 → --check/생성 실패(파싱 오류) → 되돌리면 재통과 ──
const dir = mkdtempSync(join(tmpdir(), 'gen-scheduled-jobs-'))
const run = (args) => spawnSync('node', [GEN, ...args], { cwd: dir, encoding: 'utf8' })
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
const write = (rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), body)
}
try {
  sh('git', ['init', '-q'])
  write(SRC, sampleMd)
  sh('git', ['add', '-A'])

  assert.equal(run(['--check']).status, 1) // 생성 파일이 아직 없음
  assert.equal(run([]).status, 0)
  const generatedOnce = readFileSync(join(dir, OUTPUT), 'utf8')
  assert.ok(generatedOnce.includes('자동 생성 파일'))
  assert.equal(run(['--check']).status, 0) // md를 바꾸지 않고 다시 실행하면 최신

  // md의 루틴 시각을 바꾸고 생성기를 돌리지 않으면 --check가 실패한다
  const changedTime = sampleMd.replace('화요일 09:00 KST', '화요일 10:00 KST')
  write(SRC, changedTime)
  assert.equal(run(['--check']).status, 1)
  assert.equal(run([]).status, 0)
  assert.ok(readFileSync(join(dir, OUTPUT), 'utf8').includes('hour: 10'))
  assert.equal(run(['--check']).status, 0)

  // 표기 자체가 깨지면(해석 불가) --check·생성 모두 종료 코드 1이고 생성 파일은 손대지 않는다
  const beforeBroken = readFileSync(join(dir, OUTPUT), 'utf8')
  write(SRC, changedTime.replace('화요일 10:00 KST', '화요일 오전 10시 KST'))
  const checkResult = run(['--check'])
  assert.equal(checkResult.status, 1)
  assert.ok(checkResult.stderr.includes('해석하지 못했습니다'))
  const genResult = run([])
  assert.equal(genResult.status, 1)
  assert.equal(readFileSync(join(dir, OUTPUT), 'utf8'), beforeBroken) // 실패 시 기존 파일 유지

  // 되돌리면 다시 통과
  write(SRC, changedTime)
  assert.equal(run([]).status, 0)
  assert.equal(run(['--check']).status, 0)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('gen-scheduled-jobs 테스트 통과')
