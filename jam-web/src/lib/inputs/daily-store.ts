/**
 * 외부 입력(날씨·특일) 일일값 저장소 (티켓 20260923_2333, 테이블은 마이그레이션 184)
 *
 * 카드 조회 경로는 `readDailyInput`으로 저장값만 읽고, 외부 API 호출과 저장은 cron 라우트
 * (`/api/cron/external-inputs`)가 `writeDailyInput`으로 맡는다. 행은 (kind, date_kst)당 하나다.
 * 서비스 롤 전용 테이블이라 서비스 클라이언트로만 접근한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'

export type DailyInputKind = 'weather' | 'special_days'

/** 'YYYYMMDD' → 'YYYY-MM-DD' (테이블 date_kst 컬럼 형식) */
export function ymdToDateKst(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

/**
 * 저장된 값을 읽는다. 행이 없거나 조회 오류면 null(오류를 던지지 않는다) — 호출부는 해당 태그만
 * 빠뜨리고 카드 생성을 그대로 진행한다. 요청 경로 전용.
 */
export async function readDailyInput(kind: DailyInputKind, dateKst: string): Promise<Json | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('external_input_daily')
      .select('value')
      .eq('kind', kind)
      .eq('date_kst', dateKst)
      .maybeSingle()
    if (error || !data) return null
    return data.value
  } catch {
    return null
  }
}

/** 값을 (kind, date_kst) 행에 upsert한다. 실패하면 오류를 던진다. cron 전용. */
export async function writeDailyInput(kind: DailyInputKind, dateKst: string, value: Json): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('external_input_daily')
    .upsert({ kind, date_kst: dateKst, value, fetched_at: new Date().toISOString() }, { onConflict: 'kind,date_kst' })
  if (error) throw new Error(`external_input_daily 저장 실패(${kind}): ${error.message}`)
}
