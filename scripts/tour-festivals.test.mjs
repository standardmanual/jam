// tour-festivals.mjs 테스트(티켓 20260924_0856). 실행: node scripts/tour-festivals.test.mjs
// 네트워크 없이 순수 함수 4개만 검증한다(다음 주 계산·기간 겹침 경계·서울 판정 두 방식·카드 변환).

import assert from 'node:assert/strict'
import { CARD_FIELDS } from './issue-filter-check.mjs'
import { nextWeekRangeKst, overlapsRange, isSeoul, toSourceCard } from './tour-festivals.mjs'

function testNextWeekRangeKst() {
  const NEXT_WEEK = { from: '20260928', to: '20261004' }
  // 목(2026-09-24)·월(2026-09-21, 이번 주 첫날)이어도 다음 주는 09-28~10-04(7일 이상 뒤)다.
  assert.deepEqual(nextWeekRangeKst(new Date('2026-09-24T12:00:00+09:00')), NEXT_WEEK)
  assert.deepEqual(nextWeekRangeKst(new Date('2026-09-21T00:00:00+09:00')), NEXT_WEEK)
  // KST 경계: 09-27 23:59(일, UTC 14:59)는 이번 주, 09-28 01:00(월, UTC 16:00)은 다음 주 첫날 —
  // 결과가 한 주 통째로 밀려야 로컬 TZ가 아니라 KST 기준 계산이다.
  assert.deepEqual(nextWeekRangeKst(new Date('2026-09-27T14:59:00Z')), NEXT_WEEK)
  assert.deepEqual(nextWeekRangeKst(new Date('2026-09-27T16:00:00Z')), { from: '20261005', to: '20261011' })
}

function testOverlapsRangeBoundaries() {
  const FROM = '20260928'; const TO = '20261004'
  const cases = [
    [{ eventstartdate: '20260928', eventenddate: '20261004' }, true, '정확히 일치'],
    [{ eventstartdate: '20260920', eventenddate: '20260928' }, true, 'from 경계 포함'],
    [{ eventstartdate: '20261004', eventenddate: '20261010' }, true, 'to 경계 포함'],
    [{ eventstartdate: '20260920', eventenddate: '20260927' }, false, 'from 하루 전 종료'],
    [{ eventstartdate: '20261005', eventenddate: '20261010' }, false, 'to 하루 뒤 시작'],
    [{ eventstartdate: '20260930' }, true, '종료일 없는 단일 행사'],
    [{}, false, '시작일 없음'],
  ]
  for (const [item, expected, msg] of cases) assert.equal(overlapsRange(item, FROM, TO), expected, msg)
}

function testIsSeoulTwoMethods() {
  assert.equal(isSeoul({ lDongRegnCd: '11', addr1: '경기도 수원시' }), true, '코드 우선')
  assert.equal(isSeoul({ lDongRegnCd: '26', addr1: '서울특별시 강동구' }), false, '코드가 있으면 addr1 무시')
  assert.equal(isSeoul({ addr1: '서울특별시 강동구 아리수로' }), true, '코드 없으면 addr1로 판정')
  assert.equal(isSeoul({ addr1: '경기도 수원시' }), false)
  assert.equal(isSeoul({ lDongRegnCd: '', addr1: '서울 강동구' }), true, '빈 문자열도 값 없음으로 본다')
}

function testToSourceCard() {
  const item = { title: '강동 선사문화축제', eventstartdate: '20260928', eventenddate: '20261004', addr1: '서울 강동구 아리수로 55', lDongRegnCd: '11' }
  const card = toSourceCard(item, '2026-09-24')
  assert.deepEqual(card, {
    title: '강동 선사문화축제', category: '지역 축제', source: 'TourAPI', observedAt: '2026-09-24',
    validPeriod: '2026-09-28~2026-10-04', region: '서울 강동구', tribeCandidates: '', usagePath: 'T05', verdict: '', reason: '', status: '후보', lifespan: '',
  })
  assert.deepEqual(Object.keys(card).sort(), [...CARD_FIELDS].sort(), 'CARD_FIELDS와 키가 같아야 한다')
}

function main() {
  testNextWeekRangeKst()
  testOverlapsRangeBoundaries()
  testIsSeoulTwoMethods()
  testToSourceCard()
  console.log('tour-festivals.test.mjs 통과')
}

main()
