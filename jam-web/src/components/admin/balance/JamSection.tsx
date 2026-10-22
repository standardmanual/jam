/**
 * 밸런스 설정 «잼» 구역 본문 (티켓 20261022_1132 1회) — 서버 컴포넌트. 강도 배율 3칸과 대량 수령 경보 기준 3칸(`jam_policy`)을 편집한다.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/jam.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 */
import { JAM_BINDING } from '@/lib/admin/balance/jam'
import { BalanceSectionBody } from './BalanceSectionBody'

export function JamSection() {
  return <BalanceSectionBody binding={JAM_BINDING} />
}
