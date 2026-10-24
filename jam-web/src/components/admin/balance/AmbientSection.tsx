/**
 * 밸런스 설정 «시스템 드랍» 구역 본문 (티켓 20261022_1134 3회) — 서버 컴포넌트. 예약 배포 시각·상호 배제 창, 배치 규모·지점당 한도, 등급 비율 네 칸(`ambient_drop_config`)을 편집한다.
 * 옛 앰비언트 드랍 화면(`/admin/ambient-drop`)의 숫자 칸을 이 구역이 대신한다. 칸 정의와 읽기·쓰기는 `lib/admin/balance/ambient.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 등급 축(`rarity_mode`)이 «무작위»이면 서비스는 등급 비율을 쓰지 않는다. 그때 폼 위에 안내 한 줄을 둔다. 등급 축을 읽지 못해도 구역은 열린다(안내만 없다).
 */
import { Alert } from '@/components/admin/ui/alert'
import { AMBIENT_BINDING, readAmbientRarityMode, type AmbientRarityMode } from '@/lib/admin/balance/ambient'
import { createServiceClient } from '@/lib/supabase/server'
import { BalanceSectionBody } from './BalanceSectionBody'

export const AMBIENT_RARITY_RANDOM_NOTICE =
  '지금 등급은 「무작위」로 정해서 아래 등급 비율을 쓰지 않아요. 앰비언트 드랍 화면에서 등급을 「명시」로 바꾸면 이 비율대로 정해요.'

export function AmbientRarityRandomNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">{AMBIENT_RARITY_RANDOM_NOTICE}</p>
    </Alert>
  )
}

async function readRarityMode(): Promise<AmbientRarityMode | null> {
  try {
    return await readAmbientRarityMode(createServiceClient())
  } catch (error) {
    console.error('[admin/balance] ambient 등급 축 조회 실패 — 안내만 생략한다:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function AmbientSection() {
  const rarityMode = await readRarityMode()
  return (
    <div className="space-y-6">
      {rarityMode === 'random' && <AmbientRarityRandomNotice />}
      <BalanceSectionBody binding={AMBIENT_BINDING} />
    </div>
  )
}
