---
id: "20260926_1824"
category: Admin
priority: P2
status: OPEN
created: 2026-09-26
---

# [Admin] 서버 렌더(`renderCardPng`)와 실제 캔버스에서 이미지 레이어 원본 비율·컬러 오버레이가 맞게 나오는지 검증하는 테스트를 추가한다

> **연결 메모 (2026-09-30 티켓 20260930_1451 사용자 결정):** 20260930_1501(운영툴 미리보기·이미지) 착수 때 함께 판단한다. 07 블루프린트 4.5가 승인 때 에셋 제너레이터의
> 서버 렌더를 재사용하므로 에셋 제너레이터의 역할이 커진다.

## 핵심 요약

- 요구사항: 서버 렌더(`renderCardPng`)와 실제 캔버스에서 이미지 레이어 원본 비율·컬러 오버레이가 맞게 나오는지 검증하는 테스트를 추가한다
- 구현 계획: 미정(착수 전 실측부터)
- 관련 파일: `jam-web/scripts/asset-generator/renderCard.mjs`(33~158줄), `serverCanvas.ts`, `__tests__/serverCanvas.test.ts`, `jam-web/src/lib/asset-generator/__tests__/render.test.ts`(200~244줄)

## 배경 / 문제 정의

프로덕션 배포 전 점검(민지 모드 ②·③, 티켓 1741·1756 배포)의 범위 밖 발견물이다. `renderCardPng`를 직접 부르는 테스트가 없고(홈피드 카드 테스트는 `renderPng`를 스텁으로 바꾼다), 오버레이 합성 테스트는 가짜 컨텍스트의 호출 순서만 본다. 서버 캔버스에서 `source-in`이 알파 모양을 유지하는지와 `serverImageLoader` 원본 비율이 실제 픽셀로 검증되지 않는다.

## 완료 조건

- `@napi-rs/canvas`로 투명 배경 이미지에 오버레이를 그려 알파 유지·비율을 픽셀로 확인하는 테스트가 있고, `renderCardPng`의 반환 계약과 `overlayColor` 전달을 검증한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모
-

### 잔여 이슈
-
