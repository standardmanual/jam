/**
 * getAmbientDropConfig — 설정 로딩이 옛 «전체 무작위» 칸을 싣지 않는다 (티켓 20261022_0938)
 *
 * 공용 DB의 ambient_drop_config 행에는 옛 열(all_random)이 아직 남아 있고 값은 true다
 * (옛 프로덕션 코드가 읽어서 지우지 않았다). 코드는 그 칸을 모르므로 설정 객체에 실리면 안 된다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/config-load.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const stub = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: stub.row, error: null }),
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { DEFAULT_AMBIENT_DROP_CONFIG, getAmbientDropConfig } from '../config'

beforeEach(() => {
  stub.row = null
})

describe('getAmbientDropConfig', () => {
  it('기본값에는 옛 all_random 칸이 없다', () => {
    expect(DEFAULT_AMBIENT_DROP_CONFIG).not.toHaveProperty('all_random')
  })

  it('DB 행에 all_random이 true로 남아 있어도 설정 객체에 싣지 않는다', async () => {
    stub.row = {
      id: 1,
      auto_enabled: true,
      all_random: true,
      category_mode: 'explicit',
      category_slug: 'cafe',
      rarity_mode: 'explicit',
      rarity_common: '0.5',
      rarity_rare: 0.5,
      batch_size: 12,
      updated_at: '2026-10-22T00:00:00+00:00',
    }
    const config = await getAmbientDropConfig()

    expect(config).not.toHaveProperty('all_random')
    // 그 밖의 칸은 그대로 읽는다(숫자 컬럼이 문자열로 와도 숫자로 바꾼다)
    expect(config).toMatchObject({
      auto_enabled: true,
      category_mode: 'explicit',
      category_slug: 'cafe',
      rarity_common: 0.5,
      rarity_rare: 0.5,
      batch_size: 12,
    })
  })

  it('행이 없으면 기본값으로 되돌아간다', async () => {
    const config = await getAmbientDropConfig()
    expect(config).toEqual(DEFAULT_AMBIENT_DROP_CONFIG)
  })
})
