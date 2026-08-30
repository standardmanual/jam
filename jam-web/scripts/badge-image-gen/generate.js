#!/usr/bin/env node
/**
 * 배지 이미지 자동 생성 CLI (범용, 재사용 가능)
 *
 * 사용법:
 *   node scripts/badge-image-gen/generate.js <config-name> [--limit N] [--dry-run]
 *
 * 예:
 *   node scripts/badge-image-gen/generate.js subway-poi-badge --limit 5 --dry-run
 *   node scripts/badge-image-gen/generate.js subway-poi-badge
 *
 * 렌더링 엔진 본체는 lib/engine.js에 있다 — 어드민 API 라우트
 * (`/api/admin/badge-image-batch`)도 같은 엔진을 쓴다(티켓 20260830_1252). 새 디자인을
 * 추가할 때는 configs/ 아래 새 *.config.js 하나만 작성하면 되고, 엔진 파일은 수정하지 않는다.
 * 자세한 설명은 README.md 참고.
 *
 * 필요 환경변수 (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const engine = require('./lib/engine')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

async function main() {
  const [, , configName, ...rest] = process.argv
  if (!configName) {
    console.error('사용법: node scripts/badge-image-gen/generate.js <config-name> [--limit N] [--ids id1,id2] [--dry-run]')
    process.exit(1)
  }
  const dryRun = rest.includes('--dry-run')
  const limitIdx = rest.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : undefined
  const idsIdx = rest.indexOf('--ids')
  const idsFilter = idsIdx >= 0 ? new Set(rest[idsIdx + 1].split(',')) : undefined

  const config = require(path.join(__dirname, 'configs', `${configName}.config.js`))
  console.log(`[config] ${config.name} 로드 완료`)

  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다 (.env.local)')
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const rows = await config.dataSource(supabase)
  let targetRows = idsFilter ? rows.filter((r) => idsFilter.has(r.id)) : rows
  targetRows = limit ? targetRows.slice(0, limit) : targetRows
  console.log(`[data] 대상 row: ${targetRows.length}개${limit ? ` (--limit ${limit})` : ''}`)

  const { fontData, backgroundSvg, widthOf } = await engine.prepareRenderContext(config)

  const outputDir = path.join(engine.PROJECT_ROOT, 'public', config.outputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  let ok = 0
  let fail = 0
  for (const row of targetRows) {
    try {
      const png = await engine.renderBadge(row, config, fontData, backgroundSvg, widthOf)
      const outPath = path.join(outputDir, `${row.id}.png`)
      if (!dryRun) {
        fs.writeFileSync(outPath, png)
      }
      ok++
      if (ok % 50 === 0) console.log(`[progress] ${ok}/${targetRows.length}`)
    } catch (e) {
      fail++
      console.error(`[fail] id=${row.id} name=${row.name}:`, e.message)
    }
  }

  console.log(`[done] 성공 ${ok}개, 실패 ${fail}개${dryRun ? ' (dry-run — 파일 미저장)' : ''}`)

  if (!dryRun && ok > 0) {
    const updateSql = config.updateSqlTemplate.replace(/\{\{imagePathPrefix\}\}/g, `/${config.outputDir}`)
    const sqlPath = path.join(engine.PROJECT_ROOT, 'supabase', 'seed', `update_${config.name}_images.sql`)
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true })
    fs.writeFileSync(sqlPath, updateSql + '\n', 'utf-8')
    console.log(`\n[다음 단계] image_url 반영 SQL을 저장했습니다: ${sqlPath}`)
    console.log(`이 SQL을 Supabase에 직접 실행하세요.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
