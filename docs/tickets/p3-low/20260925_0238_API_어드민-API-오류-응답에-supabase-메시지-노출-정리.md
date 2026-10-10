---
id: "20260925_0238"
category: API
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/service/prd/asset-generator/PRD.md"
---

# [API] 어드민 API 오류 응답이 Supabase 오류 메시지를 그대로 노출하는 관례를 정리한다

> 티켓 20260924_2159 게이트 리뷰에서 민지가 낸 범위 밖 발견물(`[참고]`)을 3.2절대로 자동 티켓화했다.

## 핵심 요약

- 요구사항: 에셋 제너레이터 프리셋 API(목록·저장·상세·삭제)가 실패 시 Supabase `error.message`를 응답 본문에 그대로 담아 클라이언트에 보낸다. 기존 shader-lab compositions 라우트와 같은 관례라 이번에 새로 생긴 문제는 아니지만, DB 내부 메시지(테이블·컬럼·제약 이름)가 어드민 브라우저까지 내려간다. 사용자에게는 고정 문구를, 상세는 서버 로그에만 남기도록 정리한다.
- 구현 계획: 두 라우트에서 오류 응답을 `{ error: '프리셋을 저장하지 못했어요.' }` 같은 고정 문구로 바꾸고 `console.error`로 원본을 남긴다. shader-lab compositions 라우트도 같은 커밋에서 맞추면 관례가 하나가 된다(선택).
- 관련 파일: `jam-web/src/app/api/admin/asset-generator/presets/route.ts`, `jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts`, (선택) `jam-web/src/app/api/admin/shader-lab/compositions/route.ts`·`[id]/route.ts`

## 배경 / 문제 정의

어드민 전용 API라 노출 범위는 어드민 계정으로 한정되지만, 오류 문구 관례가 라우트마다 다르면 UX Writing 가이드(오류 = 현상·원인·해결책)와도 어긋난다.

## 완료 조건
- 프리셋 API 4개 핸들러의 오류 응답에 Supabase 원문 메시지가 들어가지 않는다(라우트 테스트로 확인).
- `npm run lint`·`npm test` 통과.

### 추가 위치 (2026-09-26, 티켓 20260926_1241 게이트 발견물)
- `jam-web/src/app/api/admin/badges/list-bulk/route.ts` 47행(`assign_tribe` 조회 오류), 103행(이번에 추가된 deactivate 후보 조회 오류), 116행(`poi_drops` 집계 오류)이 DB 원문 `error.message`를 500 응답에 그대로 싣는다. 같은 파일의 기존 방식이라 이번 묶음에서는 따라갔다. 이 티켓의 관례 정리에 함께 포함한다.

### 배포 전 점검에서 재확인 (2026-09-26, 민지 모드 ②, 확신도 높음)
- `jam-web/src/app/api/admin/badges/list-bulk/route.ts` 51·67·119·224행이 DB 오류 원문을 응답에 그대로 낸다. 같은 diff에서 export·ids·PATCH는 고정 한국어 문장으로 바꿨는데 list-bulk만 남았다. 어드민 인증 뒤에서만 노출된다.

### 진행 상황 (2026-09-26, 티켓 20260926_1345)
- `list-bulk/route.ts`의 DB 오류 응답 6곳(트라이브 지정 조회, 비활성화 사전 조회, 드랍 수 집계, 트라이브 조회, 컬렉션 조회, 삭제)은 고정 한국어 문장으로 바꿨다.
- **남은 곳**: 공용 헬퍼 `updateByIdsAllOrNothing`의 `update.error`를 그대로 응답에 내는 세 곳(`route.ts` 108·146·191행 부근)이 남아 DB 원문이 섞일 수 있다(공용 헬퍼 변경이 필요해 이번에 손대지 않았다). 다른 어드민 라우트의 같은 관례도 이 티켓에서 이어서 정리한다.

### 추가 위치 (2026-09-26, 티켓 20260926_1413 게이트)
- 단건 삭제·초기화 라우트가 조회 오류 시 `targetError.message`를 그대로 응답한다: `jam-web/src/app/api/admin/users/[id]/route.ts:27`, `jam-web/src/app/api/admin/users/[id]/reset/route.ts:28`. 이 관례 정리에 함께 포함한다(같은 계열의 `list-bulk` activate 분기는 티켓 20260926_1406).

### 배포 전 점검에서 재확인 (2026-09-26, 프로덕션 배포 `828eceba`, 민지 모드 ②)
- 이번 범위에서 손대지 않은 어드민 라우트 다수가 `error.message`를 응답에 그대로 싣는다. 예: 프리셋 POST의 `findErr.message`·`uploadErr.message`(`asset-generator/presets/route.ts:120-122` 부근). 프리셋 단건 조회 GET의 `id` 검증 부재는 별도 티켓(어드민 GET 라우트 id 검증)으로 다룬다.

### 추가 위치 (2026-09-26, 티켓 20260926_1512 게이트)
- `jam-web/src/app/api/admin/today/[id]/route.ts:29,45`: PATCH의 기존 행 조회 오류(`existingError.message`)와 update 오류(`error.message`)가 DB 오류 원문을 응답에 그대로 싣는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

### 추가 위치 (2026-09-26, 티켓 20260926_1513 게이트 발견물, 확신도 높음)
- `jam-web/src/app/api/admin/users/[id]/route.ts:27` — 대상 조회 오류 시 `targetError.message`(DB 원문)를 500 응답에 싣는다.
- `jam-web/src/app/api/admin/drop-policy/exclusions/bulk/route.ts:47` — 배지 조회 오류 시 `error.message`를 응답에 싣는다.
- `missions/[id]`(PATCH)와 export 라우트 다수(missions·poi·today·itembooks·points/ledger 등)도 같은 패턴이다. 1513의 테스트는 이 라우트들의 오류 경로에서 500만 확인하고 원문 문구는 단언하지 않는다. 고칠 때 「원문이 응답에 없음」 단언을 함께 추가한다.

### 배포 전 점검에서 재확인 (2026-09-26, 민지 모드 ②·③, 확신도 높음)
- `presets/[id]/route.ts` DELETE(45-68행)는 이번 UUID 검증 대상이 아니다. `isSafePresetPathSegment`(`^[A-Za-z0-9_-]{1,100}$`)만 통과하면 `.eq('id', id)`가 실행돼, UUID가 아닌 값(`abc`)이 오면 DB의 uuid 파싱 오류 원문이 `error.message`로 500 응답에 실린다(59·64·67행). GET에서 막은 것과 같은 계열이다. 고칠 때 DELETE에도 `isUuid` 검사를 넣고 이 경로의 테스트를 함께 추가한다.
- 아직 고정 문장으로 바뀌지 않은 곳: `presets/route.ts` 59·176·192행, `itembooks/[id]/route.ts` 62·98·141행, `today/[id]/route.ts` 46·57행.

### 진행 상황 (2026-09-26, 티켓 20260926_1603)
- export·ids 라우트 15개(오류 17곳)는 고정 문장 + `console.error`로 바꿨다(병합 완료).
- **남은 곳(게이트 발견물)**: `jam-web/src/lib/admin/drop-exclusion-list.ts:113`이 `throw new Error(error.message)`로 DB 원문을 던진다. 지금은 `drop-policy/exclusions/ids`의 `catch`가 막지만 다른 호출부가 생기면 노출된다(`[주의]`). `item-badges/export/route.ts:50-64`의 기존 고정 문장은 어미가 「~하지 못했습니다」라 이번 형식(「~하지 못했어요」)과 다르다(`[참고]`).

### 진행 상황 (2026-09-26, 티켓 20260926_1602)
- 공용 헬퍼 `updateByIdsAllOrNothing`(8개 라우트가 공유), 프리셋 목록·저장·상세·삭제(4개 핸들러), `users/[id]`(조회 오류), `drop-policy/exclusions/bulk`(배지 조회), `missions/[id]`·`itembooks/[id]`·`today/[id]`는 고정 문장 + `console.error`로 바꿨다(병합 완료). 프리셋 DELETE에는 `isUuid` 검사도 추가했다.
- **남은 곳(게이트 발견물)**: `jam-web/src/lib/admin/user-actions.ts`의 `hardDeleteUser`가 `userError.message` 등 DB 원문을 `error`로 반환하고 `users/[id]`가 그대로 응답에 싣는다(37·47·57·58·75·87·94행, `[주의]`). `bulk/server.ts`의 `deleteByIds`는 `reasonFor` 기본값으로 `singleError.message`를 건너뛴 항목의 사유에 실어 응답한다(`[참고]`, 어드민에게 「참조 중」 같은 이유를 보여 주는 용도라 별도 판단이 필요하다).
- 그 밖의 어드민 라우트(아래 「배경」에 적지 않은 곳: `poi/[id]`, `tribes`, `recipes`, `badges/bulk` 등)의 `error.message` 응답 노출도 남아 있다.

### 배포 전 점검에서 재확인 (2026-09-26, 민지 모드 ②·③, 프로덕션 5ab1e2db 배포)
- 아직 원문을 응답에 싣는 라우트(모두 어드민 인증 뒤): `itembooks/route.ts:11,51`, `itembooks/search/route.ts:28`, `today/route.ts:15,39`, `today/search/route.ts:29`, `today/bulk/route.ts:33`, `users/[id]/badge-diagnosis/route.ts:52`, `users/[id]/reset/route.ts:26`, `users/[id]/admin-role/route.ts:31,36`, `poi/[id]/route.ts:65,121,135,188`, `poi/review/bulk/route.ts:47`(`${update.error}`), `abusing/bans/bulk/route.ts:47`, `abusing/bans/ids/route.ts:17`, `abusing/poi-blocks/bulk/route.ts:43`, `abusing/poi-blocks/ids/route.ts:14`, `activity-badge-image/generate/route.ts:105`, `asset-generator/apply/route.ts:193`, `badge-image/generate/route.ts:134`, `lib/admin/applyGeneratedImage.ts:79`.
- `drop-policy/route.ts:65-70`은 주석에 「운영자가 원인을 특정하게 노출한다」는 의도가 적혀 있어 의도된 예외로 보인다. 정리할 때 유지할지 정한다.
- 이번 정리에서 새로 넣은 `console.error(…, error)`가 오류 객체 전체를 남겨 Postgrest `details`에 행 값(예: 유니크 위반의 `Key (col)=(값)`)이 실릴 수 있다(`[참고]`, 확신도 낮음). 로그 열람 권한 범위만 인지해 둔다.

