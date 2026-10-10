// issue-filter-check.mjs 테스트 (티켓 20260923_2255)
//
// scripts/verify.sh의 scripts-test 단계가 이 파일을 돌린다. 직접 실행도 된다.
// 실행: node scripts/issue-filter-check.test.mjs
//
// 시험 소재 12건: PRD(`docs/service/prd/content-automation/PRD.md`) §7.3 자동 제외 범주 8종
// 1건씩(뉴스 소스) + 통과 3건(뉴스 소스) + 사람 스크리닝 필요 1건(밈 소스).
// 사유 문구는 PRD §7.3 표에서 그대로 옮겨 적어 스크립트 상수와 독립적으로 대조한다.

import assert from 'node:assert/strict'
import {
  CARD_TABLE_HEADER,
  judgeCard,
  applyJudgments,
  summarizeJudgments,
  formatExcludedSection,
  formatMarkdownTable,
  parseMarkdownCards,
  parseJsonCards,
  isNewsSource,
} from './issue-filter-check.mjs'

const NEWS = '빅카인즈 뉴스 이슈 키워드'
const MEME = '틱톡 크리에이티브 센터'

function card(title, category, source) {
  return {
    title,
    category,
    source,
    observedAt: '2026-09-23',
    validPeriod: '2026-10',
    region: '',
    tribeCandidates: '',
    usagePath: '홈피드',
    verdict: '',
    reason: '',
    status: '신규',
    lifespan: '',
  }
}

// PRD §7.3 사유 문구를 그대로 옮겨 적었다 (스크립트 상수를 그대로 참조하지 않고 독립 대조).
const EXCLUSION_FIXTURES = [
  { c: card('국회 정책 논쟁으로 시끄러운 여야 공방', '사회 이슈', NEWS), reason: '정치적 논쟁 소재로 자동 제외' },
  { c: card('강원 산불로 대피령, 계곡 인근 통제', '재난', NEWS), reason: '재난·사고 소재로 자동 제외' },
  { c: card('온라인 사기 피해 급증, 신고 잇따라', '사건', NEWS), reason: '범죄·사건 소재로 자동 제외' },
  { c: card('지역 비하 발언 논란, 차별 조롱 밈 확산', '밈', NEWS), reason: '혐오·비하 표현 소재로 자동 제외' },
  { c: card('가수 A 콘서트 패러디 밈 — 실존 인물 언급 포함', '밈', NEWS), reason: '실존 인물 언급으로 자동 제외' },
  { c: card('인기 애니 캐릭터 인용 밈 유행', '밈', NEWS), reason: '저작권 소재 직접 인용으로 자동 제외' },
  { c: card('노키즈존 두고 갑론을박 논쟁 재점화', '사회 이슈', NEWS), reason: '사회 갈등 논쟁 소재로 자동 제외' },
  { c: card('다이어트 조언 순위 밈 유행', '밈', NEWS), reason: '세계관 미배정 소재로 제외(윈터)' },
]

const PASS_FIXTURES = [
  card('가을 단풍 트레킹 코스 화제', '계절', NEWS),
  card('지역 축제 방문객 급증', '지역 축제', NEWS),
  card('수집형 굿즈 오픈런 문화 확산', '수집 문화', NEWS),
]

const SCREENING_FIXTURE = card('카페 인생샷 챌린지 밈 유행', '밈', MEME)

const ALL_TWELVE = [...EXCLUSION_FIXTURES.map((f) => f.c), ...PASS_FIXTURES, SCREENING_FIXTURE]
assert.equal(ALL_TWELVE.length, 12, '시험 소재는 12건이어야 한다')

function testIsNewsSource() {
  assert.equal(isNewsSource(NEWS), true)
  assert.equal(isNewsSource(MEME), false)
  assert.equal(isNewsSource(''), false)
}

function testExclusionCategoriesJudgedCorrectly() {
  for (const { c, reason } of EXCLUSION_FIXTURES) {
    const result = judgeCard(c)
    assert.equal(result.verdict, '제외', `"${c.title}"은 제외로 판정되어야 한다`)
    assert.equal(result.reason, reason, `"${c.title}"의 제외 사유가 PRD §7.3과 글자 단위로 같아야 한다`)
  }
}

function testPassFixturesJudgedCorrectly() {
  for (const c of PASS_FIXTURES) {
    const result = judgeCard(c)
    assert.equal(result.verdict, '통과', `"${c.title}"은 통과로 판정되어야 한다`)
    assert.equal(result.reason, '')
  }
}

function testMemeSourceAlwaysNeedsScreening() {
  const result = judgeCard(SCREENING_FIXTURE)
  assert.equal(result.verdict, '사람 스크리닝 필요')
  assert.equal(result.reason, '')
}

function testMemeSourceNotAutoExcludedEvenWithBannedKeyword() {
  // 밈 소스는 메타데이터가 없어 전량 사람이 본다(PRD §7.3) — 금지어가 있어도 스크립트가 자동
  // 제외하지 않고 사람 스크리닝 필요로만 남긴다.
  const c = card('정치 풍자 밈 유행', '밈', MEME)
  const result = judgeCard(c)
  assert.equal(result.verdict, '사람 스크리닝 필요')
}

function testSummarizeJudgments() {
  const judged = applyJudgments(ALL_TWELVE)
  const summary = summarizeJudgments(judged)
  assert.equal(summary.total, 12)
  assert.equal(summary.pass, 3)
  assert.equal(summary.excluded, 8)
  assert.equal(summary.screening, 1)
  assert.equal(Object.keys(summary.byCategory).length, 8, '제외 범주 8종이 각 1건씩 집계되어야 한다')
  for (const count of Object.values(summary.byCategory)) {
    assert.equal(count, 1)
  }
}

function testFormatExcludedSectionListsAllEightWithReasons() {
  const judged = applyJudgments(ALL_TWELVE)
  const out = formatExcludedSection(judged)
  assert.match(out, /^## 제외된 소재/)
  assert.match(out, /제외 8건 \/ 전체 12건 \(사람 스크리닝 필요 1건\)/)
  for (const { reason } of EXCLUSION_FIXTURES) {
    assert.ok(out.includes(reason), `제외 사유 "${reason}"가 절에 남아야 한다`)
  }
  for (const { c } of EXCLUSION_FIXTURES) {
    assert.ok(out.includes(c.title), `제외된 소재 제목 "${c.title}"이 절에 남아야 한다`)
  }
}

function testMarkdownRoundTrip() {
  const table = formatMarkdownTable(ALL_TWELVE)
  const text = `# 시험 파일\n\n## 소재 카드\n\n${table}\n`
  const parsed = parseMarkdownCards(text)
  assert.equal(parsed.length, 12)
  assert.equal(parsed[0].title, ALL_TWELVE[0].title)

  const judged = applyJudgments(parsed)
  const summary = summarizeJudgments(judged)
  assert.equal(summary.excluded, 8)
  assert.equal(summary.pass, 3)
  assert.equal(summary.screening, 1)
}

function testParseMarkdownCardsReturnsNullWhenHeaderMissing() {
  const text = '# 다른 문서\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'
  assert.equal(parseMarkdownCards(text), null)
}

function testParseMarkdownCardsSkipsEmptyPlaceholderRow() {
  const text = `${CARD_TABLE_HEADER}\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| (아직 없음) | | | | | | | | | | | |\n`
  const parsed = parseMarkdownCards(text)
  assert.deepEqual(parsed, [])
}

function testParseJsonCards() {
  const json = JSON.stringify([{ title: '테스트', category: '밈', source: MEME }])
  const parsed = parseJsonCards(json)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].title, '테스트')
  assert.equal(parsed[0].verdict, '')
}

function main() {
  testIsNewsSource()
  testExclusionCategoriesJudgedCorrectly()
  testPassFixturesJudgedCorrectly()
  testMemeSourceAlwaysNeedsScreening()
  testMemeSourceNotAutoExcludedEvenWithBannedKeyword()
  testSummarizeJudgments()
  testFormatExcludedSectionListsAllEightWithReasons()
  testMarkdownRoundTrip()
  testParseMarkdownCardsReturnsNullWhenHeaderMissing()
  testParseMarkdownCardsSkipsEmptyPlaceholderRow()
  testParseJsonCards()
  console.log('issue-filter-check.test.mjs 통과')
}

main()
