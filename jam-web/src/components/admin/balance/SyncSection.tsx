/**
 * 밸런스 설정 «동기화» 구역 본문 (티켓 20261022_1132 2회) — 서버 컴포넌트. 동기화 아이템 배지의 확정 개수·보너스·등급 확률과, 캡슐과 함께 쓰는 보정·잠길 확률(`jam_policy`)을 편집한다.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/sync.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 */
import { SYNC_BINDING } from '@/lib/admin/balance/sync'
import { BalanceSectionBody } from './BalanceSectionBody'

export function SyncSection() {
  return <BalanceSectionBody binding={SYNC_BINDING} />
}
