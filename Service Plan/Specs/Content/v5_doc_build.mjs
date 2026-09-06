import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const R = path.dirname(fileURLToPath(import.meta.url)) + path.sep
const map = JSON.parse(fs.readFileSync(R + 'v5_condition_mapping.json', 'utf8'))
const writ = JSON.parse(fs.readFileSync(R + 'v5_catalog_writing.json', 'utf8'))
const miss = JSON.parse(fs.readFileSync(R + 'v5_mission_badges.json', 'utf8'))

const SPORT = { walking: '걷기', running: '러닝', cycling: '자전거', hiking: '등산', trail_running: '트레일러닝' }
const ORDER = ['walking', 'running', 'cycling', 'hiking', 'trail_running']
const KIND = { graded: '등급형', leveled: '레벨형', repeatable: '반복형', auto: '자동 상승형' }
const RK = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

// 설명문: 라이팅 정본 + 미션 정본을 (종목, 이름)으로 합친다
const desc = new Map()
for (const [sp, rows] of Object.entries(writ['계열'])) for (const r of rows) desc.set(sp + '|' + r['이름'], r['설명'])
for (const b of miss['배지']) desc.set(b.sport + '|' + b['이름'], b['설명'])

const L = []
const A = (s = '') => L.push(s)
const total = map['계열'].reduce((n, f) => n + f['종수'], 0)

A('# 액티비티 배지 카탈로그 v5')
A()
A('> **정본은 DB다.** 이 문서는 `Service Plan/Specs/Content/`의 산출물에서 생성했다 —')
A('> 손으로 고치지 말고 `v5_seed_build.py`가 만드는 데이터를 고친 뒤 다시 생성한다.')
A('> 생성 스크립트: `Service Plan/Specs/Content/v5_doc_build.mjs` (티켓 20260905_0035 C묶음)')
A('>')
A(`> **규모: ${map['계열'].length}계열 · ${total}종** — 2026-09-05 프로덕션 시딩 완료`)
A('>')
A('> v4(162종)는 전량 폐기했다(`deleted_at`). 이 문서가 v4 문서를 대체한다.')
A()
A('---')
A()
A('## 이 카탈로그를 읽는 법')
A()
A('| 개념 | 뜻 |')
A('|---|---|')
A('| **계열** | 같은 소재를 등급·레벨로 펼친 한 묶음. `family_key`(`{종목}:{코드}`)로 식별한다 |')
A('| **종** | 실제 `badges` 행 하나. 한 계열이 2~8종을 갖는다 |')
A('| **등급형** | `rarity`가 있고 `level`은 없다. Common→Mystic 사다리 |')
A('| **레벨형** | `rarity`가 **없고** `level`이 있다. 무한레벨·자동 상승형 |')
A('| **반복형** | `rarity` + `condition_json.repeat_count`. 같은 조건을 몇 번 달성했는가 |')
A('| **미션 보상** | `condition_json.mission_reward = true`. 동기화로는 **절대 발급되지 않는다** |')
A()
A('**배지 이름은 카탈로그 전역에서 유일하다.** 발급 엔진이 등급형을 이름으로 묶어 성장')
A('사다리를 만들기 때문이다(`badge-engine/index.ts` `badgesByName`). 같은 이름이 종목을 넘어')
A('겹치면 한 종목에서 올린 등급이 다른 종목의 하위 등급을 영구히 가린다 —')
A('그래서 v5는 종목마다 이름을 다르게 지었다(`v5_catalog_names.json`, 29건).')
A()
A('---')
A()
A('## 설계 원칙')
A()
A('| # | 원칙 | 내용 |')
A('|---|---|---|')
A('| 1 | **가입 시점부터 카운트** | 가입 이전 활동은 평가에 넣지 않는다. Strava `pr_count`를 쓰지 않는 이유이기도 하다 |')
A('| 2 | **조건 전면 공개** | 모든 조건을 미리 보여준다. 배지 외형만 획득 후 개봉한다 |')
A('| 3 | **강도 채점으로 등급 산정** | 행동 변경·소요 시간·실패 리스크·통제 불가 4축 채점. 첫 회는 4축, 반복 사다리는 3축 |')
A('| 4 | **2단 교차 게이트** | Epic은 축 내 교차, Mystic은 축 간 교차 **AND** 미션 보상 배지 |')
A('| 5 | **축은 종목을 넘지 않는다** | 러닝 Mystic을 위해 자전거를 타게 하지 않는다. 미션도 종목마다 따로 있다 |')
A('| 6 | **fail-closed** | 엔진이 평가할 수 없는 조건은 발급을 **막는다**. 조용히 통과시키지 않는다 |')
A('| 7 | **데이터가 없으면 계산하지 않는다** | 심박·파워·케이던스는 보너스 축이다. 없어도 모든 Mystic에 도달할 수 있다 |')
A()
A('---')
A()
A('## 종목별 규모')
A()
A('| 종목 | 계열 | 종 | 등급형 | 레벨형 | 반복형 | 미션 |')
A('|---|---:|---:|---:|---:|---:|---:|')
for (const sp of ORDER) {
  const fams = map['계열'].filter(f => f['종목'] === sp)
  const n = (k) => fams.filter(f => f['배지종류'] === k).reduce((a, f) => a + f['종수'], 0)
  const mi = fams.filter(f => f['축'] === '미션').reduce((a, f) => a + f['종수'], 0)
  A(`| ${SPORT[sp]} | ${fams.length} | ${fams.reduce((a, f) => a + f['종수'], 0)} | ${n('graded') - mi} | ${n('leveled') + n('auto')} | ${n('repeatable')} | ${mi} |`)
}
A(`| **합계** | **${map['계열'].length}** | **${total}** | | | | **40** |`)
A()
A('---')
A()
A('## 전체 배지 목록')
A()
for (const sp of ORDER) {
  const fams = map['계열'].filter(f => f['종목'] === sp)
  A(`### ${SPORT[sp]} (\`${sp}\`) — ${fams.length}계열 · ${fams.reduce((a, f) => a + f['종수'], 0)}종`)
  A()
  const axes = [...new Set(fams.map(f => f['축']))]
  for (const ax of axes) {
    A(`#### ${ax}`)
    A()
    A('| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |')
    A('|---|---|---|---|---|')
    for (const f of fams.filter(x => x['축'] === ax)) {
      // 사다리에서 **실제로 변하는** 키를 고른다. 고정된 키(weekly_count·season 등)를
      // 고르면 「Rare 3 · Epic 3」처럼 등급마다 같은 값이 찍힌다.
      const cands = Object.keys(f['사다리'][0].condition)
        .filter(k => !['activity_type', 'mission_reward'].includes(k))
        .filter(k => typeof f['사다리'][0].condition[k] !== 'object')
      const varying = cands.filter(k => new Set(f['사다리'].map(s => s.condition[k])).size > 1)
      const key = varying[0] ?? cands[0]
      const lad = f['사다리'].map(s => {
        const tag = s.rarity ? RK[s.rarity] : `Lv.${s.level}`
        const v = key !== undefined ? s.condition[key] : ''
        return v !== undefined && v !== '' ? `${tag} ${v}` : tag
      })
      const ladStr = lad.length > 4 ? `${lad[0]} … ${lad[lad.length - 1]} (${lad.length})` : lad.join(' · ')
      const notes = (f['표기'] || []).length ? ` <sup>${f['표기'].join('·')}</sup>` : ''
      const keyTag = key ? ` \`${key}\`` : ''
      A(`| \`${f.family_key}\` | **${f['이름']}**${notes} | ${f['조건문']} | ${KIND[f['배지종류']]} |${keyTag} ${ladStr} |`)
    }
    A()
    // 설명문
    A('<details><summary>설명문</summary>')
    A()
    for (const f of fams.filter(x => x['축'] === ax)) {
      const dsc = desc.get(sp + '|' + f['이름']) ?? desc.get(SPORT[sp] + '|' + f['이름']) ?? '—'
      A(`- **${f['이름']}** — ${dsc}`)
    }
    A()
    A('</details>')
    A()
  }
}
A('---')
A()
A('## 표기 뜻')
A()
A('| 표기 | 뜻 |')
A('|---|---|')
A('| `필터` | 필터 키(`time_range`·`month`·`day_of_week`·`season`)를 측정 축과 함께 쓴다. **진행률이 실제보다 후하게 나온다** — 진행 계산이 그 필터를 보지 않기 때문이다 |')
A('| `회차` | `repeat_count`를 쓰지만 회차 술어가 그 조합을 세지 못한다. **지금은 발급되지 않는다**(fail-closed) |')
A('| `근사` | 설계 조건문을 엔진이 표현할 수 있는 형태로 옮기며 의미가 약간 달라졌다. 사유는 `v5_condition_mapping.json` |')
A('| `pending` | 조건 필드가 아직 `evaluation: pending`이다. **지금은 발급되지 않는다**(fail-closed) |')
A()
A('---')
A()
A('## 시딩하지 않은 것')
A()
A('| 코드 | 계열 | 종 | 사유 |')
A('|---|---|---:|---|')
for (const x of map['시딩제외']) {
  const nm = x.code === 'R-S1' ? '후반의 사람' : ''
  A(`| \`${x.code}\` | ${nm} | ${x['종수']} | ${x['사유']} |`)
}
A()
A('합계 **5계열 27종 + `R-S1`**. 앞의 5건은 조건 키가 레지스트리에 없어 시딩 자체가 불가능하며,')
A('티켓 `20260906_0110`이 필드를 추가하면 복구한다.')
A()
A('⚠️ **걷기·러닝·등산의 누적 축이 3레인에서 2레인으로 줄어든 상태다.** A묶음이 세 수열의')
A('위상을 엇갈리게 배치한 설계가 절반만 살아 있다 — 필드 추가 후 위상 검사를 다시 돌려야 한다.')
A()
A('---')
A()
A('## 지금 발급되지 않는 것')
A()
A('**630종 중 엔진이 지금 평가할 수 있는 것은 약 269종이고, 그중 40종은 미션 전용이다.**')
A('나머지는 전부 fail-closed라 **잘못 발급되는 경로는 없지만**, 조건은 보이는데 열리지 않는다.')
A()
A('| 막힌 이유 | 종 | 계열 |')
A('|---|---:|---:|')
const tally = {}
for (const f of map['계열']) for (const t of (f['표기'] || [])) {
  if (t === '필터' || t === '근사') continue
  tally[t] = tally[t] || { 종: 0, 계열: 0 }
  tally[t].종 += f['종수']; tally[t].계열++
}
for (const [k, v] of Object.entries(tally)) A(`| \`${k}\` | ${v.종} | ${v.계열} |`)
A()
A('**2단 교차 게이트가 0행이다.** 설계의 `cross`/`cross2` 표시가 걷기 사다리에만 있고 4종목에는')
A('없어 지어내지 않았다. 지금 상태로 발급이 열리면 **모든 Mystic이 무관문으로 나간다.**')
A()
A('전부 티켓 `20260906_0110`「v5 카탈로그가 요구하는 엔진 확장 5건」에서 다룬다.')
A()
A('---')
A()
A('## 산출물 색인')
A()
A('`Service Plan/Specs/Content/` 아래 v5 산출물이 무엇이고 어느 것이 정본인지.')
A()
A('| 파일 | 역할 | 정본? |')
A('|---|---|---|')
A('| `v5_catalog_design.json` | claude.ai 아티팩트 2개의 설계 데이터 추출본 | 원본 (수정 금지) |')
A('| `v5_catalog_verified.json` | A묶음 검증 — 계열/종 수 확정 · 위상 조정 2건 · 겹침 전수 대조 | 검증 결과 |')
A('| `v5_catalog_names.json` | 이름 종목별 분화 매핑 29건 | **정본** |')
A('| `v5_catalog_writing.json` | 168계열의 이름·설명·조건문 | **정본** |')
A('| `v5_mission_axis_groups.json` | 게이트 미션 축 묶음 32개 | 확정본 |')
A('| `v5_mission_badges.json` | 미션 보상 배지 32종 (4종목) | **정본** |')
A('| `v5_condition_mapping.json` | 조건문 → `condition_json` 매핑 194계열 | **정본** |')
A('| `seed_v5_activity_badges.rows.json` | 시딩한 630행 (SQL과 같은 데이터) | 생성물 |')
A('| `v5_catalog_verify.py` · `v5_mission_badges_verify.py` · `v5_seed_build.py` | 재현 가능한 검증·생성 스크립트 | — |')
A('| `v5_badge_name_split.md` | 이름 분화 근거와 설명문 재작성 11건 | 기록 |')
A()
A('시드 SQL은 `jam-web/supabase/migrations/seed_v5_activity_badges.sql`이다.')
A()
A('---')
A()
A('## 조건문 ≠ 화면 표기')
A()
A('**이 문서의 조건문은 DB에 저장되지 않는다.** 화면은 `condition_json` + `badge_metric_labels`')
A('조합으로 조건을 렌더한다. 따라서 「한 주(월~일)에 3회」 같은 표기 규칙의 실질 준수 지점은')
A('시드가 아니라 `badge_metric_labels`의 라벨 문구다(마이그레이션 131이 그 규칙으로 채웠다).')
A()
A('조건문 표기 규칙(요소 순서 ①기간 ②맥락 ③지표 / ④횟수 · 「이상·이하」만 사용 ·')
A('「주」에 `(월~일)` · 페이스는 부등호 없이 「보다 빠르게」)은 `v5_catalog_writing.json`의')
A('`_meta.조건문_표기_규칙`에 있다.')
A()
A('---')
A()
A('## 관련 파일')
A()
A('- 엔진 로직 — `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`')
A('- 조건 필드 스펙 — `Specs/BadgeEngine/CONDITION_JSON_SPEC.md`')
A('- 조건 필드 단일 출처 — `jam-web/src/lib/badge-engine/conditionRegistry.ts`')
A('- 설계·시딩 티켓 — `Tickets/20260905_0035_Content_액티비티배지-v5-카탈로그-5종목.md`')
A('- 엔진 확장 — `Tickets/20260906_0110_BadgeEngine_v5-카탈로그가-요구하는-엔진-확장-5건.md`')
A('- 마스터 — `Tickets/20260905_0026_*`')

fs.writeFileSync(R + 'ACTIVITY_BADGES.md', L.join('\n') + '\n')
console.log('생성:', L.length, '줄 ·', map['계열'].length, '계열 ·', total, '종')
