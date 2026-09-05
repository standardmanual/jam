/**
 * 게이트 미션 노출 미리보기 (티켓 20260905_0033)
 *
 * **지금까지 `visibility` 로직을 어드민에서 확인할 방법이 전혀 없었다.** 게이트를 걸어 두고
 * 「이 유저에게 이 미션이 보이는가」를 알려면 그 유저로 로그인하는 수밖에 없었다.
 *
 * ⚠️ 판정은 **서비스와 똑같은 함수**를 부른다(`loadMissionVisibilityContext` +
 * `resolveMissionVisibilityMap`). 어드민 전용 판정을 새로 쓰면 미리보기가 「어드민에서는
 * 열리는데 실제로는 잠기는」 거짓말을 하게 된다 — 미리보기의 존재 이유가 사라진다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { loadMissionVisibilityContext } from '@/lib/missions/visibility-server'
import { resolveMissionVisibilityMap } from '@/lib/missions/visibility'
import { collectRuleFamilyKeys, isGateMission, isLegacyGateMission } from '@/lib/missions/gateMissions'
import type { MissionRow } from '@/types/database'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: '유저 ID 형식이 올바르지 않아요. 유저 조회 화면에서 ID를 복사해 붙여넣어 주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, display_name, email')
    .eq('id', userId)
    .maybeSingle<{ id: string; display_name: string | null; email: string }>()
  if (!user) {
    return NextResponse.json({ error: '그 ID의 유저를 찾지 못했어요.' }, { status: 404 })
  }

  const userLabel = user.display_name || user.email

  // 컬럼명을 정렬 키로 쓰지 않는다 — 마이그레이션 135가 아직 실행되지 않은 환경에서
  // `.order('gate_axis')`는 쿼리 자체를 실패시킨다. 정렬은 아래에서 앱이 한다.
  const { data: missionsRaw, error } = await supabase.from('missions').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const missions = (missionsRaw ?? []) as MissionRow[]
  // 게이트 미션 + 폐기 대상(레거시)만 본다 — 기간형 미션은 게이팅이 없어 항상 open이라
  // 미리보기에 섞으면 정작 봐야 할 게이트 판정이 묻힌다.
  const targets = missions
    .filter((m) => isGateMission(m) || isLegacyGateMission(m))
    .sort((a, b) => (a.gate_axis ?? '').localeCompare(b.gate_axis ?? '', 'ko') || a.title.localeCompare(b.title, 'ko'))
  if (targets.length === 0) {
    return NextResponse.json({ userLabel, results: [], ownedFamilies: [] })
  }

  const ctx = await loadMissionVisibilityContext(user.id, targets)
  const map = resolveMissionVisibilityMap(targets, ctx)

  // 「왜 그렇게 판정됐나」를 함께 보여주려면 규칙이 가리키는 계열의 보유 상태가 필요하다.
  // 규칙이 요구하는 계열 중 유저가 보유하지 않은 것도 드러나야 하므로 요구 목록 기준으로 돈다.
  const ownedFamilies = collectRuleFamilyKeys(targets)
    .map((familyKey) => ({ familyKey, tier: ctx.ownedFamilyTiers.get(familyKey) ?? null }))
    .sort((a, b) => a.familyKey.localeCompare(b.familyKey, 'ko'))

  return NextResponse.json({
    userLabel,
    results: targets.map((m) => ({
      id: m.id,
      title: m.title,
      gate_axis: m.gate_axis,
      gate_stage: m.gate_stage,
      legacy: isLegacyGateMission(m),
      visibility: map.get(m.id)?.visibility ?? 'open',
      requiredBadge: map.get(m.id)?.requiredBadge ?? null,
    })),
    ownedFamilies,
  })
}
