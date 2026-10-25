import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import {
  findBadgeConditionSaveError,
  findConditionShapeSaveWarning,
  findCheckinBadgeNamesNotFoundError,
  findHiddenBadgeReferenceError,
  findRecipeFirstSuccessNotFoundError,
  findRarityLevelError,
} from '@/lib/admin/badge-validation'
import { isValidFamilyKey } from '@/lib/admin/badge-families'
import { buildBadgeInsertPayload, normalizeFamilyKey } from '@/lib/admin/badge-insert-payload'
import { findBranchKeyError, findHiddenBadgeError, normalizeIsHidden } from '@/lib/admin/badge-hidden-guard'
import { checkHiddenBadgeUsage } from '@/lib/missions/reward-badges'
import { findUnlockRequiredError, lockedMinimumsFrom, parseUnlockRequired } from '@/lib/admin/badge-lock-guard'
import { getJamPolicy } from '@/lib/jam/policy'
import { defaultPointFor } from '@/lib/admin/badge-point-defaults'
import { getBadgePointPolicy } from '@/lib/badge/pointPolicy'
import type { BadgeRow } from '@/types/database'

export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

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
  const { name, description, type, rarity, level, family_key, image_url, condition_json } = body

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
  const familyKey = normalizeFamilyKey(family_key)
  if (familyKey && !isValidFamilyKey(familyKey)) {
    return NextResponse.json(
      { error: `저장할 수 없습니다. 계열 키 형태(${familyKey})가 올바르지 않습니다. "종목:이름" 형태로, 쉼표 없이 입력해주세요.` },
      { status: 400 }
    )
  }

  // 가지 값과 숨김 배지 규칙 — 마이그레이션 243의 DB 제약과 같은 규칙을 한국어 문구로 먼저 막는다(티켓 20261018_1816).
  const branchKeyError = findBranchKeyError(body.branch_key)
  if (branchKeyError) return NextResponse.json({ error: branchKeyError }, { status: 400 })
  const hiddenError = findHiddenBadgeError({
    isHidden: body.is_hidden,
    type,
    rarity: rarity || null,
    pointReward: Math.max(0, Math.trunc(Number(body.point_reward) || 0)),
  })
  if (hiddenError) return NextResponse.json({ error: hiddenError }, { status: 400 })

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

  // 숨김 배지 사용처 검사 (티켓 20261019_1313 2회, 티켓 20261019_0012) — 숨김 배지는 받기 전에 이름이 보이면 안 되므로
  // ① 선행 배지·교차 게이트가 숨김 배지를 가리키면 저장하지 않고, ② 숨김으로 만드는 배지의 이름·계열이 이미
  // 다른 배지의 선행 배지·교차 게이트로 쓰이고 있어도 저장하지 않는다.
  const hiddenReferenceError = await findHiddenBadgeReferenceError({ name, family_key: familyKey }, condition_json ?? null, supabase)
  if (hiddenReferenceError) {
    return NextResponse.json({ error: hiddenReferenceError.error }, { status: hiddenReferenceError.status })
  }
  if (normalizeIsHidden(body.is_hidden)) {
    const usage = await checkHiddenBadgeUsage(supabase, { name, familyKey })
    if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status })
  }

  // 아이템 배지의 «여는 데 필요한 양»은 등급 최소값(jam_policy.locked_min_*)보다 적으면 저장하지 않는다.
  // 비우면 통과(발급 때 등급 최소값을 쓴다) — 값이 있을 때만 정책을 읽는다(티켓 20261018_0051 2회).
  if (type === 'item' && parseUnlockRequired(body.unlock_required) !== null) {
    const lockError = findUnlockRequiredError(
      type,
      rarity || null,
      body.unlock_required,
      lockedMinimumsFrom(await getJamPolicy(supabase))
    )
    if (lockError) return NextResponse.json({ error: lockError }, { status: 400 })
  }

  // 체크인 배지 이름 목록(checkin_badge_count) 검증 — DB 조회가 필요해 별도로 await한다
  // (티켓 20260914_1725, AC5).
  const checkinBadgeNamesError = await findCheckinBadgeNamesNotFoundError(condition_json ?? null, supabase)
  if (checkinBadgeNamesError) {
    return NextResponse.json({ error: checkinBadgeNamesError }, { status: 400 })
  }

  // 레시피 최초 성공(recipe_first_success)의 레시피 ID 형식·존재 검증 — 역시 DB 조회가 필요해 별도로
  // await한다(티켓 20261001_0631).
  const recipeFirstSuccessError = await findRecipeFirstSuccessNotFoundError(condition_json ?? null, supabase)
  if (recipeFirstSuccessError) {
    return NextResponse.json({ error: recipeFirstSuccessError }, { status: 400 })
  }

  // 포인트를 생략한 요청(계열 화면의 «단계 추가» 등)은 배지 포인트 일괄 값으로 채운다: 숨김이면 0, 레벨형이면 레벨형 값, 아니면 등급 값(티켓 20261022_1135).
  // 값이 있으면 그대로 쓴다. 공용 함수(buildBadgeInsertPayload)의 «없으면 0»은 운영툴 등록·에셋 스크립트도 쓰므로 바꾸지 않고 이 라우트에서 채운다.
  if (body.point_reward === undefined) {
    body.point_reward = defaultPointFor(
      { rarity: rarity || null, isLeveled: !rarity, isHidden: normalizeIsHidden(body.is_hidden) },
      await getBadgePointPolicy(supabase)
    )
  }

  // 페이로드 매핑은 등록 스크립트와 공용이다(lib/admin/badge-insert-payload.ts).
  const insertPayload = buildBadgeInsertPayload(body)
  const badgesQuery = supabase.from('badges')
  const insertQuery = badgesQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 저장은 됐지만 발급이 멈추는 회차 조건이면 경고를 함께 돌려준다(티켓 20261021_1426).
  // 엔진이 읽는 값 그대로(type·admin_category·condition_json) 판정하려고 저장된 행을 쓴다.
  const saved = data as BadgeRow
  const warning = findConditionShapeSaveWarning(saved, saved.condition_json)
  return NextResponse.json(warning ? { badge: data, warning } : { badge: data }, { status: 201 })
}
