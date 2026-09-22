#!/usr/bin/env node
// skill-eval — 스킬 라우팅 평가(Tier 2) 결과를 사례 파일과 대조한다 (티켓 20260922_1523).
//
// scripts/skill-eval-cases.json의 { id, request, expectedSkill, expectedWorkType }와, 카리나가
// Haiku 서브에이전트에게 스킬 설명문 목록 + request를 주고 받은 { id, predictedSkill,
// predictedWorkType } 배열을 대조해 일치율(스킬·유형 각각)과 틀린 사례 목록을 출력한다.
//
// 실행 절차는 .claude/skills/jam-work/SKILL.md 「참고」 절을 본다. 의미 판단(LLM 호출)이 들어가
// 토큰이 들어서 scripts/verify.sh에는 넣지 않는다 — 카리나가 요청받았을 때만 돈다.
//
// 사용법: node scripts/skill-eval.mjs <결과 JSON 경로>

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 스킬 이름은 `/jam-work`·`jam-work` 두 표기를 같게 본다(2026-09-22 첫 실측에서 Haiku가 슬래시를 붙여
// 35건 전부 표기 차이로 불일치가 났다 — 티켓 20260922_1523 후속 범위).
const normSkill = (v) => (typeof v === 'string' ? v.trim().replace(/^\//, '') : v)

export function evaluate(cases, results) {
  const byId = new Map(results.map((r) => [r.id, r]))
  const skillMismatches = []
  const workTypeMismatches = []
  let skillTotal = 0
  let skillCorrect = 0
  let workTypeTotal = 0
  let workTypeCorrect = 0

  for (const c of cases) {
    const r = byId.get(c.id)
    skillTotal++
    if (!r) {
      skillMismatches.push({ id: c.id, request: c.request, expected: c.expectedSkill, predicted: '(결과 없음)' })
    } else if (normSkill(r.predictedSkill) === normSkill(c.expectedSkill)) {
      skillCorrect++
    } else {
      skillMismatches.push({ id: c.id, request: c.request, expected: c.expectedSkill, predicted: r.predictedSkill })
    }

    if (c.expectedWorkType) {
      workTypeTotal++
      if (r && r.predictedWorkType === c.expectedWorkType) {
        workTypeCorrect++
      } else {
        workTypeMismatches.push({
          id: c.id,
          request: c.request,
          expected: c.expectedWorkType,
          predicted: r?.predictedWorkType ?? '(없음)',
        })
      }
    }
  }

  return {
    skillRate: skillTotal ? skillCorrect / skillTotal : 0,
    skillCorrect,
    skillTotal,
    skillMismatches,
    workTypeRate: workTypeTotal ? workTypeCorrect / workTypeTotal : 0,
    workTypeCorrect,
    workTypeTotal,
    workTypeMismatches,
  }
}

function main() {
  const resultsPath = process.argv[2]
  if (!resultsPath) {
    console.error('사용법: node scripts/skill-eval.mjs <결과 JSON 경로>')
    process.exit(2)
  }

  const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const casesFile = JSON.parse(readFileSync(path.join(REPO, 'scripts/skill-eval-cases.json'), 'utf8'))
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'))

  const r = evaluate(casesFile.cases, results)

  console.log(`스킬 일치율: ${r.skillCorrect}/${r.skillTotal} (${(r.skillRate * 100).toFixed(1)}%)`)
  if (r.skillMismatches.length > 0) {
    console.log('스킬 불일치:')
    for (const m of r.skillMismatches) {
      console.log(`  #${m.id} "${m.request}" — 기대 ${m.expected} / 실제 ${m.predicted}`)
    }
  }

  console.log(`유형 일치율: ${r.workTypeCorrect}/${r.workTypeTotal} (${(r.workTypeRate * 100).toFixed(1)}%)`)
  if (r.workTypeMismatches.length > 0) {
    console.log('유형 불일치:')
    for (const m of r.workTypeMismatches) {
      console.log(`  #${m.id} "${m.request}" — 기대 ${m.expected} / 실제 ${m.predicted}`)
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
