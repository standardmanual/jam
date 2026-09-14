import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * poi.category가 poi_categories에 실제 존재하는 슬러그인지 검증한다.
 * FK 제약(`poi_category_fkey`, 마이그레이션 050)이 최종적으로는 막아주지만, 앱 레벨 검증
 * 없이 보내면 깔끔한 400 대신 Postgres FK violation이 원문 그대로 500으로 노출된다
 * (티켓 20260907_1706). POST/PUT/PATCH `/api/admin/poi` 3개 엔드포인트가 공용으로 쓴다.
 */
export async function validatePoiCategoryExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  category: string
): Promise<{ valid: true } | { valid: false; status: number; error: string }> {
  const { data, error } = await supabase.from('poi_categories').select('slug').eq('slug', category).maybeSingle()

  if (error) return { valid: false, status: 500, error: error.message }
  if (!data) return { valid: false, status: 400, error: '존재하지 않는 카테고리입니다.' }
  return { valid: true }
}
