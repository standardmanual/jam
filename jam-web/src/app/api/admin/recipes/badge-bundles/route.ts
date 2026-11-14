import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  bundleBadgeIds,
  groupItemBadgeBundles,
  incompleteBundleReason,
  type BundleBadgeInput,
} from '@/lib/admin/recipe-grade-bundles'

const MAX_BUNDLES = 20
/** 후보를 찾는 1차 조회에서 읽는 배지 수 — 묶음 20개 × 4등급에 중복 여유를 더한 값이다 */
const SEED_LIMIT = 120

/**
 * 등급 대응형 레시피 양식의 «아이템 배지 묶음» 검색 API(티켓 20261114_1705 2회차). 같은 컬렉션·같은 이름의 아이템 배지를 묶음으로 돌려주고,
 * 4등급이 모두 갖춰진 묶음(`complete`)만 양식이 고를 수 있게 한다. 갖춰지지 않은 묶음도 이유와 함께 내려 «왜 못 고르는지» 보이게 한다.
 * 이름 검색이나 트라이브·컬렉션 필터가 하나는 있어야 한다(전체 조회는 Max Rows 절단 때문에 막는다, `badges/search`와 같은 이유).
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('query') ?? '').trim()
  const tribeId = req.nextUrl.searchParams.get('tribe_id')
  const itemBookId = req.nextUrl.searchParams.get('item_book_id')
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query && !tribeId && !itemBookId) return NextResponse.json({ bundles: [] })

  const supabase = createServiceClient()
  const columns = 'id, name, rarity, item_book_id'

  let seedQuery = supabase
    .from('badges')
    .select(columns)
    .eq('type', 'item')
    .not('item_book_id', 'is', null)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(SEED_LIMIT)
  if (query) seedQuery = seedQuery.ilike('name', `%${query}%`)
  if (tribeId) seedQuery = seedQuery.eq('tribe_id', tribeId)
  if (itemBookId) seedQuery = seedQuery.eq('item_book_id', itemBookId)

  const { data: seedRaw, error: seedError } = await seedQuery
  if (seedError) return NextResponse.json({ error: seedError.message }, { status: 500 })
  const seeds = (seedRaw ?? []) as BundleBadgeInput[]

  // 필터에 걸린 배지만으로는 묶음의 나머지 등급이 빠질 수 있다. 상한 안에 든 묶음의 형제를 컬렉션·이름으로 다시 읽어
  // 4등급이 갖춰졌는지 정확히 가른다.
  const seedBundles = groupItemBadgeBundles(seeds)
  const truncated = seedBundles.length > MAX_BUNDLES || seeds.length >= SEED_LIMIT
  const picked = seedBundles.slice(0, MAX_BUNDLES)
  if (picked.length === 0) return NextResponse.json({ bundles: [], truncated: false })

  const bookIds = [...new Set(picked.map((b) => b.itemBookId))]
  const names = [...new Set(picked.map((b) => b.name))]
  const { data: siblingsRaw, error: siblingsError } = await supabase
    .from('badges')
    .select(columns)
    .eq('type', 'item')
    .in('item_book_id', bookIds)
    .in('name', names)
    .is('deleted_at', null)
  if (siblingsError) return NextResponse.json({ error: siblingsError.message }, { status: 500 })

  const pickedKeys = new Set(picked.map((b) => b.key))
  const bundles = groupItemBadgeBundles((siblingsRaw ?? []) as BundleBadgeInput[])
    .filter((b) => pickedKeys.has(b.key))
    .map((b) => ({
      key: b.key,
      name: b.name,
      itemBookId: b.itemBookId,
      complete: b.complete,
      badgeIds: bundleBadgeIds(b),
      reason: incompleteBundleReason(b),
    }))
    .sort((a, b) => Number(b.complete) - Number(a.complete) || a.name.localeCompare(b.name, 'ko'))

  return NextResponse.json({ bundles, truncated })
}
