import { createServiceClient } from '@/lib/supabase/server'
import type { ThemePresetRow } from '@/types/database'

export const DEFAULT_THEME = { mainColor: '#0033e5', subColor: '#f0f7ff' }

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

// 루트 레이아웃에서 매 요청마다 호출된다 — 실패해도 기본 코발트/아이스로 폴백해
// 어드민 테마 설정 오류가 전체 서비스 렌더링을 막지 않게 한다.
export async function getActiveThemeColors(): Promise<{ mainColor: string; subColor: string }> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('theme_presets')
      .select('main_color, sub_color')
      .eq('is_active', true)
      .maybeSingle()

    const row = data as Pick<ThemePresetRow, 'main_color' | 'sub_color'> | null
    if (!row) return DEFAULT_THEME
    if (!HEX_COLOR_RE.test(row.main_color) || !HEX_COLOR_RE.test(row.sub_color)) return DEFAULT_THEME
    return { mainColor: row.main_color, subColor: row.sub_color }
  } catch {
    return DEFAULT_THEME
  }
}
