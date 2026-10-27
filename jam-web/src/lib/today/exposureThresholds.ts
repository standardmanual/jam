/**
 * 투데이 노출 태그 경계값 — 챕터 구간·캡슐 게이지·잼 보유량·인벤토리 여유 (티켓 20261026_2030 1회차)
 *
 * 전부 «가정 값»이다. 오픈 뒤 실제 데이터를 보고 맞춘다(balanceDashboard/targets.ts와 같은 태도).
 * 홈피드 세그먼트 값이지 서비스 운영 정책·밸런스 수치가 아니므로 정책 대시보드 항목은 따로 두지 않는다.
 * 잼 경계는 절대값이 아니라 «캡슐 필요량에 대한 배수»로 둔다 — 캡슐 비용(챕터마다 다름)을 바꿔도 뜻이 유지된다.
 */
import { INVENTORY_LOW_FREE_SLOTS } from '@/lib/admin/balanceDashboard/targets'

/** 챕터 구간 → 태그. 구간은 [min, max] 닫힌 범위다(1~3 초반·4~6 중반·7~9 후반·10 최고). */
export const CHAPTER_BANDS = [
  { min: 1, max: 3, tag: 'chapter_1_3' },
  { min: 4, max: 6, tag: 'chapter_4_6' },
  { min: 7, max: 9, tag: 'chapter_7_9' },
  { min: 10, max: 10, tag: 'chapter_10' },
] as const

/** 캡슐이 이 비율 이상 찼고 아직 다 안 찼으면 «거의 참» */
export const CAPSULE_NEARLY_FULL_RATIO = 0.8
/** 잼 잔액이 캡슐 필요량의 이 배수 이상이면 «잼 많음» */
export const JAM_PLENTY_MULTIPLE = 2
/** 잼 잔액이 캡슐 필요량의 이 비율 미만이면 «잼 적음» */
export const JAM_LOW_FRACTION = 1 / 3

/** 인벤토리 남은 칸이 1~이 값이면 «거의 가득 참» (밸런스 대시보드와 같은 값) */
export { INVENTORY_LOW_FREE_SLOTS }
