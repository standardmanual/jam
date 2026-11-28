/**
 * 확률 안내 시험이 함께 쓰는 설정 표 행과 가짜 클라이언트 (티켓 20261021_1250 1회)
 *
 * 공용 DB를 부르지 않는다. 표마다 돌려줄 결과(행·오류·예외)를 정하고, 표마다 select에 넘긴 칸 목록을 기록한다.
 *
 * 변경 이력 표(`balance_setting_changes`, 티켓 20261022_1700)는 설정 표와 달리 여러 행을 읽는다: `select().eq().order()` 사슬을 받아
 * `eq`로 행을 거르고 `order`로 정렬해 돌려준다(걸러지는 것은 시험이 눈으로 볼 수 있다). 결과를 정하지 않으면 이력이 없는 표(빈 배열)다.
 */
import { expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// 챕터 오름 보상 설정 — A3 후보 E 확정 값(= 마이그레이션 366의 기본값, 티켓 20261127_1738 C8)
export const CHAPTER_REWARD_ROW = {
  other_tribe_probability: 0.2,
  rarity_common: 30,
  rarity_rare: 40,
  rarity_epic: 22,
  rarity_mystic: 8,
  pity_epic_threshold: 15,
}
// 챕터별 보상 개수 — 마친 챕터 1~3은 3개, 4~6은 4개, 7~9는 5개, 마지막 챕터 10은 NULL(보상 없음). 마이그레이션 366 시드와 같다
export const CHAPTER_DEFINITIONS_ROWS = [
  { chapter_no: 1, reward_count: 3 },
  { chapter_no: 2, reward_count: 3 },
  { chapter_no: 3, reward_count: 3 },
  { chapter_no: 4, reward_count: 4 },
  { chapter_no: 5, reward_count: 4 },
  { chapter_no: 6, reward_count: 4 },
  { chapter_no: 7, reward_count: 5 },
  { chapter_no: 8, reward_count: 5 },
  { chapter_no: 9, reward_count: 5 },
  { chapter_no: 10, reward_count: null },
]
// 옛 `capsule_policy` 행(운영 로직 5.4·6.7절 값). 확률 안내는 더 읽지 않으므로 «읽지 않는다»를 시험하는 데만 쓴다
export const CAPSULE_ROW = {
  guaranteed_count: 1,
  bonus_count: 1,
  bonus_probability: 0.2,
  other_tribe_probability: 0.2,
  rarity_common: 70,
  rarity_rare: 22,
  rarity_epic: 6,
  rarity_mystic: 2,
  pity_epic_threshold: 15,
}
export const JAM_ROW = {
  sync_item_guaranteed: 1,
  sync_item_guaranteed_hiking: 2,
  sync_item_bonus_rolls: 2,
  sync_item_bonus_jam_divisor: 600,
  sync_item_bonus_max_probability: 0.25,
  sync_rarity_common: 84,
  sync_rarity_rare: 13,
  sync_rarity_epic: 2.5,
  sync_rarity_mystic: 0.5,
  common_streak_threshold: 10,
  locked_roll_probability: 0.25,
}
// 마이그레이션 287의 기본값(티켓 20261023_1648) — 등급 올리기 윗등급 확률 한 칸
export const COMBINE_ROW = { tier_up_probability: 0.7 }
export const AMBIENT_ROW = { rarity_mode: 'explicit', rarity_common: 1, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }

export type Result = { data: unknown; error: unknown } | 'throw'

export const CHANGES_TABLE = 'balance_setting_changes'
export const CHAPTER_DEFINITIONS_TABLE = 'chapter_definitions'

export interface Fake {
  client: SupabaseClient
  /** 표마다 select에 넘긴 칸 목록 */
  selects: Record<string, string>
  /** 변경 이력 표에 건 `eq` 조건(칸, 값)과 정렬(칸, 오름차순 여부) */
  changesQuery: { filters: Array<[string, unknown]>; order: [string, boolean] | null }
}

export function fakeClient(results: Record<string, Result>): Fake {
  const selects: Record<string, string> = {}
  const changesQuery: Fake['changesQuery'] = { filters: [], order: null }

  const changesBuilder = () => {
    const builder = {
      eq: (column: string, value: unknown) => {
        changesQuery.filters.push([column, value])
        return builder
      },
      order: async (column: string, options: { ascending: boolean }) => {
        changesQuery.order = [column, options.ascending]
        const result = results[CHANGES_TABLE] ?? ok([])
        if (result === 'throw') throw new Error('network')
        if (result.error || !Array.isArray(result.data)) return result
        const rows = (result.data as Array<Record<string, unknown>>)
          .filter((row) => changesQuery.filters.every(([c, v]) => row[c] === v))
          .sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (options.ascending ? 1 : -1))
        return { data: rows, error: null }
      },
    }
    return builder
  }

  // 챕터 정의는 `select().order()`로 여러 행을 읽는다(챕터별 보상 개수). 결과를 정하지 않으면 읽지 못한 표(예상하지 못한 표)다
  const definitionsBuilder = () => ({
    order: async (column: string, options: { ascending: boolean }) => {
      expect([column, options.ascending]).toEqual(['chapter_no', true])
      const result = results[CHAPTER_DEFINITIONS_TABLE]
      if (!result) throw new Error(`예상하지 못한 표: ${CHAPTER_DEFINITIONS_TABLE}`)
      if (result === 'throw') throw new Error('network')
      return result
    },
  })

  const client = {
    from: (table: string) => ({
      select: (columns: string) => {
        selects[table] = columns
        if (table === CHANGES_TABLE) return changesBuilder()
        if (table === CHAPTER_DEFINITIONS_TABLE) return definitionsBuilder()
        return {
          eq: (column: string, value: number) => {
            expect([column, value]).toEqual(['id', 1])
            const read = async () => {
              const result = results[table]
              if (!result) throw new Error(`예상하지 못한 표: ${table}`)
              if (result === 'throw') throw new Error('network')
              return result
            }
            // `single`은 설정 표를 엄격하게 읽는 확률 안내의 읽기, `maybeSingle`은 추첨과 같은 `getChapterRewardPolicy`의 읽기다
            return { single: read, maybeSingle: read }
          },
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client, selects, changesQuery }
}

export const ok = (row: unknown): Result => ({ data: row, error: null })
export const failed: Result = { data: null, error: { message: 'boom' } }

export const ALL_OK = {
  chapter_reward_policy: ok(CHAPTER_REWARD_ROW),
  chapter_definitions: ok(CHAPTER_DEFINITIONS_ROWS),
  jam_policy: ok(JAM_ROW),
  combine_policy: ok(COMBINE_ROW),
  ambient_drop_config: ok(AMBIENT_ROW),
}
