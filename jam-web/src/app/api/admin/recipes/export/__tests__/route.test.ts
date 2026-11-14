/**
 * POST /api/admin/recipes/export — 「공개 시각」 옆의 「종료 시각」 열 (티켓 20261002_0710)
 * 종료 시각이 있는 레시피는 KST로, 비어 있는(상시) 레시피는 빈 칸으로 내보낸다.
 * 티켓 20261114_1705 2회차: 「유형」 열(등급 대응형 / 등급 고정형)과 「첫 성공자 보상」 열.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/recipes/export/__tests__/route.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

const rows = vi.hoisted(() => [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '기간 한정 레시피',
    reward_points: 10,
    reward_badge_ids: [] as string[],
    valid_from: '2026-10-05T00:00:00.000Z', // KST 2026.10.05 09:00
    valid_until: '2026-10-12T00:00:00.000Z', // KST 2026.10.12 09:00
    created_at: '2026-10-02T00:00:00.000Z',
    grade_mode: 'follow_materials',
    first_success_badge_id: 'badge-first' as string | null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '상시 레시피',
    reward_points: 20,
    reward_badge_ids: [] as string[],
    valid_from: null,
    valid_until: null,
    created_at: '2026-10-01T00:00:00.000Z',
    grade_mode: 'fixed',
    first_success_badge_id: null as string | null,
  },
])

const selectedColumns = vi.hoisted(() => [] as string[])

function tableBuilder(table: string) {
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      if (table === 'combination_recipes') selectedColumns.push(columns)
      return builder
    },
    in: () => builder,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: table === 'combination_recipes' ? rows : [], error: null }).then(onFulfilled, onRejected),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: (table: string) => tableBuilder(table) }) }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { POST } = await import('../route')

const exportRecipes = () =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/recipes/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [ID_A, ID_B] }),
    })
  )

/** BOM을 떼고 CRLF로 나눈 줄 목록 */
async function csvLines(res: Response): Promise<string[]> {
  return (await res.text()).replace(/^﻿/, '').split('\r\n')
}

describe('POST /api/admin/recipes/export — 종료 시각 열', () => {
  it('헤더에 「종료 시각」이 「공개 시각」 바로 뒤에 온다', async () => {
    const res = await exportRecipes()
    const header = (await csvLines(res))[0].split(',')

    expect(res.status).toBe(200)
    expect(header.indexOf('종료 시각')).toBe(header.indexOf('공개 시각') + 1)
  })

  it('종료 시각이 있으면 KST로, 없으면 빈 칸으로 적는다', async () => {
    const res = await exportRecipes()
    const lines = await csvLines(res)
    const untilIndex = lines[0].split(',').indexOf('종료 시각')

    const byName = new Map(lines.slice(1).map((line) => [line.split(',')[1], line.split(',')]))
    expect(byName.get('기간 한정 레시피')?.[untilIndex]).toBe('2026.10.12 09:00')
    expect(byName.get('상시 레시피')?.[untilIndex]).toBe('')
  })

  it('목록과 같은 칸 목록으로 종료 시각(valid_until)을 조회한다', async () => {
    selectedColumns.length = 0
    await exportRecipes()

    expect(selectedColumns[0].split(', ')).toContain('valid_until')
  })
})

describe('POST /api/admin/recipes/export — 유형·첫 성공자 보상 열 (티켓 20261114_1705 2회차)', () => {
  it('유형을 한국어 이름으로 적고, 칸이 없는 옛 행은 등급 고정형이다', async () => {
    const res = await exportRecipes()
    const lines = await csvLines(res)
    const typeIndex = lines[0].split(',').indexOf('유형')

    expect(typeIndex).toBeGreaterThan(-1)
    const byName = new Map(lines.slice(1).map((line) => [line.split(',')[1], line.split(',')]))
    expect(byName.get('기간 한정 레시피')?.[typeIndex]).toBe('등급 대응형')
    expect(byName.get('상시 레시피')?.[typeIndex]).toBe('등급 고정형')
  })

  it('첫 성공자 보상 배지를 적고 없으면 빈 칸이다', async () => {
    const res = await exportRecipes()
    const lines = await csvLines(res)
    const index = lines[0].split(',').indexOf('첫 성공자 보상')

    expect(index).toBeGreaterThan(-1)
    const byName = new Map(lines.slice(1).map((line) => [line.split(',')[1], line.split(',')]))
    expect(byName.get('기간 한정 레시피')?.[index]).toBe('badge-first')
    expect(byName.get('상시 레시피')?.[index]).toBe('')
  })

  it('목록과 같은 칸 목록으로 유형(grade_mode)과 첫 성공자 보상(first_success_badge_id)을 조회한다', async () => {
    selectedColumns.length = 0
    await exportRecipes()

    const columns = selectedColumns[0].split(', ')
    expect(columns).toContain('grade_mode')
    expect(columns).toContain('first_success_badge_id')
  })
})
