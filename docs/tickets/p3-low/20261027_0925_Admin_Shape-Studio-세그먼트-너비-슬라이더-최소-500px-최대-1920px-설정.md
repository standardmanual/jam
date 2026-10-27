---
id: "20261027_0925"
category: Admin
priority: P3
status: CLOSED
created: 2026-10-27
closed: 2026-10-27
---

# [Admin] Shape Studio 세그먼트 너비 슬라이더 최소 500px·최대 1920px 설정

## 핵심 요약
- 요구사항: 어드민 > 에셋 메뉴 Mode > Shape 세그먼트 옵션의 너비 슬라이더 최소값을 500px, 최대값을 1920px로 설정
- 구현 계획: `ShapeStudioPanel.tsx`의 너비 슬라이더 min/max 속성을 500/1920으로 변경하고, `page.tsx` 초기 상태 및 `shapeStudioConfig.ts` 검증 로직 상한을 1920으로 확장
- 관련 파일: `jam-web/src/app/admin/assets/ShapeStudioPanel.tsx`, `jam-web/src/app/admin/assets/page.tsx`, `jam-web/src/app/admin/assets/shapeStudioConfig.ts`

## 배경 / 문제 정의
에셋 생성 시 고해상도 배너 및 와이드 비율 에셋 생성을 위해 세그먼트의 전체 너비를 더 넓게 확장할 필요가 있었다. 기존 너비 슬라이더는 min 160px ~ max 560px로 제한되어 있어 대형 해상도(Full HD 등) 에셋 제작에 한계가 있었다.

## 상세 요구사항
1. Mode > Shape의 옵션 중 Segments(전체 너비) 슬라이더 최소값을 500px, 최대값을 1920px로 설정
2. 초기 상태가 500px 미만인 경우 최소값 500px을 보장하도록 상태 초기화 로직 보정
3. 프리셋 저장/불러오기 검증 함수(`validatePresetState`)의 width 허용 범위를 1920px까지 확장

## 구현 계획
1. `ShapeStudioPanel.tsx`: `NumberSlider` id="width"의 `min={500}`, `max={1920}` 설정
2. `page.tsx`: 초기 state 생성 시 `s.width < 500`이면 500으로 보정
3. `shapeStudioConfig.ts`: `validatePresetState`의 width 한계값 `[160, 1920]`으로 갱신

## 완료 조건
- [x] 어드민 에셋 화면 Mode > Shape에서 슬라이더 최소값이 500px, 최대값이 1920px로 동작함
- [x] 슬라이더를 1920px까지 조절하여 프리뷰 렌더링 정상 동작 확인
- [x] TypeScript 및 빌드 검증 통과

---

## 완료 기록

### 구현 내용 요약
- `ShapeStudioPanel.tsx` 너비 슬라이더 min 500, max 1920 적용
- `page.tsx` 초기 상태 세그먼트 너비 500 보장
- `shapeStudioConfig.ts` 프리셋 검증 범위 1920px 확장

### 변경된 파일
```
- jam-web/src/app/admin/assets/ShapeStudioPanel.tsx
- jam-web/src/app/admin/assets/page.tsx
- jam-web/src/app/admin/assets/shapeStudioConfig.ts
```

### 테스트 결과
- TypeScript 컴파일 및 린트 검증 완료

### 배포 정보
- 배포일: 2026-10-27
- 환경: staging
- 커밋: 72efe9238
