/**
 * 어드민 유저 상세의 «트라이브» 구역이 읽는 값 (티켓 20261021_1247 3회, 운영 로직 2.4절)
 *
 * 한 유저의 지금 트라이브(이름), 바꿀 수 있는 트라이브 목록(활성이고 지금 것이 아닌 것), 최근 변경 이력을 service 클라이언트로 읽는다.
 * 변경 이력은 2회가 만든 `fetchTribeChangeHistory`(`lib/admin/user-tribe.ts`)를 그대로 쓴다. 변경 자체(POST)와 영향 미리 보기(GET)는 화면이 API로 부른다.
 *
 * ## 읽지 못함과 기록 없음을 구분한다 (챕터 구역과 같은 보조 읽기 관례)
 * 구역마다 `{ ok: true, value }` 또는 `{ ok: false }`다. 읽지 못한 구역은 로그를 남기고 `{ ok: false }`로 돌려준다 — 화면이 «이력 없음»과 다르게 그린다.
 * 한 구역의 실패가 다른 구역을 막지 않고 유저 상세 화면 전체를 오류로 만들지 않는다. 던지지 않는다.
 *
 * ## 트라이브가 없는 유저
 * 트라이브가 없는 유저는 고르기 화면에서 스스로 고르는 것이 설계라 어드민이 지정하지 않는다(API도 `no_tribe` 409). 그래서 `current`는 `{ ok: true, value: null }`이고
 * 트라이브 표를 읽지 않는다. 변경 이력은 읽는다(초기화로 트라이브가 비기 전의 기록이 남아 있을 수 있다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/admin/queryError'
import type { ViewSection } from '@/lib/admin/user-chapter-view'
import { fetchTribeChangeHistory, type TribeChangeHistoryItem } from '@/lib/admin/user-tribe'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface TribeOption {
  id: string
  name: string
}

export interface UserTribeView {
  /** 지금 트라이브. 아직 고르지 않은 유저는 `value`가 null */
  current: ViewSection<TribeOption | null>
  /** 바꿀 수 있는 트라이브: 활성이고 지금 트라이브가 아닌 것(`sort_order`순) */
  options: ViewSection<TribeOption[]>
  /** 최근 변경 이력(최신순) */
  history: ViewSection<TribeChangeHistoryItem[]>
}

interface TribeRow extends TribeOption {
  isActive: boolean
}

/** 트라이브 표를 통째로 읽는다(열 개 안팎의 작은 표). 읽지 못하면 null */
async function readTribes(supabase: ServiceClient): Promise<TribeRow[] | null> {
  try {
    const { data, error } = await supabase
      .from('tribes')
      .select('id, name, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) {
      logQueryError(error, 'users/detail/tribes')
      return null
    }
    return (data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active }))
  } catch (e) {
    logQueryError({ message: e instanceof Error ? e.message : String(e) }, 'users/detail/tribes')
    return null
  }
}

async function readHistory(supabase: ServiceClient, userId: string): Promise<ViewSection<TribeChangeHistoryItem[]>> {
  try {
    return { ok: true, value: await fetchTribeChangeHistory(supabase, userId) }
  } catch (e) {
    logQueryError({ message: e instanceof Error ? e.message : String(e) }, 'users/detail/tribe-history')
    return { ok: false }
  }
}

/** 유저 한 명의 트라이브 구역 값을 읽는다. `currentTribeId`는 유저 행의 `tribe_id`다 */
export async function loadUserTribeView(
  supabase: ServiceClient,
  userId: string,
  currentTribeId: string | null
): Promise<UserTribeView> {
  const [tribes, history] = await Promise.all([
    currentTribeId === null ? Promise.resolve([] as TribeRow[]) : readTribes(supabase),
    readHistory(supabase, userId),
  ])

  if (currentTribeId === null) {
    return { current: { ok: true, value: null }, options: { ok: true, value: [] }, history }
  }
  if (tribes === null) return { current: { ok: false }, options: { ok: false }, history }

  const options: ViewSection<TribeOption[]> = {
    ok: true,
    value: tribes.filter((t) => t.isActive && t.id !== currentTribeId).map((t) => ({ id: t.id, name: t.name })),
  }

  const found = tribes.find((t) => t.id === currentTribeId)
  if (!found) {
    // users.tribe_id가 tribes를 가리키는 외래키라 정상이면 오지 않는다. 이름을 모르는 채로 «지금 트라이브»를 보이지 않는다
    logQueryError({ message: `users.tribe_id(${currentTribeId})에 맞는 트라이브 행이 없다` }, 'users/detail/tribes')
    return { current: { ok: false }, options, history }
  }
  return { current: { ok: true, value: { id: found.id, name: found.name } }, options, history }
}
