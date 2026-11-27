// 챕터·캡슐·잼 환산 모의 실험 (티켓 20261028_1731, 상위 20261028_1730의 U1) + 챕터 오름 보상 모델 (티켓 20261127_1723, 상위 20261127_1720의 A3)
//
// 모델이 둘이다. mode 'capsule'은 캡슐 있는 현행 기준선(아래 «새 구조» 설명, 20261028 이후 결과와 같게 유지), mode 'chapter'는 캡슐을 폐지하고
// 잼이 챕터 진행값만 올리며 챕터가 오를 때 아이템 배지 보상을 주는 새 안이다(챕터 1~9의 필요 잼은 CHAPTER_NEED, 한 번에 여러 챕터가 오를 수 있고 넘친 잼은 이월한다).
//
// 새 구조(잼 자동 채움 D2, 100% 즉시 보상 D3, 포인트로 잠긴 배지 열기 D4, 서비스 활동 잼 D5, 보류·소멸 D9, 챕터 = 캡슐 양 × 100% 횟수 D1)를
// 퍼소나 7종 × 안(SCENARIOS) × 반복 N회, 주 단위로 흉내 낸다. 읽기 전용 계산이고 DB와 서비스 코드를 건드리지 않는다.
// 같은 시드는 활동 잼과 서비스 활동 발생(난수 흐름을 따로 둠)을 모든 안이 함께 써서 안 사이 짝 비교가 된다.
//
// 출력 두 종류: «역산 후보»(목표에서 거꾸로 계산한 값, 시뮬레이션 아님)와 «실측»(주 단위 반복의 결과). 둘은 표 제목에서 구분한다.
//   ① 챕터 2·5·10 도달  ② 챕터 1·5·10의 캡슐 가득 참 주당 횟수  ③ 월 아이템 배지(동기화·캡슐)  ④ 포인트 월 수입·지출·잔액·쌓인 잠긴 배지
//   ⑤ 인벤토리 보류 주 비율·잼 소멸  ⑥ 서비스 활동 잼 상한 있음/없음 짝 비교  ⑦ 잼 조건 배지·미션 영향  + 19.2절 목표 대조
//   ⑧ 등급별 월 아이템 배지(Rare 주당, Epic·Mystic 월)와 출처 비중 + 안 비교 표(기준 유저)
//   챕터 모드는 ②(챕터별 가득 참 주당 횟수)와 잼 소멸이 없어 «-»로 둔다. ⑤의 «보류 주%»는 «보상이 빈칸을 기다린 주 비율»이다.
//   ⑨ 동기화 막힘(챕터 모드만, 티켓 20261127_1752): 막힌 주 비율, 막힘 시작 횟수, 평균·최장 막힘 길이, 미뤄진 활동 최대 개수, 서비스 활동 잼 손실률
//
// 사용법: node scripts/balance-sim/chapter-capsule-sim.mjs [반복 횟수=400] [안 id 쉼표 목록=전체]   (환경변수 SIM_JSON=결과를 저장할 경로)
//   안 id: 현행양, 목표역산안, 목표역산안-상한없음(이상 mode capsule), 챕터오름-A, 챕터오름-B, 챕터오름-C, 챕터오름-D, 챕터오름-E(이상 mode chapter)
//   보조 환경변수: CLEAR_MULT(비우는 속도 배율, 기본 1), SERVICE_MULT(서비스 활동 발생 배율, 기본 1) — 추정값의 민감도를 볼 때 쓴다.
//   BLOCK_SYNC(기본 1, 챕터 모드에만 적용): 1이면 비우기·보상 받기 뒤에도 보상 대기열이 남은 주의 동기화를 막는다(실제 구현 Q-c, C2a·C3b를 옮긴 것).
//     막힌 주의 활동은 잃지 않고 쌓였다가 풀린 주에 한꺼번에 처리하고, 막힌 주의 서비스 활동 잼은 지급하지 않는다(코드로 확인한 사실). 0이면 막힘 없이 A3 때와 같다.
//
// 값의 출처: 운영 로직 4.4, 5.4, 6.7, 7.4, 12.4, 14.1절과 게이미피케이션 밸런스 2~3절. 공용 DB inventory_policy.max_slots(2026-10-28 읽음).
// 한계(운영 로직에 없어 // 추정 으로 표시한 입력): 서비스 활동 잼 고정값·상한·종류별 주당 발생 횟수, 퍼소나별 주당 비우는 개수,
//   액티비티·체크인 배지 등 고정 포인트 수입, 활동 한 번의 잼 변동폭(±30%), 직접 받은(잠기지 않은) 아이템 배지도 받을 때 등급 포인트를 준다는 해석,
//   보상 추첨은 가득 찬 순간에 한다(실제도 열 때 정한다). 드랍·픽업·시스템 드랍·단서 레시피·미션 보상은 넣지 않았다.
//   동기화로 받은 아이템 배지가 칸이 없을 때 쌓이는 대기열은 이 시뮬레이터의 가정이다(운영 로직 6.4절은 캡슐 보류만 말한다).
// 챕터 오름 보상 모델의 한계(추정): 보상 개수·등급 확률은 후보 입력이지 확정값이 아니다(Q-b). 보상 꾸러미 하나가 들어갈 빈칸이 모자라면 빈칸이 날 때까지
//   대기열에 쌓는다(Q-c 미정이라 쓰는 가정, 대기 중에도 잼은 소멸하지 않는다). 챕터 오름 보상의 아이템 배지도 잠금 비율 JAM.locked를 그대로 쓴다(Q-i 미정).
//   챕터 10에서는 진행값이 쌓이기만 하고 보상은 없다. 포인트는 별도 재화로 두고 기존 모델 그대로다.
const N = Number(process.argv[2] ?? 400)
const ONLY = process.argv[3] ? process.argv[3].split(',') : null
const WPM = 365.25 / 12 / 7 // 한 달의 주 수
const MONTHS = 24
const MAXW = Math.ceil(MONTHS * WPM)
const Y1 = Math.floor(12 * WPM) // 첫 12달(주)
const CLEAR_MULT = Number(process.env.CLEAR_MULT ?? 1)
const SERVICE_MULT = Number(process.env.SERVICE_MULT ?? 1)
const BLOCK_SYNC = Number(process.env.BLOCK_SYNC ?? 1) !== 0 // 챕터 모드 동기화 막힘(티켓 20261127_1752). 캡슐 모드에는 적용하지 않는다

// ── 입력 상수(출처는 줄마다)
const CAPSULE = { bonusProb: 0.2, rarity: [70, 22, 6, 2], pity: 15 } // 5.4절
const JAM = { bonusRolls: 2, divisor: 600, maxProb: 0.25, syncRarity: [84, 13, 2.5, 0.5], streak: 10, locked: 0.25 } // 6.7절
const CH_COST = [90, 100, 110, 120, 135, 150, 165, 180, 200, 220] // 5.4절(현행 양)
const CHAPTER_NEED = [870, 1120, 1260, 1600, 1980, 2205, 2700, 3300, 3960] // 챕터 1~9의 필요 잼(상위 티켓 20261127_1720). 챕터 10은 필요량 없음
const LOCKED_PTS = [30, 60, 120, 240] // 7.4절 최소값(현행은 잼이었고, 후보안은 같은 숫자를 포인트로 쓴다)
const ITEM_PTS = [10, 20, 50, 100] // 14.1절 아이템 배지 열림 포인트
const QUEST_POINTS = 100 // 14.1절 퀘스트 완료
const SLOTS = 10 // 공용 DB inventory_policy.max_slots, 2026-10-28 읽음
const JAM_JITTER = 0.3 // 추정: 활동 한 번의 잼이 평균의 ±30% 안에서 흔들린다
const BASE_FIXED_PTS = 100 // 추정: 러닝 보통의 주당 고정 포인트(액티비티·체크인 배지, 컬렉션, 믹스). 보통 유저 월 800~900(14.3절)에 맞춤
const BASE_CLEAR = 6 // 추정: 러닝 보통이 컬렉션 장착·믹스로 주당 비우는 아이템 배지 수
const BASE_UNLOCKS = 2 // 19장 3절: 기준 유저가 주 2개쯤 연다(역산 보조 함수의 서비스 잼 어림에만 쓴다)
// 퍼소나(밸런스 문서 2절): 주당 잼 = 주 횟수 × 회당 잼. 등산은 월 4회
const PERSONAS = {
  '걷기 보통': { acts: 3, jamPerAct: 60, guaranteed: 1 },
  '등산 보통': { acts: 4 / WPM, jamPerAct: 300, guaranteed: 2 },
  '러닝 보통': { acts: 3, jamPerAct: 111, guaranteed: 1 },
  '트레일러닝 보통': { acts: 2, jamPerAct: 228, guaranteed: 1 },
  '러닝 열심': { acts: 4, jamPerAct: 207, guaranteed: 1 },
  '자전거 열심': { acts: 3, jamPerAct: 320, guaranteed: 1 },
  '트레일러닝 열심': { acts: 3, jamPerAct: 375, guaranteed: 1 }
}
for (const p of Object.values(PERSONAS)) {
  p.weeklyJam = p.acts * p.jamPerAct
  p.scale = Math.sqrt(p.weeklyJam / 333) // 추정: 서비스 활동·고정 포인트는 활동량의 제곱근에 비례한다
  p.clear = BASE_CLEAR * (p.weeklyJam / 333) ** 0.8 * CLEAR_MULT // 추정
}
// 서비스 활동 잼 표(D5). 값은 전부 추정이다: 운영 로직에 없다. rate는 러닝 보통 기준 주당 발생 횟수(// 추정), unlock은 시뮬레이션이 센다
const SERVICE_KINDS = {
  unlock: { label: '잠긴 배지 열기', jam: 5, rate: null }, // 추정
  badge: { label: '배지 받기', jam: 5, rate: 2 }, // 추정
  collection: { label: '컬렉션 완성', jam: 30, rate: 0.1 }, // 추정
  mix: { label: '믹스 성공', jam: 5, rate: 0.5 }, // 추정
  mission: { label: '미션 완료', jam: 20, rate: 0.4 } // 추정
} // 드랍·픽업은 0, 캡슐 가득 참은 표에 넣지 않는다(D5)
const SERVICE_CAP = { day: 40, week: 100 } // 추정: 하루·주간 상한
const BASE_ACT = 333 // 기준 유저(러닝 보통) 주당 활동 잼
const TARGET = { r1: 2.5, r10: 1, ch5Weeks: 3 * WPM, ch10Weeks: 12 * WPM } // 19.2절(챕터 1 주 2~3번의 가운데 2.5)

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function weighted(rand, w) {
  let r = rand() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < w.length; i++) {
    r -= w[i]
    if (r < 0) return i
  }
  return w.length - 1
}
const sumArr = (a) => a.reduce((x, y) => x + y, 0)
const avg = (a) => (a.length ? sumArr(a) / a.length : 0)
const quant = (sorted, f) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] : NaN)
const sortNum = (a) => [...a].sort((x, y) => x - y)
const r5 = (x) => Math.round(x / 5) * 5

// ── 역산 보조 함수(후보 계산값. 시뮬레이션이 아니다)
// 기준 유저의 주당 잼(활동 + 서비스)과 19.2절 목표에서 챕터별 캡슐 양과 100% 횟수를 거꾸로 계산한다.
// 챕터 c의 가득 참 속도는 챕터 1의 r1에서 챕터 10의 r10까지 등비로 줄고, 챕터에 머무는 주는 등비(비율 g)로 늘며,
// 챕터 5 도달(챕터 1~4 합)과 챕터 10 도달(챕터 1~9 합)이 목표 주 수에 맞게 g를 이분법으로 푼다.
function serviceWeeklyEstimate() {
  let s = BASE_UNLOCKS * SERVICE_KINDS.unlock.jam
  for (const [k, v] of Object.entries(SERVICE_KINDS)) if (k !== 'unlock') s += v.rate * v.jam
  return Math.min(SERVICE_CAP.week, s)
}
function invert() {
  const J = BASE_ACT + serviceWeeklyEstimate()
  let lo = 1.0001
  let hi = 4
  for (let i = 0; i < 80; i++) {
    const g = (lo + hi) / 2
    const ratio = (g ** 9 - 1) / (g ** 4 - 1)
    if (ratio < TARGET.ch10Weeks / TARGET.ch5Weeks) lo = g
    else hi = g
  }
  const g = (lo + hi) / 2
  const w1 = TARGET.ch5Weeks / ((g ** 4 - 1) / (g - 1))
  const rows = []
  let cum = 0
  for (let c = 1; c <= 10; c++) {
    const rate = TARGET.r1 * (TARGET.r10 / TARGET.r1) ** ((c - 1) / 9)
    const weeks = w1 * g ** (c - 1)
    const amount = r5(J / rate)
    const count = Math.max(1, Math.round(weeks * rate))
    if (c < 10) cum += count / (J / amount)
    rows.push({ ch: c, rate: +rate.toFixed(2), amount, count: c < 10 ? count : null, cumMonthsAtEnd: c < 10 ? +(cum / WPM).toFixed(1) : null })
  }
  return { J: Math.round(J), g: +g.toFixed(3), rows, amounts: rows.map((r) => r.amount), counts: rows.slice(0, 9).map((r) => r.count) }
}
const INV = invert()
const noCap = { day: Infinity, week: Infinity }
// 챕터 오름 보상 후보(값은 티켓 20261127_1723 «구현 계획»이 시뮬레이션 입력으로 제안한 것이고 서비스 확정값이 아니다, // 추정)
// count(c): 챕터 c를 마치고 c+1로 오를 때 받는 아이템 배지 수. 챕터 1~3은 2개, 4~6은 3개, 7~9는 4개를 B·C가 쓴다(마친 챕터 번호 기준, // 추정)
const REWARD_COUNT_UP = (c) => (c <= 3 ? 2 : c <= 6 ? 3 : 4)
const REWARD_COUNT_UP_PLUS = (c) => (c <= 3 ? 3 : c <= 6 ? 4 : 5) // D·E: A~C 결과가 Rare·Epic·Mystic 목표에 모자라 더한 후보(// 추정)
const REWARD_MODELS = {
  '챕터오름-A': { label: '챕터 오름 A: 챕터마다 1개, 캡슐 등급 확률', count: () => 1, rarity: CAPSULE.rarity, pity: CAPSULE.pity, bonusProb: 0 },
  '챕터오름-B': { label: '챕터 오름 B: 개수 2/3/4(챕터 1~3/4~6/7~9), 캡슐 등급 확률', count: REWARD_COUNT_UP, rarity: CAPSULE.rarity, pity: CAPSULE.pity, bonusProb: 0 },
  '챕터오름-C': { label: '챕터 오름 C: 개수 2/3/4, 등급 확률 40/35/18/7', count: REWARD_COUNT_UP, rarity: [40, 35, 18, 7], pity: CAPSULE.pity, bonusProb: 0 },
  '챕터오름-D': { label: '챕터 오름 D: 개수 2/3/4, 등급 확률 20/45/25/10(등급 상향형)', count: REWARD_COUNT_UP, rarity: [20, 45, 25, 10], pity: CAPSULE.pity, bonusProb: 0 },
  '챕터오름-E': { label: '챕터 오름 E: 개수 3/4/5, 등급 확률 30/40/22/8(개수·등급 상향형)', count: REWARD_COUNT_UP_PLUS, rarity: [30, 40, 22, 8], pity: CAPSULE.pity, bonusProb: 0 }
}
const CAPSULE_REWARD = { count: () => 1, rarity: CAPSULE.rarity, pity: CAPSULE.pity, bonusProb: CAPSULE.bonusProb } // mode capsule: 지금 코드와 같은 캡슐 추첨
const SCENARIOS = [
  { id: '현행양', mode: 'capsule', label: '현행 양(90~220) + 역산 횟수', amounts: CH_COST, counts: INV.counts, cap: SERVICE_CAP, lockedPts: LOCKED_PTS, reward: CAPSULE_REWARD },
  { id: '목표역산안', mode: 'capsule', label: '목표 역산안(상한 있음)', amounts: INV.amounts, counts: INV.counts, cap: SERVICE_CAP, lockedPts: LOCKED_PTS, reward: CAPSULE_REWARD },
  { id: '목표역산안-상한없음', mode: 'capsule', label: '목표 역산안 + 서비스 활동 잼 상한 없음', amounts: INV.amounts, counts: INV.counts, cap: noCap, lockedPts: LOCKED_PTS, reward: CAPSULE_REWARD },
  ...Object.entries(REWARD_MODELS).map(([id, r]) => ({ id, mode: 'chapter', label: r.label, amounts: CHAPTER_NEED, counts: null, cap: SERVICE_CAP, lockedPts: LOCKED_PTS, reward: r }))
].filter((s) => !ONLY || ONLY.includes(s.id))

// ── 한 퍼소나 × 한 안 × 한 시드의 24개월
const WEEK_THRESH = [200, 330, 830, 1200] // 원고 기준값(주간 잼 조건)
const CUM_THRESH = [1000, 5000, 20000, 50000, 100000] // 잼 이정표
function sim(p, sc, seed) {
  const rA = mulberry32(seed) // 활동 잼
  const rS = mulberry32(seed + 7000001) // 서비스 활동 발생(안과 무관하게 같다)
  const rI = mulberry32(seed + 13000003) // 아이템 추첨
  const rU = mulberry32(seed + 19000007) // 비우기·열기 날짜
  const m = { reach: {}, compCh: Array(11).fill(0), weeksCh: Array(11).fill(0), sync12: 0, cap12: 0, ptsItem12: 0, ptsFix12: 0, spend12: 0, bal12: 0, backlog12: 0, holdWeeks: 0, nearFull: 0, lost: 0, svcRaw: 0, svcGot: 0, wkAct: [], wkTot: [], cumAct: {}, cumTot: {}, unlockN12: 0, blockWeeks: 0, blockWeeks12: 0, blockStreaks: 0, blockStreaks12: 0, blockStreakMax: 0, deferredActsMax: 0, svcLostBlocked: 0, tier12: [0, 0, 0, 0], tierSrc12: { sync12: [0, 0, 0, 0], cap12: [0, 0, 0, 0] } }
  const isChapter = sc.mode === 'chapter'
  let actCarry = rA()
  let blockRun = 0 // 지금 이어지는 막힘 길이(주)
  let ch = 1
  let inCh = 0
  let need = sc.amounts[0]
  let fill = 0
  let streak = 0
  let epicMiss = 0
  let points = QUEST_POINTS
  let freeOpen = true // 퀘스트의 첫 잠긴 배지는 0포인트(D4)
  let inv = 0
  let cumA = 0
  let cumT = 0
  const lockedQ = [] // 칸에 들어와 있는 잠긴 배지의 등급(먼저 받은 것부터 연다)
  const pend = [] // 보류된 캡슐 보상(최대 2개)
  const syncQ = [] // 칸이 없어 기다리는 동기화 아이템 배지
  const free = () => SLOTS - inv
  const give = (it, src, w) => {
    inv++
    if (w < Y1 && src) m[src]++
    if (w < Y1) {
      m.tier12[it.tier]++
      if (src) m.tierSrc12[src][it.tier]++
    }
    if (it.locked) lockedQ.push(it.tier)
    else {
      points += ITEM_PTS[it.tier]
      if (w < Y1) m.ptsItem12 += ITEM_PTS[it.tier]
    }
  }
  const roll = (tier) => ({ tier, locked: rI() < JAM.locked })
  // 보상 추첨: mode capsule은 지금 캡슐 추첨(개수 1 + 보너스, 등급 CAPSULE.rarity)과 난수 흐름까지 같고, mode chapter는 sc.reward의 개수·등급 확률을 쓴다
  const drawReward = (rw, doneCh) => {
    const cnt = rw.count(doneCh) + (rw.bonusProb > 0 && rI() < rw.bonusProb ? 1 : 0)
    const items = []
    let anyEpic = false
    for (let i = 0; i < cnt; i++) {
      let tier
      if (i === 0 && epicMiss >= rw.pity) tier = 2 + weighted(rI, rw.rarity.slice(2))
      else if (streak >= JAM.streak) tier = 1 + weighted(rI, rw.rarity.slice(1))
      else tier = weighted(rI, rw.rarity)
      streak = tier === 0 ? streak + 1 : 0
      if (tier >= 2) anyEpic = true
      items.push(roll(tier))
    }
    epicMiss = anyEpic ? 0 : epicMiss + 1
    return items
  }
  // 보상 꾸러미가 들어갈 빈칸: 캡슐은 현행대로 2칸, 챕터 오름 보상은 꾸러미 크기만큼(칸이 모자라면 대기열에 쌓는다, // 추정)
  const roomFor = (items) => (isChapter ? items.length : 2)
  // mode chapter: 챕터 진행값이 필요 잼에 닿으면 챕터가 오르고(넘친 잼 이월, 한 번에 여러 챕터), 오를 때마다 보상을 추첨한다. 챕터 10은 쌓이기만 한다
  const settleChapter = (w) => {
    while (ch < 10 && fill >= CHAPTER_NEED[ch - 1]) {
      fill -= CHAPTER_NEED[ch - 1]
      const done = ch
      ch++
      m.reach[ch] = w + 1
      const items = drawReward(sc.reward, done)
      if (pend.length === 0 && free() >= roomFor(items)) for (const it of items) give(it, 'cap12', w)
      else pend.push(items)
    }
  }
  const settle = (w) => {
    if (isChapter) return settleChapter(w)
    while (fill >= need && pend.length < 2) {
      fill -= need
      m.compCh[ch]++
      const items = drawReward(sc.reward, ch)
      if (pend.length === 0 && free() >= roomFor(items)) for (const it of items) give(it, 'cap12', w)
      else pend.push(items)
      inCh++ // 챕터 횟수는 100%에 닿는 시점에 센다(D9)
      if (ch < 10 && inCh >= sc.counts[ch - 1]) {
        ch++
        inCh = 0
        m.reach[ch] = w + 1
      }
      need = sc.amounts[ch - 1] // 다음 캡슐부터 새 양
    }
  }
  const drain = (w) => {
    while (pend.length && free() >= roomFor(pend[0])) for (const it of pend.shift()) give(it, 'cap12', w)
    while (syncQ.length && free() >= 1) give(syncQ.shift(), 'sync12', w)
  }
  for (let w = 0; w < MAXW; w++) {
    // 비우기(컬렉션 장착·믹스), 보류 받기
    const unlockedHeld = inv - lockedQ.length
    const clr = Math.min(unlockedHeld, Math.floor(p.clear) + (rU() < p.clear % 1 ? 1 : 0))
    inv -= clr
    drain(w)
    settle(w)
    // 동기화 막힘(챕터 모드): 비우기·보상 받기 뒤에도 보상 대기열이 남으면 이 주의 동기화가 막힌다. 커서가 움직이지 않아 활동은 쌓였다가 풀린 주에 한꺼번에 들어온다
    const blocked = isChapter && BLOCK_SYNC && pend.length > 0
    if (blocked) {
      if (blockRun === 0) {
        m.blockStreaks++
        if (w < Y1) m.blockStreaks12++
      }
      blockRun++
      m.blockWeeks++
      if (w < Y1) m.blockWeeks12++
      if (blockRun > m.blockStreakMax) m.blockStreakMax = blockRun
    } else blockRun = 0
    // 동기화: 활동마다 확정 개수 + 보너스 두 번
    let actJam = 0
    actCarry += p.acts
    if (blocked) m.deferredActsMax = Math.max(m.deferredActsMax, Math.floor(actCarry))
    while (!blocked && actCarry >= 1) {
      actCarry -= 1
      const j = Math.floor(p.jamPerAct * (1 - JAM_JITTER + 2 * JAM_JITTER * rA()))
      actJam += j
      let cnt = p.guaranteed
      const pb = Math.min(JAM.maxProb, j / JAM.divisor)
      for (let k = 0; k < JAM.bonusRolls; k++) if (rI() < pb) cnt++
      for (let i = 0; i < cnt; i++) {
        const tier = streak >= JAM.streak ? 1 + weighted(rI, JAM.syncRarity.slice(1)) : weighted(rI, JAM.syncRarity)
        streak = tier === 0 ? streak + 1 : 0
        if (free() >= 1) give(roll(tier), 'sync12', w)
        else syncQ.push(roll(tier))
      }
    }
    // 고정 포인트 수입(추정)와 잠긴 배지 열기(포인트가 모이면 먼저 받은 것부터)
    const fix = BASE_FIXED_PTS * p.scale
    points += fix
    if (w < Y1) m.ptsFix12 += fix
    let unlocks = 0
    while (lockedQ.length) {
      const cost = freeOpen ? 0 : sc.lockedPts[lockedQ[0]]
      if (points < cost) break
      points -= cost
      freeOpen = false
      if (w < Y1) m.spend12 += cost
      const tier = lockedQ.shift()
      // 열린 아이템 배지는 칸에 남는다(잠긴 칸이 열린 칸이 될 뿐): 칸 수는 그대로
      points += ITEM_PTS[tier]
      if (w < Y1) m.ptsItem12 += ITEM_PTS[tier]
      unlocks++
    }
    if (w < Y1) m.unlockN12 += unlocks
    // 서비스 활동 잼: 날짜마다 하루 상한, 한 주 상한
    const ev = []
    for (const [k, v] of Object.entries(SERVICE_KINDS)) {
      if (k === 'unlock') for (let i = 0; i < unlocks; i++) ev.push([Math.floor(rU() * 7), v.jam])
      else {
        const r = v.rate * p.scale * SERVICE_MULT
        const n = Math.floor(r) + (rS() < r % 1 ? 1 : 0)
        for (let i = 0; i < n; i++) ev.push([Math.floor(rS() * 7), v.jam])
      }
    }
    const dayUsed = Array(7).fill(0)
    let weekUsed = 0
    let raw = 0
    for (const [d, j] of ev) {
      raw += j
      const g = Math.max(0, Math.min(j, sc.cap.day - dayUsed[d], sc.cap.week - weekUsed))
      dayUsed[d] += g
      weekUsed += g
    }
    m.svcRaw += raw
    // 막힌 주는 서비스 활동 잼을 지급하지 않는다(지급 0, 보충 없음). 잃은 양은 상한을 적용했을 때 받았을 양이다
    if (blocked) {
      m.svcLostBlocked += weekUsed
      weekUsed = 0
    }
    m.svcGot += weekUsed
    // 캡슐 채우기: 잼을 받을 수 없는 동안(보류 2개)의 잼은 사라진다(D9)
    const intake = actJam + weekUsed
    if (!isChapter && pend.length >= 2) m.lost += intake
    else fill += intake
    settle(w)
    // 기록
    m.weeksCh[ch]++
    m.wkAct.push(actJam)
    m.wkTot.push(intake)
    cumA += actJam
    cumT += intake
    for (const t of CUM_THRESH) {
      if (m.cumAct[t] === undefined && cumA >= t) m.cumAct[t] = w + 1
      if (m.cumTot[t] === undefined && cumT >= t) m.cumTot[t] = w + 1
    }
    if (pend.length) m.holdWeeks++
    if (free() <= 3) m.nearFull++
    if (w === Y1 - 1) {
      m.bal12 = points
      m.backlog12 = lockedQ.length
    }
  }
  return m
}

// ── 실행과 집계
const fmtM = (wk) => (wk === undefined || wk === Infinity ? '24달 넘음' : `${(wk / WPM).toFixed(1)}달`)
const medianReach = (runs, c) => {
  const a = sortNum(runs.map((r) => (r.reach[c] ?? Infinity) / WPM))
  const f = (x) => (x === Infinity ? '24달 넘음' : `${x.toFixed(1)}달`)
  return `${f(quant(a, 0.5))} [${f(quant(a, 0.25))}~${f(quant(a, 0.75))}]`
}
const rateCh = (runs, c) => {
  const w = sumArr(runs.map((r) => r.weeksCh[c]))
  return w ? sumArr(runs.map((r) => r.compCh[c])) / w : NaN
}
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-')
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-')
const mo12 = 12
const tierPerMonth = (r) => ({ rareWk: r.tier12[1] / (mo12 * WPM), epic: r.tier12[2] / mo12, mystic: r.tier12[3] / mo12, mysticEvery: r.tier12[3] > 0 ? mo12 / r.tier12[3] : Infinity })
const out = {}
console.log(`반복 ${N}회, 최대 ${MONTHS}달, 인벤토리 ${SLOTS}칸, CLEAR_MULT=${CLEAR_MULT}, SERVICE_MULT=${SERVICE_MULT}, BLOCK_SYNC=${BLOCK_SYNC ? 1 : 0}\n`)
console.log('=== [역산 후보 · 계산값 · 시뮬레이션 아님] 기준 유저(러닝 보통)의 주당 잼 활동 333 + 서비스 어림, 19.2절 목표에서 거꾸로 ===')
console.log(`주당 잼 ${INV.J}(서비스 어림 ${INV.J - BASE_ACT}, 추정), 챕터에 머무는 주의 비율 g=${INV.g}, 현행 양 90 기준 챕터 1 주당 가득 참 ${(333 / 90).toFixed(1)}번(전부 캡슐에 쓸 때, 산술)`)
console.log('챕터 | 캡슐 양(후보) | 100% 횟수(후보) | 목표 가득 참 주당 | 이 챕터를 마칠 때까지 누적(달)')
for (const r of INV.rows) console.log(`${String(r.ch).padStart(3)}  | ${String(r.amount).padStart(5)}       | ${String(r.count ?? '-').padStart(5)}           | ${String(r.rate).padStart(5)}             | ${r.cumMonthsAtEnd ?? '-'}`)
console.log(`현행 잠긴 배지 포인트 후보 ${LOCKED_PTS.join('/')}(7.4절 잼 값을 포인트로 옮김), 서비스 활동 잼 상한 후보 하루 ${SERVICE_CAP.day} / 주 ${SERVICE_CAP.week}(추정)\n`)
out.inversion = INV
for (const sc of SCENARIOS) {
  out[sc.id] = {}
  console.log(`\n######## 안: ${sc.id} — ${sc.label}\n[실측 · 시뮬레이션] (중앙값 [25~75%]; 첫 12달 기준 월 평균)`)
  console.log('퍼소나'.padEnd(10), '| ①챕터2 | 챕터5 | 챕터10 | ②가득 참 주당 챕터1/5/10 | ③월 배지 동기화+캡슐 | ④월 포인트 수입/열기 지출, 12달 잔액, 쌓인 잠김 | ⑤보류 주%, 월 소멸 잼, 거의 가득 참 주%')
  for (const [pn, p] of Object.entries(PERSONAS)) {
    const runs = []
    for (let i = 0; i < N; i++) runs.push(sim(p, sc, 1000 + i))
    const a = (k) => avg(runs.map((r) => r[k]))
    const isCh = sc.mode === 'chapter'
    const tierAvg = (get) => [0, 1, 2, 3].map((t) => avg(runs.map((r) => get(r)[t])))
    const row = {
      reach: [2, 5, 10].map((c) => medianReach(runs, c)),
      rate: [1, 5, 10].map((c) => (isCh ? NaN : rateCh(runs, c))),
      sync: a('sync12') / mo12,
      cap: a('cap12') / mo12,
      ptsIn: (a('ptsItem12') + a('ptsFix12')) / mo12,
      spend: a('spend12') / mo12,
      bal: a('bal12'),
      backlog: a('backlog12'),
      hold: a('holdWeeks') / MAXW,
      lostMo: isCh ? NaN : a('lost') / MONTHS,
      tier12: tierAvg((r) => r.tier12), // 첫 12달 등급별(Common~Mystic) 받은 아이템 배지 평균 개수
      tierSync12: tierAvg((r) => r.tierSrc12.sync12),
      tierCap12: tierAvg((r) => r.tierSrc12.cap12), // 출처 cap12: mode capsule은 캡슐, mode chapter는 챕터 오름 보상
      near: a('nearFull') / MAXW,
      svcGot: a('svcGot') / MAXW,
      svcRaw: a('svcRaw') / MAXW,
      // ⑨ 동기화 막힘(챕터 모드 BLOCK_SYNC=1에서만 0보다 크다)
      blockPct12: a('blockWeeks12') / Y1,
      blockPct: a('blockWeeks') / MAXW,
      blockStarts12: a('blockStreaks12'),
      blockLen12: sumArr(runs.map((r) => r.blockStreaks12)) ? sumArr(runs.map((r) => r.blockWeeks12)) / sumArr(runs.map((r) => r.blockStreaks12)) : NaN,
      blockLen: sumArr(runs.map((r) => r.blockStreaks)) ? sumArr(runs.map((r) => r.blockWeeks)) / sumArr(runs.map((r) => r.blockStreaks)) : NaN,
      blockMaxAvg: a('blockStreakMax'),
      blockMax: Math.max(...runs.map((r) => r.blockStreakMax)),
      deferredAvg: a('deferredActsMax'),
      deferredMax: Math.max(...runs.map((r) => r.deferredActsMax)),
      svcLostPct: a('svcRaw') ? a('svcLostBlocked') / a('svcRaw') : NaN
    }
    const a5 = sortNum(runs.map((r) => (r.reach[5] ?? Infinity) / WPM))
    const a10 = sortNum(runs.map((r) => (r.reach[10] ?? Infinity) / WPM))
    row.med5 = quant(a5, 0.5)
    row.med10 = quant(a10, 0.5)
    // ⑦ 잼 조건 영향용 모음
    const act = runs.flatMap((r) => r.wkAct)
    const tot = runs.flatMap((r) => r.wkTot)
    row.act = sortNum(act)
    row.tot = sortNum(tot)
    row.cumA = CUM_THRESH.map((t) => quant(sortNum(runs.map((r) => (r.cumAct[t] ?? Infinity) / WPM)), 0.5))
    row.cumT = CUM_THRESH.map((t) => quant(sortNum(runs.map((r) => (r.cumTot[t] ?? Infinity) / WPM)), 0.5))
    row.meanA = avg(act)
    row.meanT = avg(tot)
    out[sc.id][pn] = row
    console.log(
      pn.padEnd(10),
      '|', row.reach.join(' | '),
      '|', row.rate.map(f2).join('/'),
      '|', `${f1(row.sync)}+${f1(row.cap)}=${f1(row.sync + row.cap)}`,
      '|', `${Math.round(row.ptsIn)}/${Math.round(row.spend)}, ${Math.round(row.bal)}, ${f1(row.backlog)}개`,
      '|', `${(row.hold * 100).toFixed(1)}%, ${Number.isFinite(row.lostMo) ? Math.round(row.lostMo) : '-'}, ${(row.near * 100).toFixed(1)}%`
    )
  }
  // 19.2절 목표 대조(기준 유저 러닝 보통)
  const b = out[sc.id]['러닝 보통']
  const w = out[sc.id]['걷기 보통']
  const chk = (ok) => (ok ? '목표 안' : '목표 밖')
  const itemsMo = b.sync + b.cap
  if (sc.mode === 'chapter') console.log('-- 19.2절 대조(러닝 보통): 챕터 1·10 가득 참 주당 횟수는 챕터 오름 보상 모델에 해당 없음(-)')
  else console.log(`-- 19.2절 대조(러닝 보통): 챕터 1 주 ${f2(b.rate[0])}번(2~3) ${chk(b.rate[0] >= 2 && b.rate[0] <= 3)} | 챕터 10 주 ${f2(b.rate[2])}번(약 1) ${Number.isFinite(b.rate[2]) ? chk(b.rate[2] >= 0.8 && b.rate[2] <= 1.25) : '24달 안에 도달 못 함'}`)
  console.log(`   챕터 5 ${f1(b.med5)}달(약 3) ${chk(b.med5 >= 2.5 && b.med5 <= 3.5)} | 챕터 10 ${Number.isFinite(b.med10) ? f1(b.med10) + '달' : '24달 넘음'}(약 12) ${chk(b.med10 >= 10 && b.med10 <= 14)} | 월 배지 ${f1(itemsMo)}개(20~30) ${chk(itemsMo >= 20 && itemsMo <= 30)} | 거의 가득 참 ${(b.near * 100).toFixed(1)}%(20% 미만) ${chk(b.near < 0.2)}`)
  if (sc.mode !== 'chapter') console.log(`   가벼운 유저(걷기 보통) 챕터 1 주 ${f2(w.rate[0])}번(1 이상) ${chk(w.rate[0] >= 1)}`)
  // ⑧ 등급별 월 아이템 배지: Rare 주 1번, Epic 월 1번, Mystic 3~5달에 1번 판정(러닝 보통)
  const tm = tierPerMonth(b)
  console.log(`   등급 체감(러닝 보통, 받은 개수 기준): Rare 주 ${f2(tm.rareWk)}번(약 1) ${chk(tm.rareWk >= 0.8 && tm.rareWk <= 1.25)} | Epic 월 ${f2(tm.epic)}번(약 1) ${chk(tm.epic >= 0.8 && tm.epic <= 1.25)} | Mystic ${f1(tm.mysticEvery)}달에 1번(3~5) ${chk(tm.mysticEvery >= 3 && tm.mysticEvery <= 5)}`)
  console.log(`-- ⑧ [실측 · 시뮬레이션] 등급별 월 아이템 배지(첫 12달 평균) | 월 총량 | Rare 주당 | Epic 월 | Mystic 월(몇 달에 1번) | 출처 비중 동기화/${sc.mode === 'chapter' ? '챕터 오름 보상' : '캡슐'} | 동기화 월 R/E/M | ${sc.mode === 'chapter' ? '챕터 오름 보상' : '캡슐'} 월 R/E/M`)
  for (const pn of Object.keys(PERSONAS)) {
    const r = out[sc.id][pn]
    const t = tierPerMonth(r)
    const sy = r.tierSync12.slice(1).map((x) => f2(x / mo12)).join('/')
    const cp = r.tierCap12.slice(1).map((x) => f2(x / mo12)).join('/')
    const tot = sumArr(r.tier12)
    console.log(' ', pn.padEnd(10), '|', f1(tot / mo12), '|', f2(t.rareWk), '|', f2(t.epic), '|', `${f2(t.mystic)}(${Number.isFinite(t.mysticEvery) ? f1(t.mysticEvery) : '-'}달에 1번)`, '|', `${Math.round((sumArr(r.tierSync12) / tot) * 100)}/${Math.round((sumArr(r.tierCap12) / tot) * 100)}%`, '|', sy, '|', cp)
  }
  // ⑨ 동기화 막힘(챕터 모드만)
  if (sc.mode === 'chapter') {
    console.log(`-- ⑨ [실측 · 시뮬레이션] 동기화 막힘(첫 12달 기준 / 전체 기간), BLOCK_SYNC=${BLOCK_SYNC ? 1 : 0} | 막힌 주% 12달/전체 | 막힘 시작 횟수(12달) | 평균 막힘 길이(주) 12달/전체 | 최장 막힘(주) 평균/최대 | 미뤄진 활동 최대 개수 평균/최대 | 서비스 활동 잼 손실률%`)
    for (const pn of Object.keys(PERSONAS)) {
      const r = out[sc.id][pn]
      console.log(' ', pn.padEnd(10), '|', `${(r.blockPct12 * 100).toFixed(1)}%/${(r.blockPct * 100).toFixed(1)}%`, '|', f1(r.blockStarts12), '|', `${f1(r.blockLen12)}/${f1(r.blockLen)}`, '|', `${f1(r.blockMaxAvg)}/${r.blockMax}`, '|', `${f1(r.deferredAvg)}/${r.deferredMax}`, '|', Number.isFinite(r.svcLostPct) ? `${(r.svcLostPct * 100).toFixed(1)}%` : '-')
    }
  }
}

// ⑧ 안 비교: 러닝 보통(기준 유저)에서 현행(캡슐)과 챕터 오름 후보를 한 표로, 같은 시드 짝 비교
console.log('\n######## ⑧ 안 비교 · 러닝 보통(기준 유저) [실측 · 같은 시드 짝 비교]')
console.log('안'.padEnd(20), '| 모드 | 챕터5 | 챕터10 | 월 배지 | Rare 주당 | Epic 월 | Mystic 월(몇 달에 1번) | 보상 출처 비중 | 보상 대기 주% | 거의 가득 참 주%')
for (const sc of SCENARIOS) {
  const r = out[sc.id]['러닝 보통']
  const t = tierPerMonth(r)
  const tot = sumArr(r.tier12)
  console.log(sc.id.padEnd(20), '|', sc.mode, '|', r.reach[1], '|', r.reach[2], '|', f1(tot / mo12), '|', f2(t.rareWk), '|', f2(t.epic), '|', `${f2(t.mystic)}(${Number.isFinite(t.mysticEvery) ? f1(t.mysticEvery) : '-'}달)`, '|', `${Math.round((sumArr(r.tierCap12) / tot) * 100)}%`, '|', `${(r.hold * 100).toFixed(1)}%`, '|', `${(r.near * 100).toFixed(1)}%`)
}
// 상위 티켓 성공 기준 5: 기준 유저 챕터 10 도달 시점이 «현행 설정의 시뮬레이터 결과» 대비 ±10% 이내인가.
// «현행 설정»이 어느 안인지 상위 티켓에 한 줄로 정해져 있지 않아, 현행양(현행 양 90~220 + 역산 횟수)과 목표역산안(캡슐 있는 목표 역산 설정) 둘을 기준으로 함께 보인다
const baseIds = ['현행양', '목표역산안'].filter((id) => out[id])
if (baseIds.length) {
  console.log(`\n-- 성공 기준 5: 챕터 10 도달 중앙값(달)이 현행 기준(${baseIds.join(', ')}) 대비 ±10% 이내인가 [실측 · 같은 시드 짝 비교]`)
  for (const sc of SCENARIOS.filter((x) => x.mode === 'chapter')) {
    for (const pn of Object.keys(PERSONAS)) {
      const x10 = out[sc.id][pn].med10
      const cols = baseIds.map((id) => {
        const base10 = out[id][pn].med10
        if (!Number.isFinite(base10) || !Number.isFinite(x10)) return `${id} 비교 불가(${Number.isFinite(x10) ? f1(x10) + '달' : '24달 넘음'} / ${Number.isFinite(base10) ? f1(base10) + '달' : '24달 넘음'})`
        const ratio = x10 / base10
        return `${id} ${f1(base10)}달 → ${ratio.toFixed(2)}배 ${Math.abs(ratio - 1) <= 0.1 ? '±10% 안' : '±10% 밖'}`
      })
      console.log(' ', sc.id.padEnd(12), pn.padEnd(10), '|', Number.isFinite(x10) ? `${f1(x10)}달` : '24달 넘음', '|', cols.join(' | '))
    }
  }
}

// ⑥ 서비스 활동 잼 상한 있음/없음 짝 비교(같은 시드)
console.log('\n######## ⑥ 서비스 활동 잼 상한 있음/없음 [실측 · 같은 시드 짝 비교]')
for (const sc of SCENARIOS) {
  const base = sc.id.replace('-상한없음', '')
  if (!sc.id.endsWith('-상한없음') || !out[base]) continue
  console.log('퍼소나'.padEnd(10), '| 서비스 잼 주당(상한 있음→없음, 상한 없을 때 발생분) | 챕터5 중앙값 | 챕터10 중앙값 | 주 합산 잼 90% 분위')
  for (const pn of Object.keys(PERSONAS)) {
    const x = out[base][pn]
    const y = out[sc.id][pn]
    const m10 = (r) => (Number.isFinite(r.med10) ? f1(r.med10) : '24달 넘음')
    console.log(pn.padEnd(10), '|', `${f1(x.svcGot)} → ${f1(y.svcGot)} (발생 ${f1(y.svcRaw)})`, '|', `${f1(x.med5)} → ${f1(y.med5)}달`, '|', `${m10(x)} → ${m10(y)}달`, '|', `${Math.round(quant(x.tot, 0.9))} → ${Math.round(quant(y.tot, 0.9))}`)
  }
}

// ⑦ 잼 조건 배지·미션 영향: 활동 잼만 셀 때와 활동 + 서비스 잼을 합산할 때(D7)
console.log('\n######## ⑦ 잼 조건 배지·미션 영향 [실측: 분포·도달 시점 / 후보: 상향 기준값은 계산값]')
for (const sc of SCENARIOS.filter((s) => s.id.endsWith('목표역산안') || s.id === '목표역산안-상한없음')) {
  console.log(`\n안 ${sc.id}: 퍼소나 | 주 합산 잼 10/50/90% 활동만 → 합산 | 기준값 ${WEEK_THRESH.join('/')} 넘는 주 비율(활동만→합산) | 같은 난이도 상향 기준값 후보`)
  for (const pn of Object.keys(PERSONAS)) {
    const r = out[sc.id][pn]
    const q = (a) => [0.1, 0.5, 0.9].map((f) => Math.round(quant(a, f))).join('/')
    const share = (a, x) => a.filter((v) => v >= x).length / a.length
    const cand = WEEK_THRESH.map((x) => {
      const s = share(r.act, x)
      return s <= 0 || s >= 1 ? '-' : String(Math.round(quant(r.tot, 1 - s) / 10) * 10)
    })
    console.log(' ', pn.padEnd(10), '|', `${q(r.act)} → ${q(r.tot)}`, '|', WEEK_THRESH.map((x) => `${Math.round(share(r.act, x) * 100)}→${Math.round(share(r.tot, x) * 100)}%`).join(' '), '|', cand.join('/'))
  }
  console.log(`  누적 잼 이정표 ${CUM_THRESH.join('/')} 도달 중앙값(달, 활동만 → 합산)과 같은 속도 상향 후보(배율 = 합산 평균 ÷ 활동 평균)`)
  for (const pn of Object.keys(PERSONAS)) {
    const r = out[sc.id][pn]
    const ratio = r.meanT / r.meanA
    console.log(' ', pn.padEnd(10), '|', CUM_THRESH.map((t, i) => `${fmtM(r.cumA[i] * WPM)}→${fmtM(r.cumT[i] * WPM)}`).join(' '), '|', `배율 ${ratio.toFixed(2)} → 후보 ${CUM_THRESH.map((t) => Math.round((t * ratio) / 100) * 100).join('/')}`)
  }
}
if (process.env.SIM_JSON) {
  const slim = JSON.parse(JSON.stringify(out, (k, v) => (k === 'act' || k === 'tot' ? undefined : v === Infinity ? 'Infinity' : v)))
  ;(await import('node:fs')).writeFileSync(process.env.SIM_JSON, JSON.stringify({ N, MONTHS, SLOTS, ...slim }, null, 1))
}
