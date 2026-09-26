---
id: "20260926_1510"
category: Admin
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1413"
  - "20260926_1442"
---

# [Admin] 이번 배포의 신규 라우트 테스트 보강: `image_url` 400 라우트 배선, 단건 삭제 「본인」 케이스, 화이트리스트 어드민 케이스

> 2026-09-26 프로덕션 배포(`828eceba`) 전 점검(민지 모드 ③)의 [주의] 발견물 두 건과 관련 참고를 묶은 티켓이다.

## 핵심 요약

- 요구사항: (1) **`image_url` 비문자열 400 검사가 라우트 단위로 검증되지 않는다**(`badges/[id]/route.ts:18`, `missions/[id]/route.ts:21`). 테스트는 `imageUrlTypeError` 순수 함수와 `imageSourceReset`만 본다. `badges/[id]/__tests__/route.test.ts`는 비활성화 경로만 다루고 `missions/[id]`에는 라우트 테스트 파일이 없어서, 호출부가 빠지거나 순서가 바뀌어도 아무 테스트도 깨지지 않는다. 두 라우트에 `image_url` 비문자열 400 테스트를 추가한다. (`itembooks/[id]`·`today/[id]`는 400 검사 자체가 없고 별도 티켓 20260926_1455가 다룬다.) (2) **단건 완전 삭제 403 테스트의 「본인」 케이스가 약하다**(`users/[id]/__tests__/route.test.ts:57-62`, `route.ts:30-35`). 본인 케이스가 대상을 `is_admin: true`로 두고 403만 확인해서 `admin.id === userId` 분기를 지워도 어드민 분기가 403을 내 테스트가 통과한다. 본인 케이스를 일반 유저 계정으로 만들어 본인 분기만 타게 하고 문구('자기 자신의 계정은 삭제할 수 없습니다.')를 단언한다. `ADMIN_EMAILS` 화이트리스트에만 있고 `is_admin` 플래그는 false인 다른 어드민 케이스도 추가한다(`isAdminAccount`의 이메일 경로).
- 구현 계획: 위 두 곳의 테스트만 보강한다(코드 변경 없음).
- 관련 파일: `jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts`, `jam-web/src/app/api/admin/missions/[id]/`(테스트 신규), `jam-web/src/app/api/admin/users/[id]/__tests__/route.test.ts`.

## 완료 조건

- `image_url` 비문자열 400이 두 라우트 테스트로 고정되고, 호출부를 제거하면 테스트가 실패한다. 단건 삭제의 본인 분기만 타는 테스트와 화이트리스트 어드민 케이스가 있다. `scripts/verify.sh` 통과.


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
