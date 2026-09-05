/**
 * 계열 키 발급 — **비어 있을 때만.** (티켓 20260905_0032 B-3)
 *
 * A묶음 이후 어드민에서 새로 만든 레벨형 배지는 `family_key`가 NULL이다. 그 배지는
 * `familyKeyOf()`의 `#name:` 폴백으로 묶여 **교차 게이트 대상이 될 수 없다**(게이트는
 * `family_keys`로 대상을 지정한다). 이 엔드포인트가 그 구멍을 메운다.
 *
 * ⚠️ **발급이지 변경이 아니다.** 교차 게이트가 계열을 `family_key`로 가리키므로 이미 있는
 * 키를 바꾸면 게이트 참조가 조용히 끊긴다(티켓 판단 ③). 판정은 `findFamilyKeyIssueError`
 * 하나만 쓰고, 이미 키가 있는 배지는 «같은 값이어도» 거부한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { findFamilyKeyIssueError, isValidFamilyKey } from '@/lib/admin/badge-families'
import type { BadgeRow } from '@/types/database'

type TargetBadge = Pick<BadgeRow, 'id' | 'name' | 'type' | 'family_key' | 'activity_types'>

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const badgeIds: unknown = body.badge_ids
  const requestedKey: string = typeof body.family_key === 'string' ? body.family_key.trim() : ''

  if (!Array.isArray(badgeIds) || badgeIds.length === 0 || badgeIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: '발급할 배지를 선택해주세요.' }, { status: 400 })
  }
  if (!isValidFamilyKey(requestedKey)) {
    return NextResponse.json(
      { error: `발급할 수 없습니다. 계열 키 형태(${requestedKey || '비어 있음'})가 올바르지 않습니다. "종목:이름" 형태로, 쉼표 없이 입력해주세요.` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  // 소프트 삭제 필터를 두지 않는다 — 화면이 살아 있는 계열에서 고른 id를 그대로 받고,
  // 대상은 이 id 목록으로 이미 한정돼 있다(관리자 편집 경로, 티켓 20260825_022).
  const { data: rows, error: fetchError } = await supabase
    .from('badges')
    .select('id, name, type, family_key, activity_types')
    .in('id', badgeIds as string[])
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const targets = (rows ?? []) as unknown as TargetBadge[]
  if (targets.length === 0) {
    return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 이 키를 이미 쓰는 다른 배지가 있으면 «같은 계열의 형제»일 때만 허용한다. 이름이 다르면
  // 서로 다른 계열이 한 키로 합쳐지는 것이고, 그 순간 두 계열을 가리키던 교차 게이트가
  // 엉뚱한 대상을 보게 된다.
  // 여기서는 **소프트 삭제된 배지도 일부러 함께 본다.** 지워진 배지가 그 키를 들고 있으면
  // 키는 여전히 «쓰이는 중»이다 — 교차 게이트가 그 키를 가리키고 있을 수 있다.
  const { data: sameKeyRows, error: sameKeyError } = await supabase
    .from('badges')
    .select('id, name')
    .eq('family_key', requestedKey)
  if (sameKeyError) return NextResponse.json({ error: sameKeyError.message }, { status: 500 })

  const targetNames = new Set(targets.map((b) => b.name))
  const foreign = ((sameKeyRows ?? []) as { id: string; name: string }[]).filter(
    (r) => !targetNames.has(r.name) && !badgeIds.includes(r.id)
  )
  if (foreign.length > 0) {
    return NextResponse.json(
      {
        error: `발급할 수 없습니다. 계열 키 "${requestedKey}"는 이미 다른 계열("${foreign[0].name}")이 쓰고 있습니다. 다른 키를 지정해주세요.`,
      },
      { status: 409 }
    )
  }

  const issued: string[] = []
  const skipped: { badgeId: string; name: string; reason: string }[] = []
  for (const badge of targets) {
    const error = findFamilyKeyIssueError(badge, requestedKey)
    if (error) skipped.push({ badgeId: badge.id, name: badge.name, reason: error })
    else issued.push(badge.id)
  }

  if (issued.length > 0) {
    // `family_key`는 마이그레이션 134 이후 계열 정합성 트리거의 그룹핑 키다 — 조건 조합이
    // 다른 배지를 기존 계열에 끌어다 붙이면 Postgres EXCEPTION이 난다. 원문이 그대로 화면에
    // 뜨지 않도록 감싼다.
    const { error: updateError } = await supabase
      .from('badges')
      .update({ family_key: requestedKey })
      .in('id', issued)
    if (updateError) {
      return NextResponse.json(
        { error: `계열 키를 발급할 수 없습니다. ${updateError.message}` },
        { status: 400 }
      )
    }
  }

  return NextResponse.json({ family_key: requestedKey, issued, skipped })
}
