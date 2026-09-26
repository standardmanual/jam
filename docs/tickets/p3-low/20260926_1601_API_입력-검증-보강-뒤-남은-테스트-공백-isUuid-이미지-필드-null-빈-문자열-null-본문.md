---
id: "20260926_1601"
category: API
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260926_1512"
  - "20260926_1509"
  - "20260926_1455"
---

# [API] 입력 검증 보강 뒤 남은 테스트 공백: `isUuid` 직접 테스트, 이미지 필드 `null`·빈 문자열 통과, `req.json()`이 null인 본문

> 티켓 20260926_1512 배포 전 점검(민지 모드 ③·②)에서 나온 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 모두 `[참고]`이며 현재 구현에는 회귀가 없다.

## 핵심 요약

- 요구사항: 공용 헬퍼와 새 검증의 경계를 테스트로 닫는다. 코드 변경은 (3)만 해당하고 나머지는 테스트만 추가한다.
  1. **`isUuid` 직접 단위 테스트**: `jam-web/src/lib/admin/uuid.ts`는 5개 이상 라우트가 공용으로 쓰는데 대문자, 하이픈 위치, 앞뒤 공백, 빈 문자열 경계를 라우트 테스트로만 간접 확인한다.
  2. **이미지 필드의 정상 경로**: `itembooks/[id]` PUT·`today/[id]` PATCH가 `image_url`(today는 `cover_image_url`)에 `null`·빈 문자열을 받아도 400이 아니라는 회귀 방지 테스트가 없다. 실제 폼은 이미지를 비울 때 이 값을 보낼 수 있다.
  3. **본문이 `null`인 요청**: 같은 두 라우트에서 `await req.json()`이 `null`이면 `body.image_url` 접근에서 `TypeError`가 나 500이 된다(기존 코드도 이후 같은 방식으로 `body`를 읽었으므로 새 결함은 아니다). 400으로 바꿀지 정한다.
- 관련 파일: `jam-web/src/lib/admin/uuid.ts`, `jam-web/src/app/api/admin/itembooks/[id]/route.ts:15`, `jam-web/src/app/api/admin/today/[id]/route.ts:14`와 각 `__tests__/route.test.ts`

## 완료 조건

- (1)(2)가 테스트로 고정되고 `scripts/verify.sh`가 통과한다. (3)은 동작을 정한 뒤 테스트로 고정한다.

---
## 완료 기록

### 구현 내용 요약
- 묶음 티켓 20260926_1602로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- `isUuid` 직접 단위 테스트(`uuid.test.ts`, 신규)로 대문자·앞뒤 공백·중괄호 표기·하이픈 위치·빈 문자열 경계를 고정했다.
- `itembooks/[id]` PUT·`today/[id]` PATCH의 이미지 필드에 `null`·`''`을 보내도 400이 아니라 통과함을 테스트로 고정했다.
- 두 라우트는 본문이 JSON `null`이면 500 대신 400 「요청 형식이 올바르지 않습니다.」를 낸다(기존 라우트의 관례 문구, DB 미접근 확인).

### 변경된 파일
```
- jam-web/src/lib/admin/__tests__/uuid.test.ts (신규)
- jam-web/src/app/api/admin/itembooks/[id]/route.ts, today/[id]/route.ts (+ 각 __tests__/route.test.ts)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36225367378, 커밋 43c55d58). 병합 뒤 통합본에서 전체 vitest 213개 파일 3144건, `deploy-gate.test.mjs`·`public-mission-check.test.mjs` 통과
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·9·10·11 통과, 나머지 해당 없음. 검토 범위 319374dd..43c55d58

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 c7820292·0ff3e113·61884cd6·43c55d58, 병합은 이 묶음 종료 기록과 함께 push (리뷰 브랜치 `claude/jamwork-20260926_1602-admin-cleanup-a`)
