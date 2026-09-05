/**
 * 계열 일괄 재계산 — **변경 전후를 확인한 뒤에만 쓴다** (티켓 20260905_0032 B-1)
 *
 * 한 요청에 두 단계가 있다.
 *   ① `confirm_token` 없음 → **계획만** 돌려준다. 아무것도 쓰지 않는다.
 *   ② `confirm_token` 있음 → 지금 DB로 계획을 **다시 세워** 토큰을 대조하고, 같을 때만 쓴다.
 *
 * 토큰을 다시 세운 계획으로 대조하는 이유: 어드민이 diff를 본 뒤 다른 사람이 그 계열을
 * 고쳤을 수 있다. 그때 그대로 쓰면 «본 적 없는 변경»을 커밋하게 된다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { fetchActivityFamilyBadges } from '@/lib/admin/badge-families-query'
import {
  LEVEL_STEP_RULES,
  applyAxisValue,
  buildRecalculationPlan,
  findRecalculationConfirmError,
  groupBadgesIntoFamilies,
  type LevelStepRule,
  type RecalculationSpec,
} from '@/lib/admin/badge-families'
import { MEASURABLE_CONDITION_KEYS, type ConditionKey } from '@/lib/badge-engine/conditionRegistry'
import type { Json } from '@/types/database.generated'
import { findBadgeConditionSaveError } from '@/lib/admin/badge-validation'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const familyKey: string = typeof body.family_key === 'string' ? body.family_key : ''
  const axis = body.axis as ConditionKey
  const rule = body.rule as LevelStepRule

  if (!familyKey) return NextResponse.json({ error: '계열을 지정해주세요.' }, { status: 400 })
  if (!MEASURABLE_CONDITION_KEYS.includes(axis)) {
    return NextResponse.json({ error: `다시 계산할 수 없는 지표입니다(${String(axis)}).` }, { status: 400 })
  }
  if (!LEVEL_STEP_RULES.includes(rule)) {
    return NextResponse.json({ error: '증가 규칙을 선택해주세요.' }, { status: 400 })
  }

  const spec: RecalculationSpec = {
    axis,
    rule,
    base: Number(body.base ?? 0),
    amount: Number(body.amount ?? 0),
    manualValues: Array.isArray(body.manual_values)
      ? body.manual_values.map((v: unknown) => (v === null || v === '' ? null : Number(v)))
      : undefined,
  }
  if (rule !== 'manual' && (!Number.isFinite(spec.base) || !Number.isFinite(spec.amount))) {
    return NextResponse.json({ error: '시작값과 증가량을 숫자로 입력해주세요.' }, { status: 400 })
  }

  // 계획은 **지금 DB**로 세운다 — 화면이 들고 있던 값이 아니다.
  const { badges, error: fetchError } = await fetchActivityFamilyBadges()
  if (fetchError) return NextResponse.json({ error: fetchError }, { status: 500 })

  const family = groupBadgesIntoFamilies(badges).find((f) => f.key === familyKey)
  if (!family) return NextResponse.json({ error: '계열을 찾을 수 없습니다.' }, { status: 404 })

  const plan = buildRecalculationPlan(family, spec)

  // ① 확인 단계 — 아무것도 쓰지 않는다
  if (body.confirm_token === undefined || body.confirm_token === null) {
    return NextResponse.json({ plan })
  }

  // ② 커밋 단계
  const confirmError = findRecalculationConfirmError(plan, body.confirm_token)
  if (confirmError) return NextResponse.json({ error: confirmError, plan }, { status: 409 })

  // 쓰기 전에 **전부** 검증한다 — 한 건이라도 저장 시점 가드에 걸리면 하나도 쓰지 않는다.
  // (마이그레이션 128/134의 계열 정합성 트리거와 별개로, 「저장은 되는데 영원히 안 나오는
  //  배지」 3경로를 A묶음이 저장 API에 걸어 뒀다. 여기서도 같은 함수를 부른다.)
  const variantById = new Map(family.variants.map((v) => [v.id, v]))
  const writes: { id: string; condition_json: ReturnType<typeof applyAxisValue> }[] = []
  for (const change of plan.changes) {
    if (!change.changed) continue
    const variant = variantById.get(change.badgeId)
    if (!variant) continue
    const nextCondition = applyAxisValue(variant.condition_json, axis, change.after)
    const saveError = findBadgeConditionSaveError(
      { name: variant.name, family_key: variant.family_key },
      'activity',
      nextCondition
    )
    if (saveError) {
      return NextResponse.json(
        { error: `${change.slotLabel}: ${saveError}`, plan },
        { status: 400 }
      )
    }
    writes.push({ id: variant.id, condition_json: nextCondition })
  }

  const supabase = createServiceClient()
  const applied: string[] = []
  // 아래 update는 id 하나를 직접 겨냥한다 — 대상 목록은 `fetchActivityFamilyBadges`가 이미
  // `deleted_at IS NULL`로 걸러 만든 계열 구성이다(티켓 20260825_022 경고 대응).
  for (const write of writes) {
    const { error } = await supabase
      .from('badges')
      // `BadgeCondition`(수기 도메인 타입)에는 인덱스 시그니처가 없어 생성 타입의 `Json`에
      // 그대로 대입되지 않는다 — **이 한 컬럼만** 좁혀서 캐스팅한다(jam-web/CLAUDE.md).
      .update({ condition_json: write.condition_json as unknown as Json })
      .eq('id', write.id)
    if (error) {
      // Postgres 원문(계열 정합성 트리거의 EXCEPTION 포함)을 그대로 노출하지 않는다.
      return NextResponse.json(
        {
          error: `일부만 적용됐습니다(${applied.length}건 적용 후 중단). ${error.message}`,
          plan,
          applied,
        },
        { status: 400 }
      )
    }
    applied.push(write.id)
  }

  return NextResponse.json({ applied, plan })
}
