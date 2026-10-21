import { describe, it, expect } from 'vitest'
import {
  MISSION_REFERENCE_SOURCES,
  collectMissionReferences,
  summarizeReference,
} from '../reference-guards'
import { classifyMissionDeletion, type MissionBulkRow } from '../mission-bulk'

type Row = Record<string, unknown>

/** `from(table).select(col).in(col, ids).range(a, b)` 체인만 흉내 내는 스텁 (tribe-reference-guards.test.ts와 같은 패턴) */
function createStubSupabase(tables: Record<string, Row[]>, failTable?: string) {
  return {
    from(table: string) {
      return {
        select: () => ({
          in: (column: string, ids: string[]) => ({
            range: async (from: number, to: number) => {
              if (table === failTable) return { data: null, error: { message: `${table} 실패` } }
              const rows = (tables[table] ?? []).filter((r) => ids.includes(String(r[column])))
              return { data: rows.slice(from, to + 1), error: null }
            },
          }),
        }),
      }
    },
  } as unknown as Parameters<typeof collectMissionReferences>[0]
}

describe('미션 삭제 가드 — 랭킹 규칙 연결 (티켓 20260925_2105)', () => {
  it('ranking_modes.target_mission_id는 삭제를 막지 않고 안내만 하는 참조다', () => {
    const source = MISSION_REFERENCE_SOURCES.find((s) => s.key === 'ranking_modes')
    expect(source).toMatchObject({ location: 'ranking_modes.target_mission_id', blocks: false })
  })

  it('랭킹 규칙 연결은 total에 잡히지만 blockingTotal은 늘지 않고 안내 문구에 나온다', async () => {
    const supabase = createStubSupabase({
      ranking_modes: [{ target_mission_id: 'm1' }, { target_mission_id: 'm1' }, { target_mission_id: 'm2' }],
    })
    const { counts, error } = await collectMissionReferences(supabase, ['m1', 'm3'])
    expect(error).toBeNull()
    expect(counts.get('m1')?.ranking_modes).toBe(2)
    expect(counts.get('m3')?.ranking_modes).toBe(0)

    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get('m1')!)
    expect(summary.blockingTotal).toBe(0)
    expect(summary.total).toBe(2)
    expect(summary.hitLabels).toContain('랭킹 규칙 연결 2건')
    expect(summary.noticeLabels).toBe('랭킹 규칙 연결 2건')
    expect(summary.blockingLabels).toBe('')
  })

  it('막는 참조가 함께 있으면 blockingLabels와 noticeLabels가 나뉜다', async () => {
    const supabase = createStubSupabase({
      user_mission_completions: [{ mission_id: 'm1' }],
      today_cards: [{ mission_id: 'm1' }],
      ranking_modes: [{ target_mission_id: 'm1' }],
    })
    const { counts } = await collectMissionReferences(supabase, ['m1'])
    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get('m1')!)
    expect(summary.blockingTotal).toBe(1)
    expect(summary.blockingLabels).toBe('완료 이력 1건')
    expect(summary.noticeLabels).toBe('투데이 카드 연결 1건, 랭킹 규칙 연결 1건')
  })

  it('랭킹 규칙 조회가 실패하면 error를 채운다(fail-closed — 삭제를 진행하지 않는다)', async () => {
    const supabase = createStubSupabase({}, 'ranking_modes')
    const { error } = await collectMissionReferences(supabase, ['m1'])
    expect(error).toContain('ranking_modes')
  })

  it('참조가 없으면 기존 결과 그대로다(안내 문구가 비어 있다)', async () => {
    const supabase = createStubSupabase({})
    const { counts, error } = await collectMissionReferences(supabase, ['m1'])
    expect(error).toBeNull()
    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get('m1')!)
    expect(summary).toEqual({ blockingTotal: 0, total: 0, hitLabels: '', blockingLabels: '', noticeLabels: '' })
  })

  it('일괄 삭제는 랭킹 규칙 연결만 있는 미션을 건너뛰지 않는다', async () => {
    const supabase = createStubSupabase({ ranking_modes: [{ target_mission_id: 'm1' }] })
    const { counts } = await collectMissionReferences(supabase, ['m1'])
    const rows = [{ id: 'm1', title: '미션 1' }] as unknown as MissionBulkRow[]
    const { targets, skipped } = classifyMissionDeletion(['m1'], rows, counts)
    expect(targets).toEqual(['m1'])
    expect(skipped).toEqual([])
  })
})

describe('미션 삭제 가드 — 5-1·5-3 새 표 세 개 (티켓 20261019_1318 1회)', () => {
  const find = (key: string) => MISSION_REFERENCE_SOURCES.find((s) => s.key === key)

  it('받지 않은 보상과 참가 취소 이력은 삭제를 막는 참조(CASCADE로 유저 기록이 사라진다)다', () => {
    expect(find('mission_item_rewards')).toMatchObject({ location: 'mission_item_rewards.mission_id', blocks: true })
    expect(find('mission_participation_cancellations')).toMatchObject({
      location: 'mission_participation_cancellations.mission_id',
      blocks: true,
    })
  })

  it('참가 트라이브 제한은 운영 설정이라 삭제를 막지 않고 안내만 한다', () => {
    expect(find('mission_allowed_tribes')).toMatchObject({ location: 'mission_allowed_tribes.mission_id', blocks: false })
  })

  it('세 표를 미션별로 세고, 막는 참조와 안내가 나뉜다', async () => {
    const supabase = createStubSupabase({
      mission_item_rewards: [{ mission_id: 'm1' }, { mission_id: 'm1' }, { mission_id: 'm2' }],
      mission_participation_cancellations: [{ mission_id: 'm1' }],
      mission_allowed_tribes: [{ mission_id: 'm1' }, { mission_id: 'm1' }, { mission_id: 'm3' }],
    })
    const { counts, error } = await collectMissionReferences(supabase, ['m1', 'm2', 'm3'])
    expect(error).toBeNull()
    expect(counts.get('m1')).toMatchObject({
      mission_item_rewards: 2,
      mission_participation_cancellations: 1,
      mission_allowed_tribes: 2,
    })

    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get('m1')!)
    expect(summary.blockingTotal).toBe(3)
    expect(summary.blockingLabels).toBe('아이템 배지 보상 기록 2건, 참가 취소 기록 1건')
    expect(summary.noticeLabels).toBe('참가 트라이브 제한 2곳')
  })

  it('트라이브 제한만 있는 미션은 막히지 않고, 일괄 삭제도 건너뛰지 않는다', async () => {
    const supabase = createStubSupabase({ mission_allowed_tribes: [{ mission_id: 'm1' }] })
    const { counts } = await collectMissionReferences(supabase, ['m1'])
    const summary = summarizeReference(MISSION_REFERENCE_SOURCES, counts.get('m1')!)
    expect(summary.blockingTotal).toBe(0)
    expect(summary.noticeLabels).toBe('참가 트라이브 제한 1곳')

    const rows = [{ id: 'm1', title: '미션 1' }] as unknown as MissionBulkRow[]
    expect(classifyMissionDeletion(['m1'], rows, counts)).toEqual({ targets: ['m1'], skipped: [] })
  })

  it('받지 않은 보상이 붙은 미션은 일괄 삭제에서 건너뛴다', async () => {
    const supabase = createStubSupabase({ mission_item_rewards: [{ mission_id: 'm1' }] })
    const { counts } = await collectMissionReferences(supabase, ['m1'])
    const rows = [{ id: 'm1', title: '미션 1' }] as unknown as MissionBulkRow[]
    const { targets, skipped } = classifyMissionDeletion(['m1'], rows, counts)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toContain('아이템 배지 보상 기록 1건')
  })

  it.each(['mission_item_rewards', 'mission_participation_cancellations', 'mission_allowed_tribes'])(
    '%s 조회가 실패하면 error를 채운다(fail-closed)',
    async (table) => {
      const { error } = await collectMissionReferences(createStubSupabase({}, table), ['m1'])
      expect(error).toContain(table)
    }
  )
})
