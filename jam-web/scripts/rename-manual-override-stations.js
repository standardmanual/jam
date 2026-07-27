#!/usr/bin/env node
/**
 * insert-stations-poi.js가 수동 매핑(manual-overrides.json) 15건을 원본(B열) 이름으로 등록했는데,
 * 사용자 요청으로 실제 매칭된 역 이름으로 정정한다 (1회성).
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

// 원본(B열) 이름 -> 실제 매칭된 역 이름 (부기 노선명/괄호 구분자 제거)
const CLEAN_NAME = {
  '가정루원시티역': '가정역',
  '경전철의정부역': '의정부역',
  '김천구미역': '김천(구미)역',
  '당고개역': '불암산역',
  '반여역': '반여농산물시장역',
  '서구청역': '서해구청역',
  '서울벤처타운역': '서울대벤처타운역',
  '성당못역': '서부정류장역',
  '수성구민운동장입구역': '수성구민운동장역',
  '신경주역': '경주역',
  '신남역': '청라언덕역',
  '여수엑스포역': '여수EXPO역',
  '운동장·송담대역': '용인중앙시장역',
  '화전역': '한국항공대역',
  '쾌법르네시떼역': '괘법르네시떼역',
}

async function main() {
  const env = loadEnv()
  const overridesPath = process.argv[2]
  const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  for (const [origName, cleanName] of Object.entries(CLEAN_NAME)) {
    const o = overrides[origName]
    if (!o) {
      console.log(`SKIP (overrides에 없음): ${origName}`)
      continue
    }
    const { latitude, longitude } = parseCoord(o.mapx, o.mapy)
    const naverId = resolveNaverId(o.link, o.title, latitude, longitude)
    const { data, error } = await supabase
      .from('poi')
      .update({ name: cleanName })
      .eq('naver_id', naverId)
      .select('id,name')
    if (error) {
      console.error(`ERROR ${origName}:`, error.message)
      continue
    }
    if (!data || data.length === 0) {
      console.log(`NOT FOUND: ${origName} (naver_id=${naverId})`)
      continue
    }
    console.log(`${origName} -> ${cleanName} (${data.length}건)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
