/**
 * 잼 조건 지표가 «활동 정산 잼 + 서비스 활동 잼»을 합산해 읽는지 고정한다 (티켓 20261028_1736 1회, 결정 D7·B7)
 *
 * 원천 표는 둘이다: 활동 정산 잼 = `jam_wallets.total_earned`·`jam_daily_earned`(마이그레이션 220, 활동 정산만 늘린다),
 * 서비스 활동 잼 = `jam_service_daily`(마이그레이션 300·303, 날짜(KST)별 지급량 합). 서비스 활동 잼은 앞의 두 표를 늘리지 않으므로
 * 지표를 읽는 쪽이 더한다.
 *
 * ① `readJamTotalEarned` — 지갑 total_earned + 서비스 활동 합(활동 잼만 / 서비스 활동 잼만 / 둘 다)
 * ② `fetchDailyEarnedRows` — 같은 날짜가 두 표에 있으면 한 행으로 합치고, 날짜 오름차순
 * ③ 한 주 최고(`readJamWeeklyEarned`)·채운 주 횟수·연속 주 — 두 표가 함께 합산되고, 주 경계(일요일|월요일)는 그대로다
 * ④ 소멸은 세지 않는다 — 소멸(`capsule_forfeit`)은 원장에만 음수 줄로 남고 `jam_service_daily`를 줄이지 않으므로, 합산에 쓰는 표만 읽으면 소멸이 빠지지 않는다
 *    (원장을 읽는 `jam_period_earned` 쪽의 소멸 제외는 `jam-action-window-jam-metrics.test.ts`)
 * ⑤ 읽기 오류는 어느 표든 0으로 바꾸지 않고 던진다. 서비스 활동 일별 표는 페이지(1,000행)를 넘어도 끝까지 읽는다
 *
 * 모조 DB는 `eq`를 실제로 적용한다(`fakeSupabase.ts`). 공용 DB는 읽지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-service-jam-sum.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  countJamWeeks,
  fetchDailyEarnedRows,
  jamWeekStreak,
  readJamTotalEarned,
  readJamWeeklyEarned,
} from '../jamActionJamMetrics'
import { makeFakeDb, type FakeRow } from './fakeSupabase'

const U = 'user-1'
const OTHER = 'user-2'

const wallet = (totalEarned: number, userId = U): FakeRow => ({ user_id: userId, balance: 0, total_earned: totalEarned })
const settled = (earnedOn: string, amount: number, userId = U): FakeRow => ({ user_id: userId, earned_on: earnedOn, amount })
const serviceDay = (kstDate: string, amount: number, userId = U): FakeRow => ({ user_id: userId, kst_date: kstDate, amount })

describe('readJamTotalEarned — 지갑 total_earned + 서비스 활동 잼 합', () => {
  it('활동 잼만 있으면 지갑 값 그대로다', async () => {
    const { client } = makeFakeDb({ jam_wallets: [wallet(1500)] })
    expect(await readJamTotalEarned(client, U)).toBe(1500)
  })

  it('서비스 활동 잼만 있으면(지갑 행 없음) 일별 표 전체 합이다', async () => {
    const { client } = makeFakeDb({ jam_service_daily: [serviceDay('2026-10-12', 20), serviceDay('2026-10-13', 35)] })
    expect(await readJamTotalEarned(client, U)).toBe(55)
  })

  it('둘 다 있으면 더한다', async () => {
    const { client } = makeFakeDb({
      jam_wallets: [wallet(1000)],
      jam_service_daily: [serviceDay('2026-10-12', 20), serviceDay('2026-10-19', 40)],
    })
    expect(await readJamTotalEarned(client, U)).toBe(1060)
  })

  it('다른 유저의 지갑과 서비스 활동 잼은 세지 않는다', async () => {
    const { client } = makeFakeDb({
      jam_wallets: [wallet(1000), wallet(9999, OTHER)],
      jam_service_daily: [serviceDay('2026-10-12', 20), serviceDay('2026-10-12', 777, OTHER)],
    })
    expect(await readJamTotalEarned(client, U)).toBe(1020)
    expect(await readJamTotalEarned(client, 'nobody')).toBe(0)
  })

  it('소멸·채움은 지갑 balance만 줄이고 모은 양에는 영향이 없다 — 원장은 읽지 않는다', async () => {
    const db = makeFakeDb({
      jam_wallets: [{ user_id: U, balance: 0, total_earned: 1000 }],
      jam_service_daily: [serviceDay('2026-10-12', 20)],
      jam_transactions: [
        { id: 't1', user_id: U, amount: -500, reason: 'capsule_forfeit', created_at: '2026-10-13T00:00:00.000Z' },
        { id: 't2', user_id: U, amount: -300, reason: 'capsule_fill', created_at: '2026-10-13T00:00:00.000Z' },
      ],
    })
    expect(await readJamTotalEarned(db.client, U)).toBe(1020)
    expect(db.queried).not.toContain('jam_transactions')
  })

  it('서비스 활동 일별 행이 한 페이지(1,000행)를 넘어도 끝까지 더한다', async () => {
    const days = Array.from({ length: 1200 }, (_, n) => serviceDay(`day-${n}`, 1))
    const db = makeFakeDb({ jam_wallets: [wallet(10)], jam_service_daily: days })
    expect(await readJamTotalEarned(db.client, U)).toBe(1210)
    expect(db.queried.filter((table) => table === 'jam_service_daily')).toHaveLength(2)
  })

  it('지갑 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    const { client } = makeFakeDb({ jam_service_daily: [serviceDay('2026-10-12', 20)] }, { errors: { jam_wallets: '지갑 장애' } })
    await expect(readJamTotalEarned(client, U)).rejects.toThrow(/잼 지갑 조회 오류.*지갑 장애/)
  })

  it('서비스 활동 일별 표 조회 오류는 지갑 값만 돌려주지 않고 던진다 (한쪽만 센 값으로 판정하지 않는다)', async () => {
    const { client } = makeFakeDb({ jam_wallets: [wallet(1000)] }, { errors: { jam_service_daily: '일별 표 장애' } })
    await expect(readJamTotalEarned(client, U)).rejects.toThrow(/날짜별 서비스 활동 잼 조회 오류.*일별 표 장애/)
  })
})

describe('fetchDailyEarnedRows — 두 표를 날짜별로 더한 행', () => {
  it('활동 잼만 있으면 그 행 그대로다', async () => {
    const { client } = makeFakeDb({ jam_daily_earned: [settled('2026-10-14', 200)] })
    expect(await fetchDailyEarnedRows(client, U)).toEqual([{ earned_on: '2026-10-14', amount: 200 }])
  })

  it('서비스 활동 잼만 있으면 kst_date를 earned_on으로 읽는다', async () => {
    const { client } = makeFakeDb({ jam_service_daily: [serviceDay('2026-10-14', 25)] })
    expect(await fetchDailyEarnedRows(client, U)).toEqual([{ earned_on: '2026-10-14', amount: 25 }])
  })

  it('같은 날짜가 두 표에 있으면 한 행으로 합치고, 날짜 오름차순으로 돌려준다', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-14', 200), settled('2026-10-12', 100)],
      jam_service_daily: [serviceDay('2026-10-14', 25), serviceDay('2026-10-13', 10)],
    })
    expect(await fetchDailyEarnedRows(client, U)).toEqual([
      { earned_on: '2026-10-12', amount: 100 },
      { earned_on: '2026-10-13', amount: 10 },
      { earned_on: '2026-10-14', amount: 225 },
    ])
  })

  it('내 행만 읽는다', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-14', 200), settled('2026-10-14', 999, OTHER)],
      jam_service_daily: [serviceDay('2026-10-14', 25), serviceDay('2026-10-14', 888, OTHER)],
    })
    expect(await fetchDailyEarnedRows(client, U)).toEqual([{ earned_on: '2026-10-14', amount: 225 }])
  })

  it('활동 잼 표 조회 오류는 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { jam_daily_earned: '활동 표 장애' } })
    await expect(fetchDailyEarnedRows(client, U)).rejects.toThrow(/날짜별 모은 잼 조회 오류.*활동 표 장애/)
  })

  it('서비스 활동 잼 표 조회 오류는 활동 잼만 돌려주지 않고 던진다', async () => {
    const { client } = makeFakeDb({ jam_daily_earned: [settled('2026-10-14', 200)] }, { errors: { jam_service_daily: '일별 표 장애' } })
    await expect(fetchDailyEarnedRows(client, U)).rejects.toThrow(/날짜별 서비스 활동 잼 조회 오류.*일별 표 장애/)
  })
})

describe('한 주 최고·채운 주 횟수·연속 주 — 활동 잼과 서비스 활동 잼이 함께 합산된다', () => {
  // 2026-10-12(월)~10-18(일)이 한 주, 10-19(월)부터 다음 주
  it('한 주 최고 — 활동 잼만 / 서비스 활동 잼만', async () => {
    const onlySettled = makeFakeDb({ jam_daily_earned: [settled('2026-10-12', 120), settled('2026-10-14', 80)] })
    expect(await readJamWeeklyEarned(onlySettled.client, U)).toBe(200)
    const onlyService = makeFakeDb({ jam_service_daily: [serviceDay('2026-10-12', 20), serviceDay('2026-10-15', 30)] })
    expect(await readJamWeeklyEarned(onlyService.client, U)).toBe(50)
  })

  it('한 주 최고 — 같은 날짜가 두 표에 있어도, 같은 주의 다른 날이어도 모두 더한다', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-12', 120), settled('2026-10-19', 100)],
      jam_service_daily: [serviceDay('2026-10-12', 30), serviceDay('2026-10-16', 50)],
    })
    // 첫 주 120 + 30 + 50 = 200, 다음 주 100
    expect(await readJamWeeklyEarned(client, U)).toBe(200)
  })

  it('주 경계 — 일요일(10/18)은 앞 주, 월요일(10/19)은 다음 주다 (서비스 활동 잼도 같은 경계)', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-18', 150)],
      jam_service_daily: [serviceDay('2026-10-19', 70)],
    })
    expect(await readJamWeeklyEarned(client, U)).toBe(150) // 합쳐지지 않는다
    const rows = await fetchDailyEarnedRows(client, U)
    expect(countJamWeeks(rows, 100)).toBe(1) // 앞 주 150만 기준 100 이상, 다음 주 70은 미달
    const merged = makeFakeDb({
      jam_daily_earned: [settled('2026-10-18', 60)],
      jam_service_daily: [serviceDay('2026-10-17', 50)],
    })
    expect(await readJamWeeklyEarned(merged.client, U)).toBe(110) // 같은 주(10/12~10/18)라 합쳐진다
  })

  it('채운 주 횟수 — 활동 잼만으로는 모자란 주를 서비스 활동 잼이 채운다', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-12', 200), settled('2026-10-19', 180), settled('2026-10-26', 190)],
      jam_service_daily: [serviceDay('2026-10-20', 20), serviceDay('2026-10-27', 5)],
    })
    const rows = await fetchDailyEarnedRows(client, U)
    // 기준 200: 첫 주 200, 둘째 주 180+20, 셋째 주 190+5=195(미달)
    expect(countJamWeeks(rows, 200)).toBe(2)
  })

  it('연속 주 — 서비스 활동 잼만 있는 주도 이어지고, 빈 주가 끼면 끊긴다', async () => {
    const { client } = makeFakeDb({
      jam_daily_earned: [settled('2026-10-05', 200), settled('2026-10-19', 200)],
      jam_service_daily: [serviceDay('2026-10-12', 200)],
    })
    expect(jamWeekStreak(await fetchDailyEarnedRows(client, U), 200)).toBe(3)

    const gap = makeFakeDb({
      jam_daily_earned: [settled('2026-10-05', 200)],
      jam_service_daily: [serviceDay('2026-10-19', 200)],
    })
    expect(jamWeekStreak(await fetchDailyEarnedRows(gap.client, U), 200)).toBe(1) // 10/12 주가 비어 끊긴다
  })

  it('한 주 최고 읽기도 어느 표든 조회 오류를 던진다', async () => {
    const { client } = makeFakeDb({}, { errors: { jam_service_daily: '일별 표 장애' } })
    await expect(readJamWeeklyEarned(client, U)).rejects.toThrow(/날짜별 서비스 활동 잼 조회 오류/)
  })
})
