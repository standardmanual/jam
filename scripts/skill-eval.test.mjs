// skill-eval.mjs 테스트 (티켓 20260922_1523)
// 실행: node scripts/skill-eval.test.mjs
import assert from 'node:assert/strict'
import { evaluate } from './skill-eval.mjs'

const cases = [
  { id: 1, request: '배포해줘', expectedSkill: 'jam-ship', expectedWorkType: null },
  { id: 2, request: '이 버그 고쳐줘', expectedSkill: 'jam-work', expectedWorkType: 'bug' },
  { id: 3, request: '문서 갱신해줘', expectedSkill: 'jam-docs', expectedWorkType: null },
]

// 전부 일치
{
  const results = [
    { id: 1, predictedSkill: 'jam-ship', predictedWorkType: null },
    { id: 2, predictedSkill: 'jam-work', predictedWorkType: 'bug' },
    { id: 3, predictedSkill: 'jam-docs', predictedWorkType: null },
  ]
  const r = evaluate(cases, results)
  assert.equal(r.skillCorrect, 3)
  assert.equal(r.skillTotal, 3)
  assert.equal(r.skillRate, 1)
  assert.deepEqual(r.skillMismatches, [])
  assert.equal(r.workTypeCorrect, 1)
  assert.equal(r.workTypeTotal, 1)
  assert.deepEqual(r.workTypeMismatches, [])
}

// 스킬 불일치 + 유형 불일치 + 결과 누락
{
  const results = [
    { id: 1, predictedSkill: 'jam-work', predictedWorkType: null }, // 스킬 오답
    { id: 2, predictedSkill: 'jam-work', predictedWorkType: 'ui' }, // 유형 오답
    // id 3 결과 누락
  ]
  const r = evaluate(cases, results)
  assert.equal(r.skillCorrect, 1) // id 2만 스킬 정답
  assert.equal(r.skillTotal, 3)
  assert.equal(r.skillMismatches.length, 2)
  assert.ok(r.skillMismatches.some((m) => m.id === 1 && m.predicted === 'jam-work'))
  assert.ok(r.skillMismatches.some((m) => m.id === 3 && m.predicted === '(결과 없음)'))
  assert.equal(r.workTypeCorrect, 0)
  assert.equal(r.workTypeTotal, 1)
  assert.equal(r.workTypeMismatches[0].predicted, 'ui')
}

console.log('skill-eval 테스트 통과')
