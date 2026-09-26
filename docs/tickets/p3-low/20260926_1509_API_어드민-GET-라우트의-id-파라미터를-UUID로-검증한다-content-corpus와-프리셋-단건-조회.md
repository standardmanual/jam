---
id: "20260926_1509"
category: API
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260925_0238"
  - "20260926_1412"
  - "20260926_1442"
---

# [API] 어드민 GET 라우트의 id 파라미터를 UUID 형식으로 검증한다 (content-corpus, 프리셋 단건 조회)

> 2026-09-26 프로덕션 배포(`828eceba`) 뒤 런타임 오류 확인과 배포 전 점검(민지 모드 ②)에서 나온 발견물이다. 이번 배포가 만든 문제가 아니라 기존 코드다.

## 핵심 요약

- 요구사항: 어드민 GET 라우트 두 곳이 id 파라미터를 UUID 형식 검증 없이 DB 조회에 넘겨, 형식이 틀린 값이면 DB 오류가 나고 오류 원문이 응답·로그에 실린다.
  1. **`GET /api/admin/content-corpus`**: `tribeIds`·`itemBookIds`·`badgeIds`(쉼표로 구분한 후보 ID 목록)를 검증 없이 넘긴다. 2026-09-26 15:02 KST 프로덕션 런타임 오류로 확인됐다: `invalid input syntax for type uuid: "3"`(코드 `22P02`), 이번 배포 이전 배포(`dpl_DBenu…`)에서 발생해 이번 배포와 무관하다. `jam-web/src/app/api/admin/content-corpus/route.ts`(`parseIds`, 42행 부근).
  2. **`GET /api/admin/asset-generator/presets/[id]`**: `id`를 검증 없이 `.eq('id', id)`로 넘기고 실패하면 `error.message`를 500으로 반환한다. 이번 세션(티켓 20260926_1442)이 DELETE·POST에는 검증을 넣었지만 GET에는 넣지 않았다. `jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts:14-27`.
- 구현 계획: 두 라우트에 공용 UUID 판정을 적용해 형식이 틀리면 DB 조회 전에 400으로 거절한다. 이번 세션에 만든 `lib/admin/export-ids.ts`(`parseExportIds`)의 UUID 정규식을 재사용하거나 함께 쓸 수 있는 형태로 뺀다. 오류 응답에서 DB 원문은 고정 문장으로 바꾼다(티켓 20260925_0238 관례).
- 참고(같은 라우트 계열): 프리셋 POST에서 이미지 레이어 `assetUrl`이 `^https?://`로 시작하면 재업로드 없이 그대로 저장된다(`presets/route.ts:126`). 호스트 allowlist가 없어 어드민이 임의 외부 URL을 저장할 수 있다. 어드민 전용이라 악용 가능성은 낮으나 허용 호스트를 정할지 판단한다.

## 완료 조건

- 형식이 틀린 id가 두 GET 라우트에서 400이고 DB 오류 원문이 응답에 없다(단위 테스트). 정상 요청은 그대로다. `assetUrl` 처리는 결정을 완료 기록에 남긴다.


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 묶음 티켓 20260926_1512로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- 공용 헬퍼 `lib/admin/uuid.ts`의 `isUuid`를 만들고 `export-ids.ts`가 같은 정규식 대신 이 함수를 쓰게 했다(동작 동일, 정규식은 한 곳).
- **`GET /api/admin/content-corpus`**: `tribeIds`·`itemBookIds`·`badgeIds`에 UUID가 아닌 값이 하나라도 있으면 조회 전에 400(고정 한국어 문장). 오늘 프로덕션 런타임 오류(`invalid input syntax for type uuid: "3"`)의 원인이 막혔다. 기존 catch는 원문을 로그로만 남기고 고정 문장 500을 돌려주므로 그대로 두었다.
- **`GET /api/admin/asset-generator/presets/[id]`**: id가 UUID가 아니면 DB 조회 전에 400. DB 오류는 `console.error`로 남기고 응답은 고정 문장이다.
- **`assetUrl` 외부 URL 저장은 이번에도 하지 않는다(결정).** 어드민 전용이고 악용 가능성이 낮아 허용 호스트를 정하는 것은 필요해질 때 다룬다.

### 변경된 파일
```
- jam-web/src/lib/admin/uuid.ts (신규), export-ids.ts
- jam-web/src/app/api/admin/content-corpus/route.ts, __tests__/route.test.ts
- jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts, __tests__/route.test.ts
```

### 테스트 결과
- [x] content-corpus(UUID 아닌 값 3종 400·DB 미호출, 트림된 대소문자 UUID 목록 유지, 오류 원문 미노출), 프리셋 GET(형식 오류 4종 400·DB 미호출, DB 오류 원문 미노출). `export-ids` 기존 테스트 그대로 통과. CI 성공. 기존 테스트의 id(`p1`·`p2`·`missing`, `a, b ,,c`)는 UUID가 필요해져 UUID 값으로 바꿨고 검증 의도는 유지된다

### 잔여 이슈
- `presets/[id]` DELETE·프리셋 POST의 `isSafePresetPathSegment` 기준과 GET의 UUID 기준이 서로 다르다(GET이 더 엄격). 프리셋 id는 uuid 컬럼이라 저장된 값은 항상 UUID이므로 동작 문제는 없고, 통일할지는 필요해질 때 정한다.


### 병합 전 브랜치에서 남긴 결정 메모 (아현)
- 프리셋 POST의 이미지 레이어 `assetUrl` 외부 URL 저장(`presets/route.ts` 재업로드 생략 분기)은 이번에 바꾸지 않기로 결정했다. 어드민 전용이라 악용 가능성이 낮고 호스트 allowlist 기준이 정해지지 않았다.
- UUID 판정은 `jam-web/src/lib/admin/uuid.ts`의 `isUuid` 한 곳이고 `export-ids.ts`도 이를 쓴다.
