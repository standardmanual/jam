---
id: 20260815_007
category: UI
status: OPEN
created: 2026-08-15
closed:
---

# [UI] 미션 상세 activity_type 한국어 번역 미적용

## 배경 / 문제 정의

`/missions/[id]/MissionDetailClient.tsx` 136~138행에서 `activity_type` 값을 `capitalize()`만 적용하고 한국어 번역 없이 노출한다. 예: `"Run"`, `"Ride"` 등 영어 raw 값이 그대로 표시됨.

**발견 경위:** 2026-08-15 Figma vs 스테이징 분석 중 Minor 항목으로 식별.

## 상세 요구사항

### 서비스/코드베이스 관점
- `MissionDetailClient.tsx` 136~138행 수정
- activity_type → 한국어 매핑 딕셔너리 추가 또는 기존 딕셔너리 재사용
  - `Run` → `달리기`, `Ride` → `사이클링`, `Swim` → `수영`, `Walk` → `걷기` 등 (Strava 타입 기준)
- `MissionsListClient.tsx`의 `MISSION_TYPE_LABELS`와 별개로 `ACTIVITY_TYPE_LABELS` 딕셔너리 신설 또는 공통화

### 컨텐츠 관점
- 한국어 표현은 UX Writing 가이드라인의 "활동" 관련 용어 참조

## 구현 계획
> 디자인 리뉴얼 후 미션 상세 화면 개편 시 함께 적용. 혹은 즉시 수정 가능한 1~2줄 변경이므로 리뉴얼 전 단독 적용도 고려 가능.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
티켓 20260815_017에서 처리. `MissionDetailClient.tsx`에 `ACTIVITY_TYPE_LABELS`를
`@/lib/utils`에서 import 후 `condition.activity_type` 렌더링에 적용.
기존 딕셔너리 재사용 (키: 소문자 언더스코어 = DB 저장 형식과 동일).

### 변경된 파일
```
jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx
```

### 테스트 결과
- [x] 미션 상세에서 activity_type 한국어 노출 확인 (달리기, 자전거, 등산 등)
- [x] TypeScript 타입 오류 없음

### UX Writing 검증
- [x] 용어 일관성: @/lib/utils 기존 ACTIVITY_TYPE_LABELS 값 그대로 사용

### 배포 정보
- 배포일: 2026-08-15
- 환경: review 브랜치 (claude/jamwork-017-즉시수정-1차)
- 커밋: c51b09a

### 주요 의사결정 / 핵심 메모
- DB의 activity_type은 소문자 언더스코어(running, cycling 등), Strava 원본(Run, Ride)과 다름.
  기존 utils.ts 딕셔너리가 이미 DB 형식 키를 사용하므로 신규 작성 불필요.

### 잔여 이슈
- 없음 (티켓 20260815_017 완료로 처리)
