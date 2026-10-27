/**
 * 가상 유저 — 어드민 홈피드 미리보기가 «이런 조건의 유저에게 그날 홈이 어떻게 보이는가»를 계산하는 입력 (티켓 20261026_2025 1회차).
 *
 * 순수 함수 파일이다. 노출 태그는 실제 홈 조회(`computeUserExposureTags`)와 같은 이름을 쓰되, 가상 유저가 알 수 있는 조건만 담는다.
 * 가상 유저가 알 수 있는 조건은 시간대·날씨·특일·신규 여부와 소속 트라이브(`tribeId` → `tribe_<트라이브 ID>`, 티켓 20261026_2030 2회차)다.
 * 유저 개인 상태 태그(`has_participating_mission` 등 참가·보유·동기화 이력에서 나오는 태그)는 가상 유저가 알 수 없어 넣지 않는다.
 */
import type { TimeOfDayTag } from '@/lib/today/exposure'
import type { WeatherKind } from '@/lib/inputs/weather'
import type { SpecialDayTag } from '@/lib/inputs/special-days-config'
import { tribeTagOf } from '@/lib/today/exposureTribe'
import { isMissionOpenToTribe } from '@/lib/missions/tribe-access'

export interface VirtualViewer {
  /** 가상 유저의 트라이브. 온보딩 전 유저면 null */
  tribeId: string | null
  timeOfDay: TimeOfDayTag
  /** 날씨 구분. 모르면 null(날씨 태그를 넣지 않는다) */
  weather: WeatherKind | null
  specialDays: SpecialDayTag[]
  /** 가입 7일 이내 유저 */
  newUser: boolean
}

/** 가상 유저가 가진 노출 태그. `all`은 늘 들어 있다. */
export function virtualExposureTags(viewer: VirtualViewer): string[] {
  const tribeTag = tribeTagOf(viewer.tribeId)
  return [
    'all',
    viewer.timeOfDay,
    ...(viewer.weather ? [`weather_${viewer.weather}`] : []),
    ...viewer.specialDays,
    ...(viewer.newUser ? ['new_user'] : []),
    ...(tribeTag ? [tribeTag] : []),
  ]
}

/** 허용 트라이브가 정해진 미션이 이 가상 유저의 트라이브에는 닫혀 있는가(미션 목록·홈과 같은 규칙 `isMissionOpenToTribe`). */
export function isClosedToViewerTribe(allowedTribeIds: readonly string[] | null | undefined, viewer: VirtualViewer): boolean {
  return !isMissionOpenToTribe(allowedTribeIds, viewer.tribeId)
}
