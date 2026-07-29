import { createServiceClient } from '@/lib/supabase/server'
import type { ThemePresetRow } from '@/types/database'
import ThemeManager from './ThemeManager'

export default async function AdminThemePage() {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('theme_presets')
    .select('*')
    .order('created_at', { ascending: false })
  const presets = (data ?? []) as ThemePresetRow[]

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">테마 컬러</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          서비스 전체의 메인(코발트)/서브(아이스) 컬러 프리셋을 만들고 활성화합니다.
          활성 프리셋은 즉시 전체 서비스에 반영됩니다.
        </p>
      </div>
      <ThemeManager initialPresets={presets} />
    </div>
  )
}
