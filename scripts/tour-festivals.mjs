#!/usr/bin/env node
// TourAPI(KorService2 searchFestival2)로 다음 주 서울 지역 축제를 모아 issue-filter-check.mjs로
// 필터 판정을 채운 소재 카드 JSON 배열을 표준 출력에 쓴다(티켓 20260924_0856, PRD §7.3·T05).
// 사용법: node scripts/tour-festivals.mjs [--from YYYYMMDD --to YYYYMMDD](기본: 다음 주 월~일 KST).
// DATA_GO_KR_API_KEY 필요. 키 없음·HTTP·결과코드 오류는 stderr 한 줄 + 종료 코드 2, 0건이면 []·종료 0.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { applyJudgments } from './issue-filter-check.mjs'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2'
const NUM_OF_ROWS = 100

function formatYYYYMMDD(ms) {
  const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
function toDashDate(s) {
  return typeof s !== 'string' || s.length !== 8 ? (s ?? '') : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// 다음 주(월~일, KST) 범위를 YYYYMMDD로 돌려준다 — 오늘이 월·일요일이어도 항상 7일 이상 뒤다.
export function nextWeekRangeKst(now = new Date()) {
  const kstMs = now.getTime() + KST_OFFSET_MS
  const nextMondayMs = kstMs - ((new Date(kstMs).getUTCDay() + 6) % 7) * ONE_DAY_MS + 7 * ONE_DAY_MS
  return { from: formatYYYYMMDD(nextMondayMs), to: formatYYYYMMDD(nextMondayMs + 6 * ONE_DAY_MS) }
}

// item.eventstartdate~eventenddate(YYYYMMDD)가 [from, to]와 겹치는지, 양끝을 포함해 본다.
export function overlapsRange(item, from, to) {
  const start = item?.eventstartdate
  return !!start && start <= to && (item?.eventenddate || start) >= from
}

// lDongRegnCd(법정동 지역 코드)가 있으면 그 값으로, 없으면 addr1이 "서울"로 시작하는지로 판정한다.
export function isSeoul(item) {
  return item?.lDongRegnCd
    ? item.lDongRegnCd === '11'
    : typeof item?.addr1 === 'string' && item.addr1.startsWith('서울')
}

// CARD_FIELDS 키로 변환한다(usagePath=T05 고정, region=addr1의 앞 두 단어).
export function toSourceCard(item, observedAt) {
  const region = (item?.addr1 ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  return {
    title: item?.title ?? '', category: '지역 축제', source: 'TourAPI', observedAt,
    validPeriod: `${toDashDate(item?.eventstartdate)}~${toDashDate(item?.eventenddate)}`,
    region, tribeCandidates: '', usagePath: 'T05',
    verdict: '', reason: '', status: '후보', lifespan: '',
  }
}

// TourAPI 응답 items는 0건이면 빈 문자열, 1건이면 배열이 아닌 객체로 온다 — 배열로 정규화한다.
function extractItems(body) {
  const item = body?.items && body.items.item
  return item ? (Array.isArray(item) ? item : [item]) : []
}
async function fetchFestivalPage(apiKey, from, pageNo) {
  const qs = new URLSearchParams({
    _type: 'json', MobileOS: 'ETC', MobileApp: 'JAM', eventStartDate: from,
    numOfRows: String(NUM_OF_ROWS), pageNo: String(pageNo),
  })
  // 저장된 키는 공공데이터포털 인코딩 키라 다시 인코딩하지 않는다(holidays.ts와 같은 방식)
  const res = await fetch(`${BASE_URL}?serviceKey=${apiKey}&${qs}`)
  if (!res.ok) throw new Error(`TourAPI HTTP 오류: ${res.status}`)
  const { response } = await res.json()
  const h = response?.header
  if (h?.resultCode !== '0000') throw new Error(`TourAPI 결과 코드 오류: ${h?.resultCode ?? '알수없음'} ${h?.resultMsg ?? ''}`)
  return response.body
}
async function fetchAllFestivals(apiKey, from) {
  const first = await fetchFestivalPage(apiKey, from, 1)
  const items = extractItems(first)
  const totalPages = Math.ceil(Number(first?.totalCount ?? 0) / NUM_OF_ROWS)
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    items.push(...extractItems(await fetchFestivalPage(apiKey, from, pageNo)))
  }
  return items
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i]
    else if (argv[i] === '--to') args.to = argv[++i]
  }
  return args
}

async function main() {
  const now = new Date()
  const defaultRange = nextWeekRangeKst(now)
  const { from = defaultRange.from, to = defaultRange.to } = parseArgs(process.argv.slice(2))
  const apiKey = process.env.DATA_GO_KR_API_KEY
  if (!apiKey) { console.error('DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다'); process.exit(2) }
  let items
  try { items = await fetchAllFestivals(apiKey, from) }
  catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exit(2) }
  const observedAt = toDashDate(formatYYYYMMDD(now.getTime() + KST_OFFSET_MS))
  const seoulNextWeek = items.filter((item) => overlapsRange(item, from, to) && isSeoul(item))
  console.log(JSON.stringify(applyJudgments(seoulNextWeek.map((item) => toSourceCard(item, observedAt)))))
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
