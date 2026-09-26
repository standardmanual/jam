---
id: "20260926_1455"
category: API
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260926_1442"
  - "20260926_0203"
---

# [API] `itembooks/[id]`·`today/[id]` 라우트에도 `image_url` 비문자열 400 검사를 붙인다

> 2026-09-26 티켓 20260926_1442 게이트(민지)의 [참고] 발견물이다.

## 핵심 요약

- 요구사항: `imageSourceReset`의 비문자열 방어(500 제거)는 이 함수를 쓰는 모든 라우트에 적용되지만, 400 검사(`imageUrlTypeError`)는 `badges/[id]`·`missions/[id]`에만 붙였다. `itembooks/[id]`·`today/[id]`는 비문자열 `image_url`이 update 페이로드로 그대로 가는 종전 동작이 남아 있다(500만 사라짐). 같은 검사를 붙여 비문자열을 400으로 거절한다.
- 관련 파일: `jam-web/src/lib/admin/imageSourceReset.ts:31`, `jam-web/src/app/api/admin/itembooks/[id]/route.ts`, `jam-web/src/app/api/admin/today/[id]/route.ts`.

## 완료 조건

- 두 라우트에서 비문자열 `image_url`이 400이고 정상 요청은 그대로다(단위 테스트).


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 묶음 티켓 20260926_1512로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- `itembooks/[id]` PUT에 `imageUrlTypeError` 400을 진입부에 추가했다(`badges/[id]`와 같은 방식). `today/[id]` PATCH도 같은 검사를 추가했다.
- **`today/[id]`는 `image_url`이 아니라 `cover_image_url`을 검사한다.** 티켓은 `image_url`이라 적었지만 이 라우트의 이미지 컬럼은 `cover_image_url`이고 `body.cover_image_url`로 `imageSourceReset`을 부른다(아현이 코드로 확인, 게이트가 인정).

### 변경된 파일
```
- jam-web/src/app/api/admin/itembooks/[id]/route.ts, __tests__/route.test.ts (신규)
- jam-web/src/app/api/admin/today/[id]/route.ts, __tests__/route.test.ts (신규)
```

### 테스트 결과
- [x] 두 라우트 신규 테스트가 비문자열 400·DB 미접근·정상 수정·이미지 미변경을 고정한다. CI 성공

### 잔여 이슈
- `itembooks/[id]` PUT의 `background_image_url` 등 다른 이미지 컬럼에는 타입 검사가 없다(`itembooks/[id]/route.ts:53`). 티켓 범위 밖이라 두었다.
