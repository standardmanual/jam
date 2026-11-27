// 컬렉션 첫 완성 시간 모의 실험 (티켓 20261023_1308)
//
// 퍼소나마다 아이템 배지가 들어오는 길(동기화, 챕터 오름 보상, 잠긴 아이템 배지 열기. 현행 기준선은 챕터 오름 보상 대신 캡슐)을 주 단위로 흉내 내고, «내 트라이브의 컬렉션 하나를 한 등급으로
// 처음 완성하는 시간»(Common, Rare, Epic, Mystic 각각)을 잰다. 반복마다 같은 들어옴을 모든 규칙이 함께 써서(짝 비교) 규칙 사이 차이만 드러나게 한다.
//
// 등급 올리기 규칙(rule)
//   none: 등급 올리기 없음
//   old : 같은 트라이브 5개를 내면 «고른 컬렉션, 고른 이름»의 바로 위 등급 1개(7-7 이전의 레시피 설계)
//   new : 7-7a 규칙. 같은 등급 5개를 내면 결과 등급은 캡슐 등급 확률을 재료 등급 이상으로 잘라 합 100%로 맞춘 확률이고, 아이템은 열린 컬렉션 전체에서
//         균등이며, 트라이브는 캡슐 굴림을 따른다(내 트라이브 80%)
//   new의 변형(opts): mats(재료 수), ownOnly(결과를 늘 내 트라이브로), pick(결과 컬렉션을 내가 고르고 이름만 무작위), sure(바로 위 등급 확정),
//         upP(바로 위 등급이 나올 확률, 아니면 같은 등급), order(재료로 쓰는 등급 순서)
// 재료 정책(policy): short(쓰지 않는 것은 전부 재료), long(겹친 것만 재료)
//
// 검증: 밸런스 문서 「19 게이미피케이션 밸런스」 5절의 첫 완성 시간 표는 «컬렉션을 고르고 이름만 무작위, 등급 확정»(변형 sure+pick+ownOnly)과 비슷하게 나온다
//       (러닝 보통 Rare 4.4달, Epic 12달, Mystic 43달, 문서는 3달, 12달, 20~58달).
// 값: 공용 DB(2026-10-23 읽음)와 밸런스 문서 2~5절. 한계: 시스템 드랍, 다른 유저의 드랍과 픽업, 미션 보상, 단서 레시피, 인벤토리 칸 수는 넣지 않았다.
// 들어오는 길 모델(model, 티켓 20261127_1723): capsule = 현행(잼의 3분의 2로 캡슐), 챕터오름-A~E = 캡슐 없음 + 챕터가 오를 때 아이템 배지 보상(후보 값은
//   chapter-capsule-sim.mjs의 REWARD_MODELS와 같다). 챕터 모델은 주당 진행값(활동 잼 + 서비스 활동 잼 어림)이 CHAPTER_NEED에 닿으면 챕터가 오르고 보상을 낸다.
//   잠긴 아이템 배지 열기는 두 모델 모두 «잼의 3분의 1»로 같게 둔다(포인트 모델은 chapter-capsule-sim.mjs가 맡는다는 한계). 보상의 아이템 배지도 잠금 비율
//   JAM.locked를 그대로 쓰고(Q-i 미정), 챕터 오름 보상의 트라이브는 캡슐과 같은 규칙(내 트라이브 80%)을 쓴다(// 추정). 인벤토리 칸 수는 넣지 않았다.
// 사용법: node scripts/balance-sim/collection-sim.mjs [반복 횟수=400] [규칙 id 쉼표 목록=대표 규칙 3개, '전체'면 전부] [모델 id 쉼표 목록=전체]
//   (환경변수 SIM_JSON=결과를 저장할 경로)   모델 id: capsule, 챕터오름-A, 챕터오름-B, 챕터오름-C, 챕터오름-D, 챕터오름-E
const N = Number(process.argv[2] ?? 400)
const WPM = 365.25 / 12 / 7 // 한 달의 주 수
const MONTHS = 60
const MAXW = Math.ceil(MONTHS * WPM)

// ── 설정(공용 DB 값)
const CAPSULE = { bonusProb: 0.2, otherTribe: 0.2, rarity: [70, 22, 6, 2], pity: 15 }
const MIX_RARITY = [70, 22, 6, 2] // 믹스(등급 올리기) 결과 등급 확률. 값은 캡슐 등급 확률과 같고, 캡슐 모델이 아니어도 믹스는 이 값을 쓴다
const CHAPTER_NEED = [870, 1120, 1260, 1600, 1980, 2205, 2700, 3300, 3960] // 챕터 1~9의 필요 잼(상위 티켓 20261127_1720)
const SERVICE_WEEKLY = Math.min(100, 2 * 5 + 2 * 5 + 0.1 * 30 + 0.5 * 5 + 0.4 * 20) // 추정: chapter-capsule-sim.mjs의 serviceWeeklyEstimate와 같은 값(잠긴 배지 열기 주 2개 + 배지 받기 + 컬렉션 + 믹스 + 미션), 주 상한 100
const CNT_UP = (c) => (c <= 3 ? 2 : c <= 6 ? 3 : 4) // 마친 챕터 번호 기준 보상 개수(// 추정)
const CNT_UP_PLUS = (c) => (c <= 3 ? 3 : c <= 6 ? 4 : 5)
// 챕터 오름 보상 후보(chapter-capsule-sim.mjs의 REWARD_MODELS와 같은 값, 서비스 확정값이 아니라 시뮬레이션 입력이다)
const REWARD_MODELS = {
  '챕터오름-A': { count: () => 1, rarity: [70, 22, 6, 2], pity: CAPSULE.pity },
  '챕터오름-B': { count: CNT_UP, rarity: [70, 22, 6, 2], pity: CAPSULE.pity },
  '챕터오름-C': { count: CNT_UP, rarity: [40, 35, 18, 7], pity: CAPSULE.pity },
  '챕터오름-D': { count: CNT_UP, rarity: [20, 45, 25, 10], pity: CAPSULE.pity },
  '챕터오름-E': { count: CNT_UP_PLUS, rarity: [30, 40, 22, 8], pity: CAPSULE.pity }
}
const MODEL_IDS = ['capsule', ...Object.keys(REWARD_MODELS)]
const JAM = { bonusRolls: 2, divisor: 600, maxProb: 0.25, syncRarity: [84, 13, 2.5, 0.5], streak: 10, locked: 0.25, lockedMin: [30, 60, 120, 240] }
const CH_TH = [1000, 2300, 3800, 5700, 8500, 11500, 15000, 19000, 23000]
const CH_COST = [90, 100, 110, 120, 135, 150, 165, 180, 200, 220]
const COLLECTIONS = { start: 3, max: 10, everyMonths: 3, names: 9 }

const PERSONAS = {
  '러닝 보통': { actsPerWeek: 3, jamPerAct: 111, guaranteed: 1, weeklyJam: 333, chapterScore: 1835 },
  '걷기 보통': { actsPerWeek: 3, jamPerAct: 60, guaranteed: 1, weeklyJam: 180, chapterScore: 1042 },
  '등산 보통': { actsPerWeek: 4 / WPM, jamPerAct: 300, guaranteed: 2, weeklyJam: 277, chapterScore: 883 },
  '자전거 열심': { actsPerWeek: 3, jamPerAct: 320, guaranteed: 1, weeklyJam: 960, chapterScore: 3658 }
}
const TIER_NAMES = ['Common', 'Rare', 'Epic', 'Mystic']

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
  let s = 0
  for (const x of w) s += x
  let r = rand() * s
  for (let i = 0; i < w.length; i++) {
    r -= w[i]
    if (r < 0) return i
  }
  return w.length - 1
}

// ── 아이템 배지가 들어오는 길: 한 번 만들어 모든 규칙이 같이 쓴다(짝을 지어 비교한다)
// model: 'capsule'(현행, 잼의 3분의 2로 캡슐) 또는 REWARD_MODELS의 id(캡슐 없음 + 챕터 오름 보상)
function genRun(seed, p, model = 'capsule') {
  const reward = model === 'capsule' ? null : REWARD_MODELS[model]
  let chProg = 0 // 챕터 모델의 현재 챕터 진행값
  let chNow = 1 // 챕터 모델의 현재 챕터
  const rand = mulberry32(seed)
  const weeks = []
  let streak = 0
  let epicMiss = 0
  let capsuleCarry = 0
  let actCarry = 0
  let unlockPool = 0
  const queue = []
  let totalItems = 0
  for (let w = 0; w < MAXW; w++) {
    const tm = w / WPM
    const nOpen = Math.min(COLLECTIONS.max, COLLECTIONS.start + Math.floor(tm / COLLECTIONS.everyMonths))
    const score = p.chapterScore * tm
    let ch = 1
    if (!reward) for (const th of CH_TH) if (score >= th) ch++
    const avail = []
    const emit = (tribe, tier) => {
      totalItems++
      const item = [tribe, Math.floor(rand() * nOpen), Math.floor(rand() * COLLECTIONS.names), tier]
      if (rand() < JAM.locked) queue.push(item)
      else avail.push(item)
    }
    // 동기화
    actCarry += p.actsPerWeek
    while (actCarry >= 1) {
      actCarry -= 1
      let cnt = p.guaranteed
      const pb = Math.min(JAM.maxProb, p.jamPerAct / JAM.divisor)
      for (let k = 0; k < JAM.bonusRolls; k++) if (rand() < pb) cnt++
      for (let i = 0; i < cnt; i++) {
        const tier = streak >= JAM.streak ? 1 + weighted(rand, JAM.syncRarity.slice(1)) : weighted(rand, JAM.syncRarity)
        streak = tier === 0 ? streak + 1 : 0
        emit(0, tier)
      }
    }
    // 챕터 모델: 캡슐 없이 진행값이 필요 잼에 닿으면 챕터가 오르고(넘친 잼 이월, 한 번에 여러 챕터) 오를 때마다 보상을 낸다
    if (reward) {
      chProg += p.weeklyJam + SERVICE_WEEKLY
      while (chNow < 10 && chProg >= CHAPTER_NEED[chNow - 1]) {
        chProg -= CHAPTER_NEED[chNow - 1]
        const cnt = reward.count(chNow)
        chNow++
        let anyEpic = false
        for (let i = 0; i < cnt; i++) {
          const tribe = rand() < CAPSULE.otherTribe ? 1 + Math.floor(rand() * 4) : 0
          let tier
          if (i === 0 && epicMiss >= reward.pity) tier = 2 + weighted(rand, reward.rarity.slice(2))
          else if (streak >= JAM.streak) tier = 1 + weighted(rand, reward.rarity.slice(1))
          else tier = weighted(rand, reward.rarity)
          streak = tier === 0 ? streak + 1 : 0
          if (tier >= 2) anyEpic = true
          emit(tribe, tier)
        }
        epicMiss = anyEpic ? 0 : epicMiss + 1
      }
    }
    // 캡슐(잼의 3분의 2)
    if (!reward) capsuleCarry += (p.weeklyJam * (2 / 3)) / CH_COST[ch - 1]
    while (capsuleCarry >= 1) {
      capsuleCarry -= 1
      const cnt = 1 + (rand() < CAPSULE.bonusProb ? 1 : 0)
      let anyEpic = false
      for (let i = 0; i < cnt; i++) {
        const tribe = rand() < CAPSULE.otherTribe ? 1 + Math.floor(rand() * 4) : 0
        let tier
        if (i === 0 && epicMiss >= CAPSULE.pity) tier = 2 + weighted(rand, CAPSULE.rarity.slice(2))
        else if (streak >= JAM.streak) tier = 1 + weighted(rand, CAPSULE.rarity.slice(1))
        else tier = weighted(rand, CAPSULE.rarity)
        streak = tier === 0 ? streak + 1 : 0
        if (tier >= 2) anyEpic = true
        emit(tribe, tier)
      }
      epicMiss = anyEpic ? 0 : epicMiss + 1
    }
    // 잠긴 아이템 배지 열기(잼의 3분의 1, 먼저 들어온 것부터)
    unlockPool += p.weeklyJam / 3 // 챕터 모델도 같은 값으로 둔다(포인트 모델은 chapter-capsule-sim.mjs가 맡는다)
    while (queue.length && unlockPool >= JAM.lockedMin[queue[0][3]]) {
      unlockPool -= JAM.lockedMin[queue[0][3]]
      avail.push(queue.shift())
    }
    weeks.push({ nOpen, items: avail })
  }
  return { weeks, totalItems }
}

// ── 한 퍼소나가 목표 등급 T로 컬렉션 하나를 처음 완성하는 주(없으면 Infinity)
// rule: none | old | new, policy: short(쓸 수 없는 것은 전부 재료) | long(겹친 것만 재료)
function firstComplete(run, T, rule, policy, seed, opts = {}) {
  const mats = opts.mats ?? 5 // 등급 올리기 재료 수
  const ownOnly = opts.ownOnly ?? false // 결과를 늘 내 트라이브로
  const pick = opts.pick ?? false // 결과 컬렉션을 내가 고른다(이름만 무작위)
  const sure = opts.sure ?? false // 결과 등급을 바로 위 등급으로 확정한다
  const order = opts.order ?? 'low' // 재료로 쓰는 등급 순서: low(낮은 등급부터) | high(높은 등급부터)
  const upP = opts.upP ?? null // 바로 위 등급이 나올 확률(아니면 같은 등급). 정하면 캡슐 등급 확률 대신 쓴다
  const rand = mulberry32(seed)
  const placed = Array.from({ length: COLLECTIONS.max }, () => new Uint8Array(COLLECTIONS.names))
  const cnt = new Int8Array(COLLECTIONS.max)
  const own = [new Map(), new Map(), new Map(), new Map()]
  const other = [0, 0, 0, 0]
  const G = [0, 0, 0, 0]
  // T=0(Common)에서는 own[0]에 이미 «겹친 복사본»만 들어 있어 정책과 상관없이 전부 재료다
  const strictDups = policy === 'long' && T > 0
  let nOpen = COLLECTIONS.start

  const addOwn = (r, c, n) => {
    const k = c * COLLECTIONS.names + n
    own[r].set(k, (own[r].get(k) ?? 0) + 1)
  }
  const arrive = (tribe, c, n, tier) => {
    if (tier === T && tribe === 0) {
      if (!placed[c][n]) {
        placed[c][n] = 1
        cnt[c]++
        return cnt[c] === COLLECTIONS.names
      }
      if (T === 0 && rule === 'new') addOwn(0, c, n) // 겹친 Common은 다시 굴릴 재료다
      return false
    }
    if (tier < T) {
      if (tribe === 0) addOwn(tier, c, n)
      else if (rule === 'new') other[tier]++
      return false
    }
    if (tier === T && tribe !== 0 && T === 0 && rule === 'new') other[0]++
    return false
  }
  const spare = (r) => {
    let s = G[r] + other[r]
    for (const v of own[r].values()) s += strictDups ? Math.max(0, v - 1) : v
    return s
  }
  const consume = (r, k) => {
    const dupOnly = strictDups
    let need = k
    const takeFrom = (v) => {
      const t = Math.min(v, need)
      need -= t
      return t
    }
    let t = takeFrom(other[r])
    other[r] -= t
    t = takeFrom(G[r])
    G[r] -= t
    for (const [key, v] of own[r]) {
      if (need === 0) break
      if (v > 1) {
        const x = takeFrom(v - 1)
        own[r].set(key, v - x)
      }
    }
    if (!dupOnly) {
      for (const [key, v] of own[r]) {
        if (need === 0) break
        const x = takeFrom(v)
        if (v - x === 0) own[r].delete(key)
        else own[r].set(key, v - x)
      }
    }
  }
  const bestCollection = () => {
    let best = -1
    let bestCnt = -1
    for (let c = 0; c < nOpen; c++) {
      if (cnt[c] > bestCnt && cnt[c] < COLLECTIONS.names) {
        best = c
        bestCnt = cnt[c]
      }
    }
    return best
  }

  for (let w = 0; w < MAXW; w++) {
    nOpen = run.weeks[w].nOpen
    for (const [tribe, c, n, tier] of run.weeks[w].items) if (arrive(tribe, c, n, tier)) return w + 1
    if (rule === 'old' && T >= 1) {
      for (let r = 0; r < T; r++) {
        const packs = Math.floor(spare(r) / mats)
        if (packs === 0) continue
        consume(r, packs * mats)
        if (r + 1 < T) G[r + 1] += packs
        else {
          for (let i = 0; i < packs; i++) {
            const c = bestCollection()
            if (c < 0) break
            let n = 0
            while (placed[c][n]) n++
            placed[c][n] = 1
            cnt[c]++
            if (cnt[c] === COLLECTIONS.names) return w + 1
          }
        }
      }
    } else if (rule === 'new') {
      const maxR = T === 0 ? 0 : T - 1
      for (let guard = 0; guard < 10000; guard++) {
        let r = -1
        for (let k2 = 0; k2 <= maxR; k2++) {
          const q = order === 'high' ? maxR - k2 : k2
          if (spare(q) >= mats) {
            r = q
            break
          }
        }
        if (r < 0) break
        consume(r, mats)
        const tier = sure ? r + 1 : upP !== null ? r + (rand() < upP ? 1 : 0) : r + weighted(rand, MIX_RARITY.slice(r))
        const tribe = ownOnly ? 0 : rand() < CAPSULE.otherTribe ? 1 + Math.floor(rand() * 4) : 0
        let c = Math.floor(rand() * nOpen)
        if (pick && tribe === 0) {
          const b = bestCollection()
          if (b >= 0) c = b
        }
        const n = Math.floor(rand() * COLLECTIONS.names)
        if (arrive(tribe, c, n, tier)) return w + 1
      }
    }
  }
  return Infinity
}

// ── 실행
const CASES = [
  { id: '없음', rule: 'none', policy: 'short' },
  { id: '레시피(옛)·전부 재료', rule: 'old', policy: 'short' },
  { id: '레시피(옛)·겹친 것만', rule: 'old', policy: 'long' },
  { id: '지금 규칙·전부 재료', rule: 'new', policy: 'short' },
  { id: '지금 규칙·겹친 것만', rule: 'new', policy: 'long' },
  { id: '조정1 내 트라이브로만', rule: 'new', policy: 'short', opts: { ownOnly: true } },
  { id: '조정2 컬렉션 고름+내 트라이브', rule: 'new', policy: 'short', opts: { ownOnly: true, pick: true } },
  { id: '조정3 조정2+등급 확정', rule: 'new', policy: 'short', opts: { ownOnly: true, pick: true, sure: true } },
  { id: '조정6 조정2+윗등급 50%', rule: 'new', policy: 'short', opts: { ownOnly: true, pick: true, upP: 0.5 } },
  { id: '조정7 조정2+윗등급 70%', rule: 'new', policy: 'short', opts: { ownOnly: true, pick: true, upP: 0.7 } },
  { id: '지금 규칙·높은 등급 재료부터', rule: 'new', policy: 'short', opts: { order: 'high' } },
  { id: '조정8 등급 확정만(컬렉션은 무작위)', rule: 'new', policy: 'short', opts: { sure: true } },
  { id: '조정9 등급 확정+내 트라이브만', rule: 'new', policy: 'short', opts: { sure: true, ownOnly: true } },
  { id: '조정10 윗등급 70%+내 트라이브만', rule: 'new', policy: 'short', opts: { upP: 0.7, ownOnly: true } },
  { id: '조정4 지금 규칙+재료 3개', rule: 'new', policy: 'short', opts: { mats: 3 } },
  { id: '조정5 조정2+재료 3개', rule: 'new', policy: 'short', opts: { ownOnly: true, pick: true, mats: 3 } }
]
// 기본으로 돌리는 대표 규칙: 등급 올리기 없음(아래쪽 기준), 지금 규칙, 조정3(밸런스 문서 5절과 비슷하게 나오는 변형). '전체'를 주면 CASES 전부
const DEFAULT_CASE_IDS = ['없음', '지금 규칙·전부 재료', '조정3 조정2+등급 확정']
const onlyIds = process.argv[3] === '전체' ? null : process.argv[3] ? process.argv[3].split(',') : DEFAULT_CASE_IDS
const models = process.argv[4] ? process.argv[4].split(',') : MODEL_IDS
const results = {}
const incomeStats = {}
for (const [pname, p] of Object.entries(PERSONAS)) {
  results[pname] = {}
  incomeStats[pname] = {}
  for (const model of models) {
    results[pname][model] = {}
    const runs = []
    for (let i = 0; i < N; i++) runs.push(genRun(1000 + i, p, model))
    let tot = 0
    const tierSum = [0, 0, 0, 0]
    for (const r of runs) for (let w = 0; w < Math.floor(12 * WPM); w++) for (const it of r.weeks[w].items) { tot++; tierSum[it[3]]++ }
    incomeStats[pname][model] = { perMonth: +(tot / N / 12).toFixed(1), rarePerWeek: +(tierSum[1] / N / (12 * WPM)).toFixed(2), epicPerMonth: +(tierSum[2] / N / 12).toFixed(2), mysticPerMonth: +(tierSum[3] / N / 12).toFixed(3) }
    for (const cs of CASES) {
      if (onlyIds && !onlyIds.includes(cs.id)) continue
      results[pname][model][cs.id] = []
      for (let T = 0; T < 4; T++) {
        const times = []
        for (let i = 0; i < N; i++) times.push(firstComplete(runs[i], T, cs.rule, cs.policy, 777000 + i, cs.opts) / WPM)
        times.sort((a, b) => a - b)
        const q = (f) => times[Math.min(N - 1, Math.floor(N * f))]
        const within = (m) => times.filter((x) => x <= m).length / N
        results[pname][model][cs.id].push({ T, median: q(0.5), p25: q(0.25), p75: q(0.75), in12: within(12), in24: within(24), in60: within(60) })
      }
    }
  }
}

const fmt = (x) => (x === Infinity ? '5년 넘음' : x >= 24 ? `${x.toFixed(0)}달` : `${x.toFixed(1)}달`)
console.log(`반복 ${N}회, 최대 ${MONTHS}달, 모델: ${models.join(', ')}, 규칙: ${onlyIds ? onlyIds.join(', ') : '전체'}\n`)
console.log('들어오는 양(첫 12달 평균, 퍼소나 > 모델: 월 아이템 배지 / Rare 주당 / Epic 월 / Mystic 월):')
for (const [pname, byModel] of Object.entries(incomeStats)) {
  console.log(`  ${pname}`)
  for (const [model, st] of Object.entries(byModel)) console.log(`    ${model.padEnd(10)} ${st.perMonth} / ${st.rarePerWeek} / ${st.epicPerMonth} / ${st.mysticPerMonth}`)
}
console.log()
for (const [pname, byModel] of Object.entries(results)) {
  console.log(`## ${pname}  (중앙값 [25%~75%] / 12달 안 완성 비율)`)
  for (const [model, byCase] of Object.entries(byModel)) {
    for (const [id, arr] of Object.entries(byCase)) {
      console.log(`${model.padEnd(10)} ${id.padEnd(22)}`, arr.map((x) => `${TIER_NAMES[x.T]} ${fmt(x.median)} [${fmt(x.p25)}~${fmt(x.p75)}] ${Math.round(x.in12 * 100)}%`).join(' | '))
    }
  }
  console.log()
}
if (process.env.SIM_JSON) (await import('node:fs')).writeFileSync(process.env.SIM_JSON, JSON.stringify({ N, MONTHS, models, incomeStats, results }, null, 1))
