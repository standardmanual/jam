/**
 * 밸런스 설정 «인벤토리» 구역의 연결 (티켓 20261022_1134 1회, 운영 로직 8.2·19.1절)
 *
 * `inventory_policy` id=1 한 행의 `max_slots` 한 칸(유저 한 명이 가질 수 있는 인벤토리 최대 칸 수, 1 이상 정수, 마이그레이션 129의 CHECK와 같다)만 편집한다.
 * 옛 «인벤토리 최대치» 화면(`/admin/inventory-policy`)과 그 API(`/api/admin/inventory-policy`)를 이 구역으로 옮겼다. 확률 안내 페이지가 읽는 칸이 아니라 확인창은 쓰지 않고,
 * 대신 구역 본문(`InventorySection`)이 «저장하면 전체 유저 N명의 인벤토리 최대치가 즉시 바뀌어요» 안내를 둔다(사용자 결정).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값 10으로 바꿔 보이지 않는다. 그래서 `getInventoryPolicy`의 폴백을 쓰지 않는다).
 *
 * 쓰기는 다른 구역과 달리 `updated_at` 조건부 갱신이 아니다. 저장은 기존 경로인 `updateInventoryMaxSlots`(RPC `set_inventory_max_slots`, 마이그레이션 129·181)를 그대로 거친다.
 * 이 RPC는 기존 유저 전원의 `inventory.max_slots`와 `inventory_policy` 행(`updated_at = now()`)을 한 트랜잭션에서 바꾸고 `updated_at` 조건을 받지 않는다.
 * 그래서 «현재 수정 시각 재확인 → RPC → 수정 시각 다시 읽어 돌려주기»로 근사한다. 알려진 한계(티켓 20261022_2056과 같은 계열):
 * - **재확인과 RPC 사이의 좁은 경합이 남는다.** 그 사이에 다른 곳이 같은 값을 바꾸면 조건부 갱신이 아니라서 막지 못하고 마지막 저장이 이긴다(이력은 읽은 값 기준으로 남는다).
 * - **이력을 못 쓴 뒤의 되돌림이 수정 시각을 읽은 시각으로 되돌리지 못한다.** 되돌림도 같은 RPC라 값은 이전 값으로 돌아오지만 `updated_at`은 되돌린 시각(`now()`)이 된다.
 *   화면이 들고 있는 수정 시각이 낡아 다음 저장이 한 번 409가 나고, 새로 불러오면 풀린다(안전한 쪽 오류). 되돌릴 때 사용자가 늘어 이전 값이 거절되면 되돌리기 실패의 500이다.
 * - 저장은 성공했는데 수정 시각을 다시 읽지 못하면 이번 저장이 만든 시각(`nextUpdatedAt`)을 돌려준다. DB의 시각과 다르므로 다음 저장은 409가 나고 새로 불러오면 풀린다.
 *
 * RPC가 던지는 예외는 문장으로 바꿔 돌려준다: `INVENTORY_MAX_SLOTS_OVER_LIMIT:`(새 최대치보다 많이 가진 유저가 있음)와 `INVENTORY_MAX_SLOTS_INVALID:`는 어드민이 값을 고치면 되는 일이라
 * [현상-원인-해결책] 문장의 «거절»(400)이고, 그 밖의 오류는 500이다(응답에 DB 오류 원문을 싣지 않는다. 원문은 로그에만 남는다).
 */
import {
  DEFAULT_INVENTORY_POLICY,
  INVENTORY_MAX_SLOTS_INVALID_PREFIX,
  INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX,
  updateInventoryMaxSlots,
} from '@/lib/inventory/policy'
import { dbNumber } from './fields'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceSnapshot,
  type BalanceWriteResult,
} from './types'

export const INVENTORY_SECTION_ID = 'inventory'

export const MAX_SLOTS_KEY = 'max_slots'

const LOG = '[admin/balance]'

/** 칸 정의. 범위는 마이그레이션 129의 CHECK(`max_slots >= 1`)와 같다(정수 상한은 DB `INTEGER` 한계). */
export const INVENTORY_FIELDS: readonly BalanceFieldDef[] = [
  {
    key: MAX_SLOTS_KEY,
    label: '인벤토리 최대치',
    unit: '개',
    hint: '유저 한 명이 가질 수 있는 아이템 배지의 최대 개수예요.',
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_INVENTORY_POLICY.max_slots,
    affectsDisclosure: false,
  },
]

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다). */
export const INVENTORY_SELECT = 'max_slots, updated_at'

/** 거절 문장의 머리. 옛 라우트(`app/api/admin/inventory-policy/route.ts`)가 쓰던 문장과 같은 뜻이다. */
const REJECTED_HEAD = '인벤토리 최대치가 저장되지 않았어요.'

export const INVENTORY_INVALID_MESSAGE = `${REJECTED_HEAD} 값이 1 이상의 정수가 아니에요. 값을 확인하고 다시 저장해 주세요.`

/** `INVENTORY_MAX_SLOTS_OVER_LIMIT:` 뒤의 이유(RPC가 센 유저 수와 새 최대치가 들어 있다)를 [현상-원인-해결책] 문장으로 만든다. */
export function inventoryOverLimitMessage(reason: string): string {
  return `${REJECTED_HEAD} ${reason} 더 큰 값을 입력하거나, 해당 유저의 아이템을 정리한 뒤 다시 저장해 주세요.`
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** `inventory_policy` id=1을 가공 없이 읽는다. 행이 없거나 숫자가 아니면 던진다(기본값으로 바꿔 보이지 않는다). */
async function readPolicy(service: BalanceServiceClient): Promise<BalanceSnapshot> {
  const { data, error } = await service.from('inventory_policy').select(INVENTORY_SELECT).eq('id', 1).maybeSingle()
  if (error) throw new Error(`인벤토리 정책 조회 실패: ${error.message}`)
  if (!data) throw new Error('인벤토리 정책 조회 실패: id=1 행이 없음')
  const maxSlots = dbNumber(data.max_slots)
  if (maxSlots === null) throw new Error(`인벤토리 정책 조회 실패: ${MAX_SLOTS_KEY} 값을 숫자로 읽을 수 없음`)
  return { values: { [MAX_SLOTS_KEY]: maxSlots }, updatedAt: data.updated_at }
}

export const INVENTORY_BINDING: BalanceSectionBinding = {
  id: INVENTORY_SECTION_ID,
  fields: INVENTORY_FIELDS,
  validators: { [MAX_SLOTS_KEY]: (n: number) => Number.isInteger(n) && n >= 1 },

  read: readPolicy,

  async write(service, input): Promise<BalanceWriteResult> {
    const maxSlots = input.values[MAX_SLOTS_KEY]
    if (maxSlots === undefined) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    // ① 화면이 본 수정 시각이 아직 같은지 다시 확인한다(RPC가 조건을 받지 않아 근사다. 위 «알려진 한계»)
    let current: BalanceSnapshot
    try {
      current = await readPolicy(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (current.updatedAt !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    // ② 기존 경로 그대로: 기존 유저 전원과 정책 행을 RPC 하나가 한 트랜잭션에서 바꾼다
    try {
      await updateInventoryMaxSlots(maxSlots, service)
    } catch (e) {
      const detail = messageOf(e)
      if (detail.startsWith(INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX)) {
        const reason = detail.slice(INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX.length).trim()
        return { ok: false, reason: 'rejected', message: inventoryOverLimitMessage(reason) }
      }
      if (detail.startsWith(INVENTORY_MAX_SLOTS_INVALID_PREFIX)) {
        return { ok: false, reason: 'rejected', message: INVENTORY_INVALID_MESSAGE }
      }
      return { ok: false, reason: 'error', message: detail }
    }

    // ③ RPC가 올린 수정 시각을 읽어 돌려준다. 읽지 못해도 값은 이미 바뀌었으므로 실패로 답하지 않는다
    try {
      return { ok: true, updatedAt: (await readPolicy(service)).updatedAt }
    } catch (e) {
      console.error(`${LOG} ${INVENTORY_SECTION_ID} 저장 뒤 수정 시각을 읽지 못함 — 이번 저장의 시각으로 답한다:`, messageOf(e))
      return { ok: true, updatedAt: input.nextUpdatedAt }
    }
  },
}
