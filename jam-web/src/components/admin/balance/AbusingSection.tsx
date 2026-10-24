/**
 * 밸런스 설정 «어뷰징» 구역 본문 (티켓 20261022_1134 2회) — 서버 컴포넌트. 비정상 이동·차량·교통수단·종목 불일치·장소 블록 기준값 10칸(`abusing_policy`)을 편집한다.
 * 옛 어뷰징 화면의 «정책 설정» 탭을 이 구역이 대신한다. 칸 정의와 읽기·쓰기는 `lib/admin/balance/abusing.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 */
import { ABUSING_BINDING } from '@/lib/admin/balance/abusing'
import { BalanceSectionBody } from './BalanceSectionBody'

export function AbusingSection() {
  return <BalanceSectionBody binding={ABUSING_BINDING} />
}
