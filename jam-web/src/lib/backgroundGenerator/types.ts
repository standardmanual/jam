/**
 * 배경테마 제너레이터 공용 타입 (20260819_001 스파이크에서 도입).
 * `/spike/background-generator` 라우트 자체는 프로덕션에서 인증 없이 접근 가능했던 문제로
 * 삭제됐지만(20260901_1851), `SERVICE_WIDTH`는 어드민 미리보기(BadgeDetailPreviewFrame,
 * BadgeRailPreview)가 계속 참조하는 실서비스 상수라 이 파일만 `src/lib`로 이전했다.
 */

/**
 * 실제 서비스에서 배경테마가 적용되는 앱 컬럼 폭(px) — `(main)/layout.tsx`의
 * `max-w-[430px] mx-auto`, `badges/[id]/page.tsx`의 고정 배경 레이어와 동일한 값.
 * 패턴 모드의 렌더링 좌표계(타일 캔버스 계산, 평면화 출력 크기)는 스파이크 UI의 임의 프리뷰
 * 박스 크기가 아니라 항상 이 값을 기준으로 삼는다 (20260819_006).
 */
export const SERVICE_WIDTH = 430
