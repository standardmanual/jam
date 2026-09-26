---
id: "20260926_1510"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
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
## 완료 기록

### 구현 내용 요약
- 묶음 티켓 20260926_1513으로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- `badges/[id]` PUT·`missions/[id]` PATCH의 `image_url` 비문자열 400을 라우트 단위로 고정했다. 호출부를 지우는 변조로 각각 4건 실패를 확인하고 원복했다. 미션 라우트 테스트는 신규다.
- 유저 단건 삭제의 「본인」 케이스를 일반 유저 계정으로 바꿔 본인 분기만 타게 하고 문구를 단언했다(본인 분기를 지우는 변조로 실패 확인). `ADMIN_EMAILS`에만 있는 어드민 403, 비어드민 통과, `hardDeleteUser`의 `ok:false` 전달을 추가했다.

### 변경된 파일
```
- jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts
- jam-web/src/app/api/admin/missions/[id]/__tests__/route.test.ts (신규)
- jam-web/src/app/api/admin/users/[id]/__tests__/route.test.ts
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36223626726, 커밋 5e9beb72). 병합 뒤 통합본에서 vitest 82개 파일 1088건, `deploy-gate.test.mjs`·`public-mission-check.test.mjs` 통과
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·4·5·10·11 통과, 나머지 해당 없음. 검토 범위 7eeba09a..5e9beb72

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 434c69ae·aa689d08·81638415·e5695c4f·03f399da·4cf023ac·9cc1bceb·ff246dec·5e9beb72, 병합 31c3608c (리뷰 브랜치 `claude/jamwork-20260926_1513-test-reinforce-bundle`)

### 잔여 이슈
- `users/[id]/route.ts:27`이 대상 조회 오류 시 DB 원문을 500 응답에 싣는다. 테스트는 500만 확인한다. 정리는 티켓 20260925_0238에 위치를 덧붙였다.
