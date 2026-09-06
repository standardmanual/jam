---
id: 20260906_2122
category: Infra
status: CLOSED
created: 2026-09-06
closed: 2026-09-06
---

# [Infra] strava/sync.ts 주석 — `user_activity_badges` 단일 테이블 서술 정정

## 배경 / 문제 정의
`jam-web/src/lib/strava/sync.ts`의 `EarnedBadgePayload.isFirstBadgeEver` 필드 주석(178행 근처)이
"`user_activity_badges`는 배지 종류(활동/아이템/POI/미션·컬렉션 보상) 무관하게 소유권을 기록하는
단일 테이블"이라고 서술하고 있었다. 그런데 같은 파일 681~683행의 실제 발급 로직은 checkin 타입
배지를 `user_checkin_badge_earns`에 별도로 적재하고, `user_activity_badges`는 그 외 타입에만
쓴다 — 두 서술이 모순된다. `/api/checkin-badges/route.ts`도 `user_checkin_badge_earns`만 사용해
분리 사실을 뒷받침한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `sync.ts` 176~181행 근처 주석을 실제 동작(checkin 타입은 `user_checkin_badge_earns`로 분리,
  그 외 타입만 `user_activity_badges`)에 맞게 정정한다.
- 로직·동작은 변경하지 않는다 (주석 전용 수정).

## 구현 계획
`EarnedBadgePayload.isFirstBadgeEver` 필드 위 JSDoc 주석만 수정. 코드 변경 없음.

---
## 완료 기록

### 구현 내용 요약
`user_activity_badges`가 "배지 종류 무관 단일 테이블"이라는 서술을 "checkin 타입을 제외한 나머지
배지 종류의 소유권을 기록하는 테이블이며, checkin 타입은 `user_checkin_badge_earns`에 별도
적재된다"로 정정했다. 실제 동작(681~683행, 692~755행)과 `/api/checkin-badges/route.ts`의
테이블 사용을 근거로 확인 후 반영.

### 변경된 파일
```
jam-web/src/lib/strava/sync.ts
```

### 테스트 결과
- [x] 코드 로직 변경 없음 — 주석만 수정, 빌드/동작 영향 없음 (별도 테스트 불필요)

### UX Writing 검증
- 해당 없음 (사용자 노출 텍스트 아님, 코드 주석)

### 배포 정보
- 배포일: staging push 시점
- 환경: production (staging·프로덕션 공용 DB, 단 이 변경은 주석뿐이라 DB 영향 없음)
- 커밋: (본 커밋)

### 주요 의사결정 / 핵심 메모
- 기능 변경 없이 주석만 정정 — 사용자 명시 요청 범위를 그대로 따름.
- `isFirstBadgeEver` 카운트 비교 로직 자체(badgeIds에 checkin 배지가 섞였을 때의 계산 방식)는
  이번 정정 범위 밖이라 건드리지 않았다. 필요하면 별도 티켓으로 검토.

### 잔여 이슈
- 없음
