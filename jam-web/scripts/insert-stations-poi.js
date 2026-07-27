#!/usr/bin/env node
/**
 * 전국 지하철/기차역 POI 일괄 등록 (2026-07-27 1회성 실행, 기록 보존용)
 *
 * match-stations-poi.js의 결과(match-result.json)와 사용자 확인을 거친
 * 환승역 병합/미매칭 수동 매핑(manual-overrides.json)을 합쳐 public.poi에 upsert.
 *
 * - finalRows: 자동 확정된 917건 (역이름당 노선 1개, 좌표 충돌 없음)
 * - reviewGroups: 이름은 같고 좌표가 근접(<=1km)한 14개 그룹 → 물리적으로 같은 역으로 판단,
 *   대표 멤버(첫 번째) 좌표로 1개 POI만 등록 (사용자 확인 완료)
 * - manual-overrides: 네이버 자동 매칭 실패 16건 — 개명/오타/표기차이로 실제 역을 사람이 찾아
 *   좌표를 채움. 이름은 원본(엑셀 B열) 그대로 사용 (사용자 확인 완료)
 * - 창릉역(GTX-A), 학익역(수인분당선): 미개통 역이라 스킵 (사용자 확인 완료)
 *
 * 필요 환경변수 (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 실행: node scripts/insert-stations-poi.js <match-result.json> <manual-overrides.json>
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

function parseCoord(mapx, mapy) {
  return { longitude: parseInt(mapx, 10) / 10_000_000, latitude: parseInt(mapy, 10) / 10_000_000 }
}
function resolveNaverId(link, name, lat, lng) {
  const m = link && link.match(/place\/(\d+)/)
  if (m) return m[1]
  return `syn:${name}_${lat.toFixed(5)}_${lng.toFixed(5)}`
}

async function main() {
  const env = loadEnv()
  const [, , matchResultPath, overridesPath] = process.argv
  if (!matchResultPath || !overridesPath) {
    throw new Error('usage: node insert-stations-poi.js <match-result.json> <manual-overrides.json>')
  }
  const matchResult = JSON.parse(fs.readFileSync(matchResultPath, 'utf8'))
  const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'))

  const rows = new Map() // naver_id -> row

  const addRow = (name, latitude, longitude, naverId) => {
    if (!rows.has(naverId)) {
      rows.set(naverId, { name, latitude, longitude, category: 'transit', naver_id: naverId, poi_tier: 1 })
    }
  }

  for (const r of matchResult.finalRows) {
    addRow(r.name, r.latitude, r.longitude, r.naverId)
  }
  for (const g of matchResult.reviewGroups) {
    const rep = g.members[0]
    addRow(g.name, rep.latitude, rep.longitude, rep.naverId)
  }
  for (const [origName, o] of Object.entries(overrides)) {
    const { latitude, longitude } = parseCoord(o.mapx, o.mapy)
    const naverId = resolveNaverId(o.link, o.title, latitude, longitude)
    addRow(origName, latitude, longitude, naverId)
  }

  const toInsertAll = [...rows.values()]
  console.log(`합계 (dedup 후): ${toInsertAll.length}`)

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: existing, error: existingErr } = await supabase.from('poi').select('naver_id').not('naver_id', 'is', null)
  if (existingErr) throw existingErr
  const existingSet = new Set((existing || []).map((r) => r.naver_id))
  const toInsert = toInsertAll.filter((r) => !existingSet.has(r.naver_id))

  console.log(`신규 삽입 대상: ${toInsert.length} (이미 존재: ${toInsertAll.length - toInsert.length})`)

  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { data, error } = await supabase.from('poi').insert(toInsert.slice(i, i + CHUNK)).select('id')
    if (error) {
      console.error('INSERT ERROR:', error.message)
      continue
    }
    inserted += data.length
  }
  console.log(`완료. 삽입된 행: ${inserted}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
