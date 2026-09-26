---
id: "20260926_1509"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
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

- 프리셋 POST의 이미지 레이어 `assetUrl` 외부 URL 저장(`presets/route.ts` 재업로드 생략 분기)은 이번에 바꾸지 않기로 결정했다. 어드민 전용이라 악용 가능성이 낮고 호스트 allowlist 기준이 정해지지 않았다.
- UUID 판정은 `jam-web/src/lib/admin/uuid.ts`의 `isUuid` 한 곳이고 `export-ids.ts`도 이를 쓴다.

### 잔여 이슈
-
