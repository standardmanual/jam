#!/usr/bin/env node
/**
 * 전국 산 POI 일괄 등록 스크립트 (2026-07-26 1회성 실행, 기록 보존용)
 *
 * 1) 산림청 OpenAPI(trailInfoService/getforeststoryservice)에서 전국 산 이름 목록 조회
 *    - 이 API는 산이름/높이/소재지만 제공하고 좌표(위경도)는 없음
 * 2) 각 산 이름을 네이버 지역검색 API로 조회해 좌표를 붙임
 *    - category가 정확히 '여행,명소>산'이고 title이 이름과 완전히 일치하는 결과만 채택
 *    - 동명이인(같은 이름의 산이 여러 지역에 존재)은 소재지 도(道) 이름으로 1차 필터링
 *    - 그래도 여러 개면 첫 번째 후보 사용(ambiguous_first로 표시)
 * 3) 네이버 지역검색 API는 짧은 시간에 많은 요청을 보내면 429가 잦음 —
 *    동시성 4 + 429 시 지수백오프 재시도로 대응
 * 4) public.poi 에 category='mountain', naver_id(dedup용 UNIQUE)로 upsert
 *
 * 실행 결과(2026-07-26): 전체 1,338개 중 989개 매칭(74%) → naver_id 기준 dedup 후 847개 삽입.
 * 미매칭 다수는 "OO봉"류 이름으로, 네이버가 독립된 산 POI로 색인하지 않은 경우.
 *
 * 필요 환경변수 (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   NAVER_LOCAL_SEARCH_CLIENT_ID, NAVER_LOCAL_SEARCH_CLIENT_SECRET, FOREST_SERVICE_KEY
 * 실행: NODE_EXTRA_CA_CERTS=<system-ca.pem> node scripts/import-mountains-poi.js
 *   (샌드박스 환경에서 Node 기본 CA로 TLS 검증이 실패하는 경우에만 NODE_EXTRA_CA_CERTS 필요)
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

function stripHtml(t) {
  return t.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}
function parseCoord(mapx, mapy) {
  return { longitude: parseInt(mapx, 10) / 10_000_000, latitude: parseInt(mapy, 10) / 10_000_000 }
}
function resolveNaverId(link, name, lat, lng) {
  const m = link.match(/place\/(\d+)/)
  if (m) return m[1]
  return `syn:${name}_${lat.toFixed(5)}_${lng.toFixed(5)}`
}
function extractProvince(loc) {
  const m = loc.match(/^([가-힣]+?(?:도|특별시|광역시|특별자치도|특별자치시))/)
  return m ? m[1] : null
}
function unescapeXml(s) {
  return s
    .replace(/&amp;lt;/g, '<').replace(/&amp;gt;/g, '>').replace(/&amp;amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1] : ''
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchForestMountains(serviceKey) {
  async function fetchPage(pageNo, numOfRows) {
    const url = `http://api.forest.go.kr/openapi/service/trailInfoService/getforeststoryservice?serviceKey=${serviceKey}&numOfRows=${numOfRows}&pageNo=${pageNo}`
    const res = await fetch(url)
    const text = await res.text()
    const items = text.split('<item>').slice(1).map((c) => c.split('</item>')[0])
    return { text, items }
  }

  const first = await fetchPage(1, 100)
  const total = parseInt(first.text.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0', 10)
  const pages = Math.ceil(total / 100)
  let allItems = [...first.items]
  for (let p = 2; p <= pages; p++) {
    const { items } = await fetchPage(p, 100)
    allItems.push(...items)
  }

  return allItems
    .map((item) => ({
      name: unescapeXml(extractTag(item, 'mntnnm')).trim(),
      height: unescapeXml(extractTag(item, 'mntninfohght')).trim(),
      location: unescapeXml(extractTag(item, 'mntninfopoflc')).trim(),
    }))
    .filter((m) => m.name)
}

function naverHeaders(env) {
  return { 'X-Naver-Client-Id': env.NAVER_LOCAL_SEARCH_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_LOCAL_SEARCH_CLIENT_SECRET }
}

async function naverSearch(env, query, attempt = 0) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=random`
  const res = await fetch(url, { headers: naverHeaders(env) })
  if (res.status === 429) {
    if (attempt >= 5) return []
    await sleep(400 * 2 ** attempt + Math.random() * 200)
    return naverSearch(env, query, attempt + 1)
  }
  if (!res.ok) return []
  const json = await res.json()
  return json.items || []
}

function pickBest(items, name, province) {
  const candidates = items
    .map((it) => {
      const title = stripHtml(it.title)
      const { latitude, longitude } = it.mapx && it.mapy ? parseCoord(it.mapx, it.mapy) : {}
      return { title, category: it.category, addr: it.roadAddress || it.address, latitude, longitude, link: it.link }
    })
    .filter((c) => c.title === name && c.latitude && c.category === '여행,명소>산')

  if (candidates.length === 0) return null
  if (candidates.length === 1) return { ...candidates[0], matchType: 'exact' }
  if (province) {
    const provinceShort = province.slice(0, 2)
    const byProvince = candidates.find((c) => c.addr && c.addr.includes(provinceShort))
    if (byProvince) return { ...byProvince, matchType: 'province_disambiguated' }
  }
  return { ...candidates[0], matchType: 'ambiguous_first' }
}

async function matchOne(env, m) {
  const province = extractProvince(m.location)
  let items = await naverSearch(env, m.name)
  let best = pickBest(items, m.name, province)
  if (!best && province) {
    items = await naverSearch(env, `${province} ${m.name}`)
    best = pickBest(items, m.name, province)
  }
  if (!best) return { ...m, matched: false }
  const naverId = resolveNaverId(best.link, best.title, best.latitude, best.longitude)
  return { ...m, matched: true, latitude: best.latitude, longitude: best.longitude, naverId, matchType: best.matchType }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let idx = 0
  async function next() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await worker(items[i])
    }
  }
  await Promise.all(new Array(concurrency).fill(0).map(next))
  return results
}

async function main() {
  const env = loadEnv()
  if (!env.FOREST_SERVICE_KEY) throw new Error('.env.local에 FOREST_SERVICE_KEY 필요 (data.go.kr 산림청 산정보 API 인증키)')

  console.log('산림청에서 산 목록 조회 중...')
  const mountains = await fetchForestMountains(env.FOREST_SERVICE_KEY)
  console.log(`${mountains.length}개 산 조회됨. 네이버 지역검색으로 좌표 매칭 시작...`)

  const results = await runPool(mountains, (m) => matchOne(env, m), 4)
  const matched = results.filter((r) => r.matched)
  console.log(`매칭됨: ${matched.length} / 전체: ${results.length}`)

  const byNaverId = new Map()
  for (const m of matched) if (!byNaverId.has(m.naverId)) byNaverId.set(m.naverId, m)
  const uniqueRows = [...byNaverId.values()]
  console.log(`naver_id dedup 후: ${uniqueRows.length}`)

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: existing } = await supabase.from('poi').select('naver_id').not('naver_id', 'is', null)
  const existingSet = new Set((existing || []).map((r) => r.naver_id))
  const toInsert = uniqueRows
    .filter((r) => !existingSet.has(r.naverId))
    .map((m) => ({ name: m.name, latitude: m.latitude, longitude: m.longitude, category: 'mountain', naver_id: m.naverId, poi_tier: 1 }))

  console.log(`신규 삽입 대상: ${toInsert.length} (이미 존재: ${uniqueRows.length - toInsert.length})`)

  const CHUNK = 200
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { data, error } = await supabase.from('poi').insert(toInsert.slice(i, i + CHUNK)).select('id')
    if (error) { console.error('INSERT ERROR:', error.message); continue }
    inserted += data.length
  }
  console.log(`완료. 삽입된 행: ${inserted}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
