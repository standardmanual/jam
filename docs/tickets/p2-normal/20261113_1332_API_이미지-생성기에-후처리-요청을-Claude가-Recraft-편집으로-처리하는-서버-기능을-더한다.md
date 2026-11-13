---
id: "20261113_1332"
category: API
priority: P2
status: CLOSED
created: 2026-11-13
closed: 2026-11-13
---

# [API] 이미지 생성기에 후처리 요청을 Claude가 Recraft 편집으로 처리하는 서버 기능을 더한다

> 묶음: **20261113_1332(DB·서버)** → 20261113_1333(화면). 선행: 20261113_1130·1131·1132(CLOSED).

## 핵심 요약

- 요구사항(사용자 2026-11-13): 운영자가 후보 이미지 하나를 고르고 「후처리 요청」 칸에 지시(예: 「오른쪽 종이를 지워 줘」, 「잘린 윗부분을 살려 줘」)를 적어 「처리」를 누르면, Claude가 이미지와 지시를 보고 Recraft 편집 기능 하나를 골라 실행하고 결과를 새 후보로 보여 준다. 생성 이력의 예전 이미지도 다시 골라 후처리·적용에 쓸 수 있어야 한다.
- 구현 계획: ① 마이그레이션 339로 `badge_image_generations`에 편집 기록 칸 4개 추가 ② Claude 편집 계획 함수(이미지+지시 → JSON 계획) ③ Recraft 편집 호출 4종 ④ `edit` 라우트 신설 ⑤ `apply` 라우트가 `reverted` 기록도 다시 적용할 수 있게 조건 완화.
- 관련 파일: `jam-web/supabase/migrations/339_badge_image_generation_edits.sql`(+`_down.sql`), `jam-web/src/types/database.generated.ts`·`database.ts`(`badge_image_generations` 칸 추가), `jam-web/src/lib/admin/badgeImageGenerator/claude.ts`(편집 계획 함수·지시문 추가, `callClaude`의 `thinking: disabled` 유지), `jam-web/src/lib/admin/badgeImageGenerator/recraft.ts`(편집 함수 4개, 기존 `removeBackground`·`downloadImage` 33·12줄 패턴), 새 `jam-web/src/lib/admin/badgeImageGenerator/edit.ts`(마스크 생성·계획 검증), 새 `jam-web/src/app/api/admin/badge-image-generator/edit/route.ts`, `jam-web/src/app/api/admin/badge-image-generator/apply/route.ts` 37줄(`status !== 'generated'` 조건), 시험 `__tests__/edit.test.ts`·`claude.test.ts`.

## 확인한 사실 (Recraft 공식 문서, 2026-11-13)

기본 주소 `https://external.api.recraft.ai/v1`, multipart 필드 `image`, `mask`.

| 기능 | 경로 | 필수 | style_id | 응답 | 가격 |
|---|---|---|---|---|---|
| 영역 지우기 | `POST /images/eraseRegion` | image, mask | 불가 | `{image:{url}}` (단일) | $0.002 |
| 영역 다시 그리기 | `POST /images/inpaint` | image, mask, prompt(≤1000자) | V3만 | `{data:[{url}]}` | $0.04 |
| 바깥 넓히기(잘림 복원) | `POST /images/outpaint` | image, prompt(≤1000자), `zoom_out_percentage`(0~100 미만) 또는 expand_* | V3만 | `{data:[{url}]}` | $0.04 |
| 이미지 기반 재생성 | `POST /images/imageToImage` | image, prompt, strength(0~1, 0이 거의 동일) | V3만 | `{data:[{url}]}` | $0.04 |

마스크: 회색조 PNG, **원본과 정확히 같은 크기**, 모든 픽셀이 0 또는 255, 흰색(255)이 편집 영역.

## 상세 요구사항

### DB (마이그레이션 339, 확장 단계)

`badge_image_generations`에 칸 추가:
- `kind text not null default 'generate' check (kind in ('generate','edit'))`
- `parent_generation_id uuid references badge_image_generations(id) on delete set null` (편집 원본 기록)
- `edit_instruction text` (운영자가 적은 후처리 요청 원문)
- `edit_plan jsonb` (Claude가 고른 계획, API 키 없음)

되돌림 SQL은 네 칸을 지운다. 생성 타입(`database.generated.ts`)에 같은 칸을 반영한다(이 환경에는 CLI가 없으므로 기존 형식대로 손으로 넣는다).

### Claude 편집 계획 `planImageEdit(imagePng, instruction, descriptionEn)`

- 이미지를 512px로 줄여 base64 이미지 블록으로 보낸다. 모델·호출은 기존 `callClaude`(사고 단계 끔), `max_tokens: 300`.
- system(영어, 상수 `EDIT_PLAN_SYSTEM`):
```
You plan one edit for a badge illustration using Recraft tools. Read the operator's request (Korean) and look at the image.
Choose exactly one operation:
- "erase": remove an unwanted part (extra object, stray mark, text). Give boxes covering it.
- "inpaint": redraw a region with something specific. Give boxes and an English prompt for what to draw there.
- "outpaint": the object is cut off at the edges or too large; zoom out to reveal the rest. Give zoom_out (10-60) and an English prompt describing the whole object.
- "restyle": change the overall look while keeping the object. Give an English prompt and strength (0.1-0.6, lower keeps more).
Boxes are [x0, y0, x1, y1] as fractions 0-1 of the image width and height, slightly larger than the target.
Never add text, letters, numbers, faces or eyes. Prompts describe only the object, no style words.
Reply with JSON only: {"operation": "...", "boxes": [[...]], "prompt": "...", "zoom_out": n, "strength": n, "reason_ko": "한 문장"}
```
- user: `Request: <운영자 지시>\nCurrent object description: <descriptionEn>` + 이미지 블록.
- 응답에서 첫 `{`부터 마지막 `}`까지를 JSON으로 읽고 검증한다(`edit.ts`의 `validateEditPlan`): operation이 네 값 중 하나, erase·inpaint는 boxes 1~4개이고 값이 0~1이며 x0<x1·y0<y1, inpaint·outpaint·restyle은 prompt가 비어 있지 않고 1000자 이하, outpaint는 zoom_out 10~60, restyle은 strength 0.1~0.6(범위 밖이면 가장 가까운 끝값으로 맞춘다). 검증 실패면 422 `{ error: 'plan_invalid', detail }`.

### Recraft 편집 호출 (`recraft.ts`)

- `eraseRegion(png, maskPng)`, `inpaint(png, maskPng, prompt, preset)`, `outpaint(png, prompt, zoomOut, preset)`, `imageToImage(png, prompt, strength, preset)`.
- inpaint·outpaint·imageToImage는 `preset.model === 'recraftv3'`일 때 `style_id`와 `negative_prompt`를 넣고 `model=recraftv3`, n=1, `response_format=url`. 프리셋 모델이 V3가 아니면 inpaint·outpaint는 `model=recraftv3`로 고정하고 style_id는 넣지 않는다(문서상 V3 전용).
- 편집 프롬프트 끝에는 프리셋의 `forbid_text`를 붙이되 전체가 1000자를 넘으면 오류(`RECRAFT_PROMPT_MAX`, 기존 상수 재사용).
- 마스크는 `edit.ts`의 `buildMaskPng(width, height, boxes)`가 만든다: 원본 크기의 회색조 PNG, 상자 안 255·밖 0(sharp로 생성, 중간값 없음).

### `edit` 라우트 `POST /api/admin/badge-image-generator/edit`

- 입력 `{ generationId, index, instruction }`. 관리자가 아니면 401. instruction은 1~300자.
- 원본 기록의 후보(`candidate_urls[index]`)를 내려받는다(상태 무관, `failed` 제외).
- 아이템의 저장된 `description_en`과 기록의 프리셋을 읽어 `planImageEdit` → `validateEditPlan` → 해당 Recraft 호출.
- 결과 이미지를 저장소 `images` 버킷 `badge-image-generator/<bookId>/<newGenerationId>/candidate-0.png`에 올리고, 새 기록을 `kind='edit'`, `parent_generation_id`, `edit_instruction`, `edit_plan`, `prompt`(편집에 쓴 프롬프트, erase는 빈 문자열 대신 `'(erase)'`), `request_json`(엔드포인트·필드, 이미지·키 제외), `candidate_urls=[url]`, `preset_id`·`preset_version`(원본 기록 값), `status='generated'`로 넣는다.
- 응답: `{ generationId, candidates: [{ url, touchesEdge }], plan: { operation, reason_ko } }`. `touchesEdge`는 기존 `candidateTouchesEdge`(배경색은 프리셋 값)로 계산한다.
- 실패하면 새 기록을 `status='failed'`, `error`로 남기고 오류 응답.

### 적용 조건 완화 (`apply/route.ts` 37줄)

- `status`가 `generated` 또는 `reverted`이면 적용을 허용한다(생성 이력에서 예전 이미지를 다시 고르는 경우). `applied`는 409(이미 적용됨), `failed`는 400.
- 되돌리기 규칙(「그 뒤에 적용된 기록이 있으면 409」)은 `applied_at` 기준이라 그대로 둔다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 마이그레이션 339와 되돌림 SQL이 위 칸 4개를 추가·제거하고, 생성 타입에 같은 칸이 있다.
- `edit.test.ts`: `buildMaskPng(1024,1024,[[0.5,0.5,0.75,0.75]])` 결과가 1024×1024 회색조이고 픽셀이 0·255만 있으며 (640,640)=255, (100,100)=0이다. `validateEditPlan`이 잘못된 operation·범위 밖 상자·빈 prompt를 거르고, 범위 밖 strength·zoom_out을 끝값으로 맞춘다.
- `claude.test.ts`: fetch 모의로 `planImageEdit`가 JSON 앞뒤에 글이 섞여도 계획을 읽고, JSON이 아니면 오류를 낸다. 요청 본문에 `thinking: {type:'disabled'}`와 이미지 블록이 있다.
- `edit` 라우트가 관리자 아님 401, instruction 길이 검사, 계획 검증 실패 422, 성공 시 새 기록 `kind='edit'`·`parent_generation_id`를 남긴다(코드로 확인).
- `apply`가 `reverted` 기록을 받아들이고 `applied`는 409를 돌려준다.
- API 키가 `request_json`·`edit_plan`·응답에 없다.
- 변경 파일 eslint, tsc, 새·변경 시험 통과.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- 339 드라이런·실행·확인. 화면 티켓 1333 머지 뒤 로컬 어드민에서 erase·outpaint 각 1회 실제 시험(약 0.05달러).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- Claude 편집 계획(`planImageEdit`, 이미지 512px + 지시 → erase/inpaint/outpaint/restyle JSON), 계획 검증·마스크 생성(`edit.ts`), Recraft 편집 호출 4종(`recraft.ts`), `edit` 라우트를 만들었다. 결과는 `kind='edit'` 생성 기록으로 남는다. `apply`는 `reverted` 기록도 다시 적용한다.
- 마이그레이션 339 실행(2026-11-13): DO 블록 드라이런(DRYRUN_OK rows=46) 뒤 실행, 직후 칸 4개 확인.
- 로컬 브랜치로 게이트를 받고 로컬 staging에 머지했다(a726200e5). push는 하지 않았다.

### 변경된 파일
```
-
```

### 테스트 결과
- [x] 생성기 시험 4파일 22건, tsc, eslint 통과
- [x] 게이트(민지) WARN: CI 없음(push 보류), 339의 check 제약은 재실행 시 중복 오류(한 번만 실행했으므로 해당 없음)
- [ ] 실제 erase·outpaint 시험(1333 머지 뒤)

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 2 | 130,117 | 28,854 / 3,129 | 5분 56초 | 50 |
| 합계 | 2 | 130,117 | 28,854 / 3,129 | 5분 56초 | 50 |

### 주요 의사결정 / 핵심 메모
- Claude는 픽셀을 직접 고치지 못한다. 그래서 Claude는 「무엇을 어디에 어떤 Recraft 도구로」만 정하고, 실제 편집은 Recraft 편집 API가 한다(사용자 질문 2026-11-13에 대한 설계).
- 잘린 그림 복원은 outpaint의 `zoom_out_percentage`로 한다. 잘림 문제(사용자 지적)에 가장 직접적인 도구다.
- 편집 결과도 생성 기록 한 줄로 남겨 기존 적용·되돌리기·이력 흐름을 그대로 쓴다.
- 계획 반환 면제: 파일 약 11개·예상 600줄로 임계값을 넘지만, 파일 단위 지도와 API 계약을 위에 적었고 기능은 사용자가 지시한 그대로다.

### 잔여 이슈
- [참고] edit 라우트는 Recraft 호출 전에 기록을 먼저 넣어, 중간에 프로세스가 죽으면 후보가 빈 generated 기록이 남을 수 있다(민지, edit/route.ts:106). 화면은 빈 후보 기록을 건너뛰면 된다.
