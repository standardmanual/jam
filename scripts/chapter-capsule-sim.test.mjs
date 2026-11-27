// chapter-capsule-sim.mjs 동기화 막힘(BLOCK_SYNC) 테스트 (티켓 20261127_1752)
//
// 확인하는 것: BLOCK_SYNC=0이면 A3 때(커밋 994d702aa) 시뮬레이터와 결과가 같고, 캡슐 모드 시나리오는 BLOCK_SYNC와 무관하며,
// BLOCK_SYNC=1이면 챕터 모드에서 막힌 주와 서비스 활동 잼 손실이 생기고 ⑨절이 퍼소나 7종으로 나온다.
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돈다. 실행: node scripts/chapter-capsule-sim.test.mjs

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
const SIM = path.join(__dirname, 'balance-sim', 'chapter-capsule-sim.mjs')
const A3_COMMIT = '994d702aa' // 막힘 모델 이전(A3) 시뮬레이터
const N = 30
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chapter-sim-'))

const A3_SIM = path.join(tmp, 'a3-sim.mjs')
fs.writeFileSync(A3_SIM, execFileSync('git', ['show', `${A3_COMMIT}:scripts/balance-sim/chapter-capsule-sim.mjs`], { cwd: REPO_ROOT, encoding: 'utf8' }))

function run(script, env, tag) {
  const json = path.join(tmp, `${tag}.json`)
  const stdout = execFileSync('node', [script, String(N)], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, ...env, SIM_JSON: json } })
  return { stdout, json: JSON.parse(fs.readFileSync(json, 'utf8')) }
}

const CHAPTER_IDS = ['챕터오름-A', '챕터오름-B', '챕터오름-C', '챕터오름-D', '챕터오름-E']
const CAPSULE_IDS = ['현행양', '목표역산안', '목표역산안-상한없음']
const PERSONA_COUNT = 7
const sameAsA3 = (a3, now, ids, label) => {
  for (const id of ids) {
    assert.deepEqual(Object.keys(now[id]), Object.keys(a3[id]), `${label}: ${id} 퍼소나 목록`)
    for (const pn of Object.keys(a3[id])) {
      for (const [k, v] of Object.entries(a3[id][pn])) assert.deepEqual(now[id][pn][k], v, `${label}: ${id} ${pn} ${k}`)
    }
  }
}

try {
  for (const clear of ['1', '0.5']) {
    const env = { CLEAR_MULT: clear }
    const a3 = run(A3_SIM, env, `a3-${clear}`)
    const off = run(SIM, { ...env, BLOCK_SYNC: '0' }, `off-${clear}`)
    const on = run(SIM, { ...env, BLOCK_SYNC: '1' }, `on-${clear}`)

    // BLOCK_SYNC=0이면 챕터·캡슐 모두 A3와 같고, 막힘 지표는 0이다
    sameAsA3(a3.json, off.json, [...CHAPTER_IDS, ...CAPSULE_IDS], `BLOCK_SYNC=0 CLEAR_MULT=${clear}`)
    for (const id of CHAPTER_IDS) {
      for (const r of Object.values(off.json[id])) {
        assert.equal(r.blockPct, 0)
        assert.equal(r.blockMax, 0)
        assert.equal(r.svcLostPct, 0)
      }
    }
    // 캡슐 모드는 BLOCK_SYNC=1이어도 A3와 같다
    sameAsA3(a3.json, on.json, CAPSULE_IDS, `캡슐 모드 BLOCK_SYNC=1 CLEAR_MULT=${clear}`)

    // 출력 ⑨절: 챕터 모드 안마다 한 번, 퍼소나 7종
    const lines = on.stdout.split('\n')
    const heads = lines.flatMap((l, i) => (l.startsWith('-- ⑨ ') ? [i] : []))
    assert.equal(heads.length, CHAPTER_IDS.length, '⑨절은 챕터 모드 안마다 한 번')
    for (const h of heads) assert.equal(lines.slice(h + 1, h + 1 + PERSONA_COUNT).filter((l) => l.includes('|')).length, PERSONA_COUNT, '⑨절 퍼소나 7종')
    assert.ok(!off.stdout.includes('BLOCK_SYNC=1') && off.stdout.includes('BLOCK_SYNC=0'))
  }

  // BLOCK_SYNC=1 + 비우는 속도 절반이면 후보 E에서 막힘이 생기고, 활동은 미뤄지며 서비스 활동 잼을 잃는다
  const slow = { off: run(SIM, { CLEAR_MULT: '0.5', BLOCK_SYNC: '0' }, 'slow-off'), on: run(SIM, { CLEAR_MULT: '0.5', BLOCK_SYNC: '1' }, 'slow-on') }
  for (const [pn, r] of Object.entries(slow.on.json['챕터오름-E'])) {
    const base = slow.off.json['챕터오름-E'][pn]
    // 비우는 속도가 빠른 퍼소나는 막히지 않을 수 있다. 막힘이 있으면 그에 맞는 지표가 함께 나와야 한다
    if (r.blockPct > 0) {
      assert.ok(r.blockLen >= 1 && r.blockMax >= 1 && r.blockPct <= 1, `${pn}: 막힘 길이`)
      assert.ok(r.deferredMax >= 1, `${pn}: 미뤄진 활동`)
      assert.ok(r.svcLostPct > 0 && r.svcGot < base.svcGot, `${pn}: 막힘이 서비스 활동 잼 지급을 줄인다`)
    } else {
      assert.equal(r.svcLostPct, 0, `${pn}: 막힘이 없으면 손실도 없다`)
    }
  }
  for (const pn of ['걷기 보통', '러닝 보통']) assert.ok(slow.on.json['챕터오름-E'][pn].blockPct > 0.5, `${pn}: 비우는 속도 절반이면 절반 넘게 막힌다`)
  console.log('chapter-capsule-sim 막힘 테스트 통과')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
