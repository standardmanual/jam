import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE,
  activityBadgeImageSearchRange,
  activityBadgeImageSearchTotalPages,
  parseActivityBadgeImageSearchParams,
  pickActivityBadgeImageSearchPage,
} from '@/lib/admin/activityBadgeImageSearch'
import { isLeveledBadge } from '@/lib/badge-engine/badgeKind'
import { toStudioBadgeFields } from '@/lib/admin/activityBadgeTemplate/studioBadge'
import type { ActivityType, BadgeCondition, BadgeRarity } from '@/types/database'
import type { Json } from '@/types/database.generated'

/**
 * 액티비티 배지 이미지 생성 — 검색 API (티켓 20260902_1613)
 *
 * `type='activity'` 배지만 대상으로 한다. 체크인 검색(`/api/admin/badge-image/search`)과 달리
 * POI 조인이 없어 구조가 단순하다 — 대신 **등급·활동 종목을 반드시 함께 돌려준다.** 액티비티
 * 배지는 이름이 중복되기 때문이다(예: 「이달의 산책왕」이 common·epic 2건). 이름만 보여주면
 * 운영자가 어느 배지를 고르는지 판단할 수 없다.
 *
 * ## 페이징 (티켓 20260905_0032 C-1)
 * 예전에는 「액티비티 배지는 전체 207건 규모라 필터 없이도 목록을 훑을 수 있다」는 전제로
 * 상한 50건 + `truncated` 플래그만 뒀다. **v5는 164계열 550종이라 그 전제가 깨진다** —
 * 상위 50건만 보이고 나머지는 검색어로 맞히지 못하면 도달할 수 없었다. 이제 `page`로
 * 끝까지 넘길 수 있고, 응답이 `total`을 함께 준다.
 *
 * ## 레벨형 (`rarity IS NULL`)
 * 무한레벨형은 등급이 없다(마이그레이션 130). 등급을 필수로 보고 있던 응답 형태를 nullable로
 * 바꾸고 `level`을 함께 돌려준다 — 화면이 등급 대신 「Lv.N」으로 고를 수 있어야 한다.
 * 종류 판정은 `badgeKind.ts`의 `isLeveledBadge`가 단일 출처다(여기서 다시 선언하지 않는다).
 */

interface BadgeRow {
  id: string
  name: string
  description: string
  rarity: BadgeRarity | null
  level: number | null
  activity_types: string[] | null
  image_url: string | null
  image_gen_params: Json | null
  condition_json: BadgeCondition | null
  is_hidden: boolean | null
  family_key: string | null
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  // 요청 해석·페이징 산술은 순수 모듈이 단일 출처다(테스트가 그 모듈을 직접 고정한다).
  const { q, rarity, activityType, kind, familyKey, templateClass, page } = parseActivityBadgeImageSearchParams(body)

  const supabase = createServiceClient()

  // 조건을 거는 부분을 함수로 묶는다 — Supabase 질의는 한 번 쓰면 다시 쓸 수 없어 읽을 때마다 새로 만든다.
  const buildQuery = () => {
    let query = supabase
      .from('badges')
      .select('id, name, description, rarity, level, activity_types, image_url, image_gen_params, condition_json, is_hidden, family_key', {
        count: 'exact',
      })
      .eq('type', 'activity')
      .is('deleted_at', null)
      // JAM! 카테고리(admin_category='jam') 배지도 후보에 둔다. 예전에는 «배경 이미지가 필요 없다»며
      // 제외했지만(티켓 20260910_2055), 지금 화면은 분류별 템플릿으로 이미지를 만들어 등록하므로
      // 이 배지들도 조회돼야 한다(티켓 20261118_1254, jam 70건·17이름이 검색되지 않았다).

    if (q) query = query.ilike('name', `%${q}%`)
    // 레벨형 ⇔ `rarity IS NULL`(`badgeKind.ts`의 `isLeveledBadge`)을 SQL로 투영한 것이다.
    // 등급 필터는 `parseActivityBadgeImageSearchParams`가 레벨형일 때 이미 떨어뜨린다.
    if (kind === 'leveled') query = query.is('rarity', null)
    else if (kind === 'graded') query = query.not('rarity', 'is', null)
    if (rarity) query = query.eq('rarity', rarity)
    // activity_types는 text[] — 배열에 해당 종목이 들어 있는 배지만 남긴다.
    if (activityType) query = query.contains('activity_types', [activityType])

    // 같은 계열의 단계를 한꺼번에 불러올 때 쓴다(티켓 20261116_0728). 다른 조건과 함께 걸 수 있다.
    if (familyKey) query = query.eq('family_key', familyKey)

    // 이름이 중복되는 배지가 많아 이름만으로는 페이지 경계에서 순서가 흔들린다 —
    // 레벨·id까지 정렬키에 넣어 페이지를 넘겨도 같은 행이 두 번 나오거나 빠지지 않게 한다.
    return query.order('name').order('level', { ascending: true, nullsFirst: true }).order('id')
  }

  const toItem = (row: BadgeRow) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    level: row.level,
    leveled: isLeveledBadge(row),
    activityTypes: (row.activity_types ?? []) as ActivityType[],
    hasImage: Boolean(row.image_url),
    // 결과 표의 썸네일 주소(티켓 20261116_1640). 비어 있으면 null이다.
    imageUrl: row.image_url || null,
    // 템플릿 분류·값·계열 키와 배지에 저장된 템플릿 조정값을 함께 싣는다.
    ...toStudioBadgeFields(row),
  })

  const DB_FAIL = '배지를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.'
  let badges: ReturnType<typeof toItem>[]
  let total: number

  if (templateClass) {
    // 분류는 DB 칸이 아니라 획득 조건에서 계산하는 값이다 — 다른 조건에 맞는 배지를 1,000줄씩
    // 끝까지 읽어 분류를 계산하고, 걸러 낸 뒤 페이지를 자른다.
    const READ_SIZE = 1000
    const all: ReturnType<typeof toItem>[] = []
    for (let offset = 0; ; offset += READ_SIZE) {
      const { data, error } = await buildQuery().range(offset, offset + READ_SIZE - 1)
      if (error) return NextResponse.json({ error: DB_FAIL }, { status: 500 })
      const rows = (data ?? []) as unknown as BadgeRow[]
      all.push(...rows.map(toItem))
      if (rows.length < READ_SIZE) break
    }
    const picked = pickActivityBadgeImageSearchPage(all, templateClass, page)
    badges = picked.items
    total = picked.total
  } else {
    const { from, to } = activityBadgeImageSearchRange(page)
    const { data, error, count } = await buildQuery().range(from, to)
    if (error) return NextResponse.json({ error: DB_FAIL }, { status: 500 })
    badges = ((data ?? []) as unknown as BadgeRow[]).map(toItem)
    total = count ?? 0
  }

  return NextResponse.json({
    badges,
    total,
    page,
    pageSize: ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE,
    totalPages: activityBadgeImageSearchTotalPages(total),
  })
}
