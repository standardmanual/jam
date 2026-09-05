import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findBadgeConditionSaveError, findRarityLevelError } from '@/lib/admin/badge-validation'
import { isValidFamilyKey } from '@/lib/admin/badge-families'
import type { BadgeRow } from '@/types/database'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  // 티켓 20260825_029: 전체 배지(현재 5585건, 소프트 삭제 포함)를 `.limit(5000)`으로
  // 조회했으나 PostgREST 서버 설정(db-max-rows, 기본 1000)은 클라이언트가 요청한 limit보다
  // 우선한다 — 실제로는 created_at 내림차순 최신 1000건만 돌아온다. 이 엔드포인트는
  // BadgeForm.tsx(같은 북+등급 내 drop_weight 합산 미리보기)와 ItemBookForm.tsx(일괄 배경
  // 적용 전 대상 배지 수 미리보기)에서 응답 전체를 클라이언트에서 필터링해 쓰므로, 오래된
  // 배지가 잘려나가면 두 미리보기 숫자가 실제보다 적게 계산되는 오판으로 이어진다.
  // range로 페이지를 끝까지 넘겨 전량을 가져온다.
  const PAGE_SIZE = 1000
  const all: BadgeRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: pageRaw, error } = await supabase
      .from('badges')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const page = (pageRaw ?? []) as BadgeRow[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return NextResponse.json({ badges: all })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, type, rarity, level, family_key, sort_order, image_url, activity_types, patch_available, patch_price_krw, condition_json, faction_id, item_book_id, category, drop_weight, valid_from, valid_until, point_reward, background_color, background_shader_id, background_image_url, background_video_url, background_animation } = body

  // `rarity`는 더 이상 필수가 아니다 — 무한레벨형 배지는 `rarity IS NULL` + `level`이다
  // (마이그레이션 130). 이 검사가 `!rarity`를 요구하는 동안 어드민은 **레벨형 배지를 아예
  // 만들 수 없었다**(티켓 20260905_0032 A-3). 둘 중 하나가 있는지는 아래에서 따로 본다.
  if (!name || !description || !type || !image_url) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  // 등급형/레벨형 배타 — DB CHECK(badges_rarity_level_exclusive) 위반 시 Postgres 원문이
  // 그대로 어드민 화면에 뜨지 않도록 사람이 읽을 수 있는 문구로 먼저 막는다.
  const rarityLevelError = findRarityLevelError(rarity ?? null, level ?? null)
  if (rarityLevelError) {
    return NextResponse.json({ error: rarityLevelError }, { status: 400 })
  }

  // 계열 키는 **생성 시에만** 실린다(PUT은 병합하지 않는다 — 티켓 20260905_0032 판단 ③).
  // 계열 관리 화면의 「레벨 추가」가 같은 계열에 새 자리를 만들 때 이 값을 넘긴다. 값이
  // 없으면 예전 그대로 NULL이고, `familyKeyOf`의 `#name:` 폴백으로 묶인다.
  const familyKey = typeof family_key === 'string' && family_key.trim() ? family_key.trim() : null
  if (familyKey && !isValidFamilyKey(familyKey)) {
    return NextResponse.json(
      { error: `저장할 수 없습니다. 계열 키 형태(${familyKey})가 올바르지 않습니다. "종목:이름" 형태로, 쉼표 없이 입력해주세요.` },
      { status: 400 }
    )
  }

  // 「저장은 되는데 영원히 안 나오는 배지」 3경로를 저장 시점에 막는다(티켓 20260905_0032 A-1).
  // 교차 게이트의 «자기 계열 지정» 판정에 쓰이므로 이번 요청에 실린 계열 키를 함께 넘긴다.
  const conditionError = findBadgeConditionSaveError(
    { name, family_key: familyKey },
    type,
    condition_json ?? null
  )
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = {
    name,
    description,
    type,
    // 등급형은 rarity, 레벨형은 level — 정확히 하나만 값이 있다(위 findRarityLevelError).
    // 빈 문자열이 CHECK를 통과하지 못하도록 «없음»은 항상 null로 정규화한다.
    rarity: rarity || null,
    level: level === undefined || level === null || level === '' ? null : Math.trunc(Number(level)),
    family_key: familyKey,
    // ⚠️ `sort_order = 0`은 «미설정»이라 배지 트리에서 **맨 뒤로 밀린다** — 이 저장소의 다른
    // sort_order(today_cards·factions·item_books, 0이 앞)와 반대 관습이다(마이그레이션 130).
    // 계열에 새 자리를 추가할 때 계열의 값을 물려주지 않으면 그 배지만 계열에서 떨어진다.
    sort_order: Number.isFinite(Number(sort_order)) ? Math.max(0, Math.trunc(Number(sort_order))) : 0,
    image_url,
    activity_types: activity_types ?? [],
    patch_available: patch_available ?? false,
    patch_price_krw: patch_price_krw ?? null,
    // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
    condition_json: type === 'checkin' ? null : condition_json ?? null,
    // 체크인 배지에는 세계관/컬렉션 개념이 없다 — 저작 화면(BadgeForm)에서도 정리하지만
    // 서버에서도 같은 규칙을 강제한다(20260830_1344).
    faction_id: type === 'checkin' ? null : faction_id ?? null,
    item_book_id: type === 'checkin' ? null : item_book_id ?? null,
    // 배지 카테고리는 체크인 배지 전용(poi_categories.slug 재사용, 마이그레이션 113).
    category: type === 'checkin' ? category ?? null : null,
    drop_weight: drop_weight ?? 1.0,
    valid_from: valid_from ?? null,
    valid_until: valid_until ?? null,
    point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
    background_color: background_color ?? null,
    background_shader_id: background_shader_id ?? null,
    // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
    // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
    // 그대로 반영한다(20260819_012).
    background_image_url: background_image_url ?? null,
    background_video_url: background_video_url ?? null,
    // [20260901_1944] 이미지 카드 안에서 라이브 실행하는 애니메이션 파라미터(jsonb). 위 4필드가
    // 상세화면 전체 배경 레이어용인 것과 렌더링 지점이 다르며, 우선순위 판단은
    // lib/badgeBackgroundTheme.ts 한 곳에 있다.
    background_animation: background_animation ?? null,
  }
  const badgesQuery = supabase.from('badges')
  const insertQuery = badgesQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data }, { status: 201 })
}
