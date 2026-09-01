#!/usr/bin/env node
/**
 * 전국 지하철/기차역 POI 매칭 (dry-run, 1회성) — 엑셀(노선, 역이름) → 네이버 지역검색 좌표 매칭
 * DB에 쓰지 않고 매칭 결과 + 확인 필요 케이스(JSON)만 산출한다. 실제 삽입은 insert-stations-poi.js에서.
 */
const fs = require('fs')
const path = require('path')

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
  const m = link && link.match(/place\/(\d+)/)
  if (m) return m[1]
  return `syn:${name}_${lat.toFixed(5)}_${lng.toFixed(5)}`
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function naverHeaders(env) {
  return { 'X-Naver-Client-Id': env.NAVER_LOCAL_SEARCH_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_LOCAL_SEARCH_CLIENT_SECRET }
}

async function naverSearch(env, query, attempt = 0) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`
  let res
  try {
    res = await fetch(url, { headers: naverHeaders(env) })
  } catch {
    if (attempt >= 5) return []
    await sleep(400 * 2 ** attempt + Math.random() * 200)
    return naverSearch(env, query, attempt + 1)
  }
  if (res.status === 429) {
    if (attempt >= 5) return []
    await sleep(400 * 2 ** attempt + Math.random() * 200)
    return naverSearch(env, query, attempt + 1)
  }
  if (!res.ok) return []
  const json = await res.json()
  return json.items || []
}

// 역 후보로 인정할 카테고리(지하철/전철/기차역/철도 정차역/버스터미널) — 출구/편의시설/음식점 등은 제외
const ACCEPT_CATEGORY = /^(교통,운수>(지하철|기차역|버스터미널)|기차,철도>)/

function normalizeTitle(title) {
  return stripHtml(title).trim()
}

// "경성대·부경대역"(원본) vs "경성대.부경대역"(네이버 표기), "수유역"(원본) vs "수유(강북구청)역"(네이버 표기)
// 등 구분자·괄호 부기 표기 차이를 흡수
function canon(s) {
  return s.replace(/\([^)]*\)/g, '').replace(/[·.]/g, '')
}

// title이 station명으로 시작하는지 (역 자체 결과인지, 인근 상점/카페 등은 제외)
function titleMatchesStation(title, stationName) {
  const ct = canon(title)
  const cn = canon(stationName)
  if (ct === cn) return true
  if (ct.startsWith(cn)) return true
  // "인천공항1터미널역" 처럼 station명 중간이 늘어난 경우는 제외(오탐 방지 위해 접두 일치만 허용)
  return false
}

function pickCandidates(items, stationName) {
  return items
    .map((it) => {
      const title = normalizeTitle(it.title)
      if (!it.mapx || !it.mapy) return null
      const { latitude, longitude } = parseCoord(it.mapx, it.mapy)
      return { title, category: it.category, addr: it.roadAddress || it.address, latitude, longitude, link: it.link }
    })
    .filter((c) => c && titleMatchesStation(c.title, stationName) && ACCEPT_CATEGORY.test(c.category))
}

async function matchStationLine(env, stationName, line, plainQuery) {
  const query = plainQuery ? stationName : `${line} ${stationName}`
  let items = await naverSearch(env, query)
  let candidates = pickCandidates(items, stationName)
  if (candidates.length === 0 && !plainQuery) {
    items = await naverSearch(env, stationName)
    candidates = pickCandidates(items, stationName)
  }
  // sort=random이라 같은 쿼리도 호출마다 결과 셋이 달라질 수 있음 — 실패 시 재시도로 흔들림 흡수
  for (let i = 0; i < 2 && candidates.length === 0; i++) {
    items = await naverSearch(env, stationName)
    candidates = pickCandidates(items, stationName)
  }
  if (candidates.length === 0) return { matched: false }
  const best = candidates[0]
  const naverId = resolveNaverId(best.link, best.title, best.latitude, best.longitude)
  return {
    matched: true,
    latitude: best.latitude,
    longitude: best.longitude,
    naverId,
    title: best.title,
    category: best.category,
    addr: best.addr,
    candidateCount: candidates.length,
  }
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
  const scratch = process.argv[2]
  if (!scratch) throw new Error('usage: node match-stations-poi.js <stations.json path>')
  const rows = JSON.parse(fs.readFileSync(scratch, 'utf8'))

  // 이름별 노선 그룹핑
  const byName = new Map()
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, [])
    byName.get(r.name).push(r.line)
  }

  console.log(`총 ${rows.length}행, 고유 역이름 ${byName.size}개. 네이버 매칭 시작...`)

  const tasks = []
  for (const [name, lines] of byName) {
    if (lines.length === 1) {
      tasks.push({ name, line: lines[0], plainQuery: true })
    } else {
      for (const line of lines) tasks.push({ name, line, plainQuery: false })
    }
  }

  const results = await runPool(
    tasks,
    async (t) => ({ ...t, ...(await matchStationLine(env, t.name, t.line, t.plainQuery)) }),
    5
  )

  const matched = results.filter((r) => r.matched)
  const unmatched = results.filter((r) => !r.matched)
  console.log(`매칭: ${matched.length} / 전체: ${results.length} (미매칭 ${unmatched.length})`)

  // 이름별로 다시 그룹핑해 근접(중복 가능) 판정
  const byNameMatched = new Map()
  for (const r of matched) {
    if (!byNameMatched.has(r.name)) byNameMatched.set(r.name, [])
    byNameMatched.get(r.name).push(r)
  }

  const CLOSE_M = 1000 // 이 거리 이내면 "같은 역/확인 필요"로 간주
  const reviewGroups = []
  const finalRows = [] // 최종 삽입 후보(확인 불필요, 자동 확정)

  for (const [name, group] of byNameMatched) {
    if (group.length === 1) {
      finalRows.push(group[0])
      continue
    }
    // 그룹 내 최대 pairwise distance
    let maxDist = 0
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const d = haversine(group[i].latitude, group[i].longitude, group[j].latitude, group[j].longitude)
        maxDist = Math.max(maxDist, d)
      }
    }
    if (maxDist <= CLOSE_M) {
      // 같은 역(환승) 가능성 높음 — 확인 필요
      reviewGroups.push({ name, maxDist: Math.round(maxDist), members: group })
    } else {
      // 서로 다른 도시의 동명역으로 판단 — 각각 별도 등록(자동)
      for (const m of group) finalRows.push(m)
    }
  }

  const output = {
    finalRows,
    reviewGroups,
    unmatched: unmatched.map((u) => ({ name: u.name, line: u.line })),
  }
  const outPath = path.join(path.dirname(scratch), 'match-result.json')
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
  console.log(`자동확정: ${finalRows.length}, 확인필요 그룹: ${reviewGroups.length}, 미매칭: ${unmatched.length}`)
  console.log(`결과 저장: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
