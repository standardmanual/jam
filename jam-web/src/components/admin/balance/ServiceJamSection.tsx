/**
 * 밸런스 설정 «서비스 활동 잼» 구역 본문 (티켓 20261028_1735 4회) — 서버 컴포넌트. 서비스 활동 종류별 잼 7칸(`service_jam_rules`)과
 * 하루·주간 상한 2칸(`jam_policy`)을 편집한다. 칸 정의와 읽기·쓰기는 `lib/admin/balance/serviceJam.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 */
import { SERVICE_JAM_BINDING } from '@/lib/admin/balance/serviceJam'
import { BalanceSectionBody } from './BalanceSectionBody'

export function ServiceJamSection() {
  return <BalanceSectionBody binding={SERVICE_JAM_BINDING} />
}
