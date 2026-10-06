/**
 * GET /api/admin/item-paths — 컬렉션별 아이템 얻을 길 읽기 (티켓 20261004_1641, 상위 20260930_1503 ⑦b, 운영툴 PRD §11.11)
 *
 * 요청 때 읽기(`lib/admin/itemPaths/load.ts`)와 계산(⑦a `lib/admin/itemPaths/compute.ts`)을 거쳐 컬렉션 단위로 쪽을 나눠 돌려준다. 저장하지 않는다.
 * 이 라우트는 인증·쿼리 읽기·쪽 나누기·응답만 맡는다. `compute.ts`는 서버 전용 모듈(`lib/missions/checker.ts`)을 값으로 가져오므로 서버인 이 라우트에서만 부른다
 * (클라이언트 컴포넌트가 값으로 가져오지 않는다).
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다.**
 * - 쿼리 `limit`(1~50, 기본 10)·`offset`(0 이상, 기본 0): 컬렉션 개수 기준의 쪽 나누기다. 정수가 아니거나 범위 밖이면 400이고 읽지 않는다.
 * - 쿼리 `onlyBlocked=true`일 때만 막힘(`blocked`) 아이템이 있는 컬렉션만 싣고, 그 컬렉션의 `items`도 막힘 아이템만 싣는다(개수 칸은 컬렉션 전체 기준 그대로).
 *   「드랍 제외」(`drop_excluded`)는 막힘과 다른 상태라 `onlyBlocked`에 들어가지 않는다.
 * - 원천 하나라도 읽지 못하면 500이다. 읽지 못한 길을 「닫힘」으로 바꿔 아이템이 막힘으로 보이게 하지 않는다.
 * - 응답에 관리자 ID를 싣지 않는다(읽지도 않는다).
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { computeItemPaths } from '@/lib/admin/itemPaths/compute'
import { ITEM_PATH_LOAD_FAILED_MESSAGE, loadItemPathInputs } from '@/lib/admin/itemPaths/load'
import type { ItemPathResult } from '@/lib/admin/itemPaths/types'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const QUERY_INVALID_MESSAGE = 'limit은 1부터 50까지, offset은 0 이상의 정수로 보내 주세요.'

/** 숫자만 있는 문자열을 범위 안의 정수로 읽는다. 값이 없으면 기본값, 형식이나 범위가 틀리면 null */
function readIntParam(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return value >= min && value <= max ? value : null
}

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const limit = readIntParam(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = readIntParam(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)
  if (limit === null || offset === null) {
    return NextResponse.json({ error: QUERY_INVALID_MESSAGE }, { status: 400 })
  }
  const onlyBlocked = params.get('onlyBlocked') === 'true'

  try {
    const now = new Date()
    const inputs = await loadItemPathInputs(createServiceClient(), now)
    const computed = computeItemPaths({ ...inputs, now })

    const itemsByCollection = new Map<string, ItemPathResult[]>()
    for (const result of computed.items) {
      const list = itemsByCollection.get(result.collectionId)
      if (list) list.push(result)
      else itemsByCollection.set(result.collectionId, [result])
    }

    const entries = computed.collections
      .filter((summary) => !onlyBlocked || summary.blocked > 0)
      .map((summary) => {
        const items = itemsByCollection.get(summary.collectionId) ?? []
        return { ...summary, items: onlyBlocked ? items.filter((item) => item.status === 'blocked') : items }
      })

    const page = entries.slice(offset, offset + limit)
    const nextOffset = offset + limit < entries.length ? offset + limit : null
    return NextResponse.json({
      now: now.toISOString(),
      total: entries.length,
      limit,
      offset,
      nextOffset,
      collections: page,
    })
  } catch (error) {
    console.error('[admin/item-paths] 얻을 길 조회 실패:', error)
    return NextResponse.json({ error: ITEM_PATH_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
