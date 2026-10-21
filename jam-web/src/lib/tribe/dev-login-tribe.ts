/**
 * 개발 로그인 계정의 트라이브 지정 — 서버 전용 (티켓 20261021_1247 1회, 사용자 결정 2)
 *
 * 트라이브 게이트가 켜지면(`(main)` 레이아웃) 트라이브가 없는 계정은 모든 화면에서 고르기 화면으로 보내진다. `/api/dev-login`이 만드는
 * 고정 테스트 계정(`DEV_LOGIN_USER_ID`)에도 트라이브가 없으므로, 그 계정으로 하는 로컬·staging 확인이 모두 고르기 화면에서 멈춘다.
 * 그래서 로그인 라우트가 세션을 만든 뒤 **이 계정의 `tribe_id`가 비어 있을 때만** 활성 트라이브(`tribes.is_active`, `sort_order` 첫 번째) 하나를 지정한다.
 *
 * - 이미 트라이브가 있으면 건드리지 않는다. 다른 트라이브로 바꾸려면 어드민의 트라이브 변경(2회)을 쓴다.
 * - 활성 트라이브가 없으면 지정 없이 계속한다(로그인을 막지 않는다).
 * - 읽거나 쓰지 못해도 로그인을 막지 않는다. 로그만 남기고 `skipped`를 돌려준다 — 이 계정은 확인용이라 트라이브가 없어도 고르기 화면에서 직접 고를 수 있다.
 * - 쓰기는 `tribe_id IS NULL` 조건을 함께 건다. 읽은 뒤 쓰기 전에 다른 곳에서 채워졌다면 덮어쓰지 않는다.
 *
 * 이 모듈은 `/api/dev-login` 라우트의 환경 게이트(`isStagingOrDevEnv`, 프로덕션은 404) 뒤에서만 불린다. 공용 DB의 테스트 계정 한 행만 바뀐다.
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasTribe } from './gate-contract'

export type DevLoginTribeResult =
  /** 이미 트라이브가 있어 건드리지 않았다 */
  | 'kept'
  /** 비어 있어 활성 트라이브 하나를 지정했다 */
  | 'assigned'
  /** 비어 있지만 활성 트라이브가 없어 지정하지 않았다 */
  | 'no_active_tribe'
  /** 읽기·쓰기 실패나 `users` 행 없음으로 지정하지 않았다(로그인은 계속한다) */
  | 'skipped'

export async function ensureDevLoginTribe(supabase: SupabaseClient, userId: string): Promise<DevLoginTribeResult> {
  try {
    const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
    if (userError) {
      console.error('[JAM!][dev-login] 테스트 계정 트라이브 조회 실패:', userError.message)
      return 'skipped'
    }
    if (!userRow) {
      console.info('[JAM!][dev-login] 테스트 계정의 users 행이 없어 트라이브를 지정하지 않음')
      return 'skipped'
    }
    if (hasTribe((userRow as { tribe_id?: unknown }).tribe_id)) return 'kept'

    const { data: tribes, error: tribeError } = await supabase
      .from('tribes')
      .select('id')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(1)
    if (tribeError) {
      console.error('[JAM!][dev-login] 활성 트라이브 조회 실패:', tribeError.message)
      return 'skipped'
    }
    const tribeId = (tribes as { id: string }[] | null)?.[0]?.id
    if (!tribeId) {
      console.info('[JAM!][dev-login] 활성 트라이브가 없어 테스트 계정에 트라이브를 지정하지 않음')
      return 'no_active_tribe'
    }

    const { error: updateError } = await supabase.from('users').update({ tribe_id: tribeId }).eq('id', userId).is('tribe_id', null)
    if (updateError) {
      console.error('[JAM!][dev-login] 테스트 계정 트라이브 지정 실패:', updateError.message)
      return 'skipped'
    }
    return 'assigned'
  } catch (err) {
    console.error('[JAM!][dev-login] 테스트 계정 트라이브 처리 중 오류:', err)
    return 'skipped'
  }
}
