---
id: "20260927_0105"
category: API
priority: P3
status: OPEN
created: 2026-09-27
---

# [API] 미션 저장 API의 condition_text 길이와 타입 검증

> 발견 경위: 2026-09-27 `/jam-ship` 배포 전 점검(민지 모드 ②·③)의 범위 밖 발견물(참고)

## 핵심 요약

- 요구사항: `POST /api/admin/missions`와 `PATCH /api/admin/missions/[id]`가 새 칸 `condition_text`의 타입과 길이를 검증하지 않는다. 문자열이 아닌 값은 DB 오류로 500이 나고, 극단적으로 긴 문자열은 모든 사용자의 미션 상세 화면 레이아웃을 깰 수 있다. 어드민 계정으로만 넣을 수 있어 악용 난이도는 낮다(보안 참고, 확신도 높음).
- 구현 계획: 결정 후 작성한다.
- 관련 파일: `jam-web/src/app/api/admin/missions/route.ts`(POST), `jam-web/src/app/api/admin/missions/[id]/route.ts`(PATCH), `jam-web/src/app/api/admin/missions/route.condition-text.test.ts`

## 배경 / 문제 정의

`POST /api/admin/missions`와 `PATCH /api/admin/missions/[id]`가 새 칸 `condition_text`의 타입과 길이를 검증하지 않는다. 문자열이 아닌 값은 DB 오류로 500이 나고, 극단적으로 긴 문자열은 모든 사용자의 미션 상세 화면 레이아웃을 깰 수 있다. 어드민 계정으로만 넣을 수 있어 악용 난이도는 낮다(보안 참고, 확신도 높음).

## 완료 조건

- 위 요구사항을 확인하는 테스트 또는 수정이 있고, 재현 경로가 적혀 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 잔여 이슈
-
