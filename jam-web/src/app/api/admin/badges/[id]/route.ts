import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findBadgeConditionSaveError, findRarityLevelError } from '@/lib/admin/badge-validation'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'
import { BADGE_REFERENCE_SOURCES, collectBadgeReferences } from '@/lib/admin/badge-references'
import type { BadgeRow } from '@/types/database'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const supabase = createServiceClient()

  // 부분 body 병합을 위해 기존 row를 먼저 조회한다 — body에 없는(undefined) 필드는 기존 값을
  // 그대로 유지한다(20260827_011, factions·item_books PUT과 동일 패턴). 존재하지 않는 id면
  // update 시도 전에 404로 응답한다.
  const { data: existingData, error: fetchError } = await supabase
    .from('badges')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existingData) return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  const existing = existingData as BadgeRow

  // type·condition_json은 조건부 강제 null 로직(아래 update 참조)에서 함께 쓰이므로 먼저
  // 병합해둔다 — 병합된 값에 조건부 로직을 적용하는 것이지, 조건부 로직 자체를 단순 병합으로
  // 대체하는 게 아니다.
  const type = body.type !== undefined ? body.type : existing.type
  const conditionJson = body.condition_json !== undefined ? body.condition_json : existing.condition_json

  // 등급형/레벨형도 먼저 병합해 둔다 — 둘은 배타라 한쪽만 보내면 판정이 어긋난다
  // (예: 레벨형을 등급형으로 바꾸려면 `rarity`와 `level`이 같은 요청에 함께 실려야 한다).
  const rarity = body.rarity !== undefined ? body.rarity : existing.rarity
  const rawLevel = body.level !== undefined ? body.level : existing.level
  const level = rawLevel === null || rawLevel === undefined || rawLevel === '' ? null : Math.trunc(Number(rawLevel))

  const rarityLevelError = findRarityLevelError(rarity || null, level)
  if (rarityLevelError) {
    return NextResponse.json({ error: rarityLevelError }, { status: 400 })
  }

  // 「저장은 되는데 영원히 안 나오는 배지」 3경로 차단 (티켓 20260905_0032 A-1).
  // 교차 게이트의 «자기 계열 지정» 판정에 필요하므로 이 배지의 name·family_key를 함께 넘긴다.
  const conditionError = findBadgeConditionSaveError(
    { name: body.name !== undefined ? body.name : existing.name, family_key: existing.family_key },
    type,
    conditionJson ?? null
  )
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('badges')
    .update({
      name: body.name !== undefined ? body.name : existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      type,
      rarity: rarity || null,
      level,
      // `family_key`는 **의도적으로 병합하지 않는다** — 2단 교차 게이트가 대상 계열을
      // family_key로 지정하므로 이름을 고쳐도 키가 바뀌면 게이트 참조가 조용히 끊긴다
      // (티켓 20260905_0032 판단 ③: 생성 시 발급하고 이후 불변).
      image_url: body.image_url !== undefined ? body.image_url : existing.image_url,
      activity_types: body.activity_types !== undefined ? body.activity_types : existing.activity_types,
      patch_available: body.patch_available !== undefined ? body.patch_available : existing.patch_available,
      patch_price_krw: body.patch_price_krw !== undefined ? body.patch_price_krw : existing.patch_price_krw,
      // POI 배지는 "어느 POI를 지나갔는가"로만 판정 — 활동 조건이 섞이지 않도록 강제 null
      condition_json: type === 'checkin' ? null : conditionJson,
      // 체크인 배지에는 세계관/컬렉션 개념이 없다 — 저작 화면(BadgeForm)에서도 정리하지만
      // 서버에서도 같은 규칙을 강제한다(20260830_1344).
      faction_id: type === 'checkin' ? null : (body.faction_id !== undefined ? body.faction_id : existing.faction_id),
      item_book_id: type === 'checkin' ? null : (body.item_book_id !== undefined ? body.item_book_id : existing.item_book_id),
      // 배지 카테고리는 체크인 배지 전용(poi_categories.slug 재사용, 마이그레이션 113).
      category: type === 'checkin' ? (body.category !== undefined ? body.category : existing.category) : null,
      drop_weight: body.drop_weight !== undefined ? body.drop_weight : existing.drop_weight,
      valid_from: body.valid_from !== undefined ? body.valid_from : existing.valid_from,
      valid_until: body.valid_until !== undefined ? body.valid_until : existing.valid_until,
      point_reward:
        body.point_reward !== undefined
          ? Math.max(0, Math.trunc(Number(body.point_reward) || 0))
          : existing.point_reward,
      background_color: body.background_color !== undefined ? body.background_color : existing.background_color,
      background_shader_id:
        body.background_shader_id !== undefined ? body.background_shader_id : existing.background_shader_id,
      // 배경 3모드(단색 / 정적 제너레이터 / 애니메이션 제너레이터)는 상호 배타적이라 선택하지 않은
      // 쪽은 항상 null로 정리된다 — 정리 책임은 저작 화면(BadgeForm)에 있고, 여기서는 넘어온 값을
      // 그대로 반영한다(20260819_012). body에 없는(undefined) 부분 body는 기존 값을 유지한다
      // (20260827_011).
      background_image_url:
        body.background_image_url !== undefined ? body.background_image_url : existing.background_image_url,
      background_video_url:
        body.background_video_url !== undefined ? body.background_video_url : existing.background_video_url,
      // [20260901_1944] 애니메이션 해제는 body에 명시적 null이 실려 온다 — undefined(필드 생략)와
      // 구분해야 "해제"가 저장된다. 아래 병합은 그 구분을 유지한다.
      background_animation:
        body.background_animation !== undefined ? body.background_animation : existing.background_animation,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ badge: data })
}

/**
 * 하드 삭제 — 이력이 전혀 없는 배지만 badges 행 자체를 실제로 DELETE한다(20260830_1912).
 * 과거에는 이 엔드포인트도 deleted_at만 세팅하는 소프트 삭제였는데, PATCH(비활성화 토글)와
 * 완전히 동일한 동작이라 "삭제" 버튼을 눌러도 이미 비활성 상태면 아무 변화가 없어 보이는
 * 문제가 있었다(20260830_1912 신고).
 *
 * **참조를 세는 목록은 `lib/admin/badge-references.ts`가 단일 출처다**(티켓 20260905_0034).
 * 예전에는 이 파일이 6곳을 직접 세고 있었고, 거기 빠져 있던
 * `point_transactions.source_badge_id`(ON DELETE NO ACTION)가 하드 삭제를 FK 위반으로
 * 실패시켜 raw Postgres 에러가 500으로 새어 나갔다. 일괄 작업 도구와 같은 함수를 쓰므로
 * 한쪽만 고쳐지는 일이 없다.
 *
 * 차단 기준은 두 단계다:
 * - **FK NO ACTION**(획득 이력·인벤토리·드랍·포인트 원장·지점 연결·레시피 보유 조건) 또는
 *   **CASCADE**(체크인 획득 이력·컬렉션 슬롯) 참조 → 실패하거나 유저 기록이 조용히 사라진다.
 * - FK 없는 느슨한 참조(미션 보상·미션 게이트·투데이 카드·레시피 재료 uuid[]) → 삭제는
 *   되지만 끊어진 id가 콘텐츠에 남는다. 참조 정리를 먼저 하도록 안내한다.
 *
 * 이력 보존형 강제 삭제(위 FK를 nullable + ON DELETE SET NULL로 바꾸는 스키마 마이그레이션)는
 * 이번 범위 밖이다 — 참조가 하나라도 있으면 차단하고 비활성화 사용을 안내한다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  // 존재 여부를 먼저 확인한다 — select 없이 바로 update/delete만 실행하면 매칭 0건에도
  // Supabase가 에러를 주지 않아 존재하지 않는 id에도 조용히 성공 응답이 나갔다(20260827_012).
  const { data: existing, error: fetchError } = await supabase
    .from('badges')
    .select('id')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 참조 카운트는 `lib/admin/badge-references.ts` **한 곳**에 모았다 — 일괄 작업 도구
  // (`api/admin/badges/bulk`)와 같은 함수를 쓴다(티켓 20260905_0034). 예전에는 이 핸들러가
  // 6곳만 세고 있어서, `point_transactions.source_badge_id`(ON DELETE NO ACTION) 참조가
  // 있으면 사전 체크를 통과한 뒤 DELETE가 FK 위반으로 실패하고 **raw Postgres 에러 문자열이
  // 500으로 그대로 노출**됐다. 미션 보상·미션 게이트·투데이 카드·레시피 재료(uuid[])도 빠져
  // 있어, 삭제는 되지만 끊어진 id가 콘텐츠에 남았다.
  const references = await collectBadgeReferences(supabase, [id])

  // 한 자리라도 조회가 실패하면 fail-closed로 하드 삭제를 막는다. CASCADE 참조
  // (user_checkin_badge_earns·user_item_book_slots)를 0건으로 오판하면 유저의 획득 기록·
  // 슬롯 진행 기록이 FK 위반 없이 조용히 사라진다 — 이 가드가 막으려던 시나리오 그 자체다.
  if (references.error) {
    console.error('[badges DELETE] 참조 카운트 조회 실패 — 하드 삭제를 차단합니다:', references.error)
    return NextResponse.json(
      { error: '삭제할 수 없습니다. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.' },
      { status: 500 }
    )
  }

  // 참조가 있는 자리를 사람이 읽을 이름으로 모은다 — 어드민이 어디를 먼저 정리해야 하는지
  // 알 수 있어야 한다([현상]→[원인]→[해결책], UX_WRITING_GUIDELINE.md).
  const hitLabels = BADGE_REFERENCE_SOURCES.filter((s) => references.counts[s.key] > 0)
    .map((s) => `${s.label} ${references.counts[s.key]}건`)
    .join(', ')

  // FK가 막거나(NO ACTION) 조용히 함께 지워지는(CASCADE) 참조 — 예전과 같은 차단 사유다.
  const hardBlocking = references.blockingTotal + references.cascadeTotal
  if (hardBlocking > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이미 ${hardBlocking}건의 발급·드랍·지점 연결 이력이 있는 배지입니다(${hitLabels}). 비활성화를 이용해주세요.`,
      },
      { status: 409 }
    )
  }

  // FK가 없는 느슨한 참조(미션 보상·미션 게이트·투데이 카드·레시피 재료 등)만 남은 경우.
  // 삭제 자체는 성공하지만 **끊어진 배지 id가 콘텐츠에 남는다** — 먼저 정리하게 한다.
  if (references.total > 0) {
    return NextResponse.json(
      {
        error: `삭제할 수 없습니다. 이 배지를 가리키는 콘텐츠가 ${references.total}건 있습니다(${hitLabels}). 배지 일괄 작업 도구의 참조 정리에서 먼저 해제해주세요.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('badges').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이력 0건 조건에 poi_drops도 포함돼 있어 여기 도달했다면 무효화할 미픽업 드랍은 사실상
  // 없지만, 방어적으로 유지한다(20260830_1912) — 호출 자체는 badgeIds가 매칭되지 않으면
  // no-op이라 비용이 거의 없다.
  await invalidateUnclaimedDrops(supabase, [id], 'admin badges DELETE')

  return NextResponse.json({ ok: true })
}

/**
 * 목록/상세 화면의 즉시 토글용(20260823_006). body: { active: boolean }.
 * active: false → deleted_at = now() (소프트 삭제 — 가역적). active: true → deleted_at = null
 * (되살리기).
 * DELETE 핸들러와는 별개의 동작이다(20260830_1912부터) — DELETE는 이력 없는 배지만 실제
 * 하드 삭제하고, 이력이 있으면 차단한다. 이 PATCH는 이력 유무와 무관하게 항상 소프트
 * 삭제/복원만 수행하는 가역적 토글로 그대로 유지한다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { active } = body as { active?: boolean }

  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active는 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    .update({ deleted_at: active ? null : new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  // update-후-select 구조라 존재하지 않는 id에도 update 자체(무매칭)는 실행되지만, select
  // 단계에서 실패한다 — 이 경우 raw 500 대신 404로 응답하고, 무효화 호출 이전에 반환해
  // invalidateUnclaimedDrops가 존재하지 않는 id에 대해 실행되지 않도록 한다(20260827_012).
  if (error || !data) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 비활성화(active: false) 방향일 때만 미픽업 드랍을 함께 무효화한다. active: true로
  // 되살릴 때는 드랍을 자동 부활시키지 않는다 — 관리자가 명시적으로 새로 드랍해야 한다.
  if (!active) {
    await invalidateUnclaimedDrops(supabase, [id], 'admin badges PATCH')
  }

  return NextResponse.json({ badge: data })
}
