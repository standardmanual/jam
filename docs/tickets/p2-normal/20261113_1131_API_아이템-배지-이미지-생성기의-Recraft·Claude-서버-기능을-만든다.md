---
id: "20261113_1131"
category: API
priority: P2
status: OPEN
created: 2026-11-13
---

# [API] 아이템 배지 이미지 생성기의 Recraft·Claude 서버 기능을 만든다

> 2026-11-13 갱신: 입력이 `gaze_motion`에서 `badges.form_description`(티켓 20261113_1145)으로 바뀌었다. Claude는 한국어 형태 묘사를 영어 한 문장으로 옮긴다. 의인화 금지를 지시문·고정 문장·네거티브에 반영했다.

> 묶음: 20261113_1145(형태 묘사) · 20261113_1130(DB) → **20261113_1131(서버)** → 20261113_1132(어드민 화면). 1130의 표와 행 타입이 staging에 머지된 뒤 시작한다.

## 핵심 요약

- 요구사항: 어드민 이미지 생성기의 서버 쪽을 만든다. 프리셋 관리, 컬렉션·아이템 조회, Claude 묘사 문장 작성·수정, Recraft 후보 2장 생성, 적용(배경 제거 → 규격 후처리 → 글자 검사 → 4등급 `image_url` 일괄 반영), 되돌리기. Claude 호출은 최소화한다.
- 구현 계획: 순수 로직은 `jam-web/src/lib/admin/badgeImageGenerator/`에 모듈 5개로, API는 `jam-web/src/app/api/admin/badge-image-generator/` 아래 라우트 6개로 나눈다(아래 「구현 계획」 파일 단위 지도). 외부 SDK는 새로 설치하지 않고 `fetch`로 호출한다.
- 관련 파일: 새 파일 위주. 재사용 — `jam-web/src/lib/admin/auth.ts`의 `getAdminUser()`(58줄), `jam-web/src/lib/supabase/server`의 `createServiceClient`, `jam-web/src/lib/admin/applyGeneratedImageConstants.ts`의 `APPLY_GENERATED_IMAGE_BUCKET`(`'images'`), `jam-web/src/lib/admin/badgeImageWebp.ts`의 `convertBadgeImageToWebp()`(19줄). 참고 패턴 — `jam-web/src/app/api/admin/asset-generator/apply/route.ts`(PNG+WebP 업로드 후 `image_url`에 `?v=` 붙인 WebP 주소, `image_source: 'admin-generator'`, 225~250줄). 행 타입 — `jam-web/src/types/database.ts`(1130에서 추가한 3개). 요청 양식 원문은 이 티켓 「요청 양식」 절.

## 배경 / 문제 정의

1130 티켓 참고. 확정 사항(2026-11-10~13 사용자 결정):
- 대상은 `badges.form_description`(티켓 20261113_1145, 한국어 형태 묘사) 값이 있는 아이템 배지 450종. 아이템 = (`item_book_id`, `name`) 묶음이며 항상 4행(4등급), 4행이 같은 `image_url`을 쓴다(2026-11-13 DB 확인: 450묶음 모두 4행).
- 이미지 규격: 1024×1024 투명 PNG, 그림은 캔버스 85%(870px) 정사각 상자 안에 비율 유지로 맞춰 정중앙.
- 이미지 안에 어떤 텍스트도 넣지 않는다(문자·숫자·기호·라벨·서명·로고·글자 비슷한 무늬). 적용 전 검사에서 보이면 적용을 막는다.
- 토큰 최소화: Claude는 ① 영어 묘사 문장이 없거나 `source_hash`가 지금 `form_description`과 다를 때(형태 묘사를 영어로 옮김) ② 불만족 사항을 반영할 때 ③ 적용 전 글자 검사(256px로 줄인 1장) 세 곳에서만 부른다. 「다시 뽑기」와 운영자 직접 수정은 Claude를 부르지 않는다.

## 상세 요구사항

### 요청 양식

최종 프롬프트 = `description_en` + `' '` + `preset.composition_text` + `' '` + `preset.forbid_text`

Recraft 요청 본문(`POST https://external.api.recraft.ai/v1/images/generations`, 헤더 `Authorization: Bearer ${RECRAFT_API_KEY}`):
```json
{ "prompt": "<최종 프롬프트>", "style_id": "<preset.style_id>", "model": "<preset.model>",
  "size": "1024x1024", "n": 2, "response_format": "url",
  "negative_prompt": "<preset.negative_prompt>",
  "controls": { "no_text": true, "background_color": { "rgb": [r, g, b] } } }
```
- `negative_prompt`와 `controls.no_text`는 `model`이 `recraftv3`일 때만 넣는다(다른 모델은 지원하지 않음).
- `background_color`는 `preset.background_color` hex를 rgb 배열로 바꾼다.

Claude(`POST https://api.anthropic.com/v1/messages`, 헤더 `x-api-key: ${ANTHROPIC_API_KEY}`, `anthropic-version: 2023-06-01`, 모델 상수 `claude-haiku-5-5` 한 곳에만 둔다):

묘사 작성(번역) — system:
```
Translate the Korean object description into ONE English sentence (15-45 words) for an image prompt.
Rules:
1. Keep only the physical appearance: shape, size cue, material, color, one state, one small imperfect detail.
2. One object, or one compact group of the same object. No people, hands, places, names.
3. No faces, eyes, expressions or human-like behavior.
4. Never mention text, letters, numbers, labels, logos or writing. Surfaces are plain.
5. No style, lighting, angle, background or evaluative words.
Output the sentence only.
```
user: `Item: <item_name>\nDescription: <form_description>` · `max_tokens: 120`

묘사 수정 — system: `Revise this object description to address the feedback. Keep all rules of the original sentence (one object or one compact group, no faces or eyes, no text on surfaces, no style or lighting words). Output the revised sentence only.` · user: `Description: <현재 문장>\nFeedback: <불만족 사항>` · `max_tokens: 120`

글자 검사 — 256×256으로 줄인 PNG를 base64 이미지 블록으로 보내고 system: `Look at the image. Reply with exactly YES if any text, letters, numbers, symbols, signatures, logos or letter-like marks are visible anywhere, otherwise reply with exactly NO.` · `max_tokens: 5`. 응답이 `NO`로 시작할 때만 통과, 그 외(YES·해석 불가·호출 실패)는 통과시키지 않는다.

Claude 응답 문장은 앞뒤 공백·따옴표를 지우고 줄바꿈을 공백으로 바꿔 한 줄로 저장한다.

### 서비스/코드베이스 관점

모든 라우트는 `getAdminUser()`가 null이면 401. DB 접근은 `createServiceClient()`.

1. **프리셋** `presets/route.ts` — `GET` 활성·비활성 전체 목록, `POST` 생성(이름·style_id·model·고정 문장 2개·negative·배경색), `PATCH` 수정(고정 문장·model·negative·배경색·style_id 중 하나라도 바뀌면 `version` +1, `updated_at` 갱신). 각 프리셋에 그 프리셋으로 `status='applied'`인 아이템 수(`appliedCount`)를 함께 돌려준다.
2. **컬렉션·아이템 조회** `items/route.ts` — `GET ?q=` 컬렉션 이름 검색(`form_description` 값이 있는 배지를 가진 컬렉션만, 최대 30개). `GET ?bookId=` 그 컬렉션의 아이템 목록: `item_name`, `form_description`, 현재 공통 `image_url`, 저장된 `description_en`·`source`, 원문 변경 여부 `stale`(저장된 `source_hash`가 지금 `form_description`의 sha256과 다르면 true), 상태(`none` 이미지 없음 / `candidates` 적용 안 된 생성 기록 있음 / `applied` 이미지 있음), 그 아이템의 최근 생성 기록 10개, 그리고 이 컬렉션에서 마지막으로 쓴 `preset_id`(최근 생성 기록 기준, 없으면 null).
3. **묘사 문장** `describe/route.ts` — `POST { bookId, itemName, manualText?, feedback? }`. `manualText`가 있으면 Claude 없이 그대로 저장(`source='manual'`). `feedback`이 있으면 저장된 문장 + 피드백으로 묘사 수정 호출. 둘 다 없으면 형태 묘사를 영어로 옮기는 호출(저장본이 있고 `stale`이 아니면 Claude 없이 저장본 반환 — `force: true`일 때만 다시 옮김). 결과를 `source_hash`와 함께 `badge_image_item_prompts`에 upsert.
4. **생성** `generate/route.ts` — `POST { bookId, itemName, presetId, feedback? }`. 저장된 묘사 문장이 없으면 3번 로직으로 먼저 작성, `feedback`이 있으면 3번의 수정 로직을 먼저 탄다. 요청 양식대로 Recraft 호출(n=2). 받은 후보 2장을 내려받아 저장소 `images` 버킷 `badge-image-generator/<bookId>/<generationId>/candidate-<i>.png`에 올리고, `badge_image_generations`에 프롬프트·`request_json`(API 키 제외)·후보 주소·`preset_version`·`feedback`·`created_by`를 기록한다. 실패하면 `status='failed'`, `error`를 남기고 오류 응답. 응답에 후보별 `touchesEdge`(원본 후보의 바깥 4px 테두리에 배경색과 RGB 거리 40 이상 차이 나는 픽셀이 전체 테두리 픽셀의 1% 이상이면 true — 그림이 잘렸을 가능성 경고)를 함께 준다.
5. **적용** `apply/route.ts` — `POST { generationId, index }`. ① 후보 PNG를 내려받아 Recraft `POST /v1/images/removeBackground`(multipart `file`)로 배경 제거 ② 규격 후처리(아래) ③ 후처리 결과를 256px로 줄여 글자 검사 — 통과 못 하면 409 `{ error: 'text_detected' }`로 멈추고 아무것도 바꾸지 않는다 ④ PNG와 WebP(`convertBadgeImageToWebp`)를 `images` 버킷 `badges/item/<bookId>/<itemSlug>-<generationId>.png|.webp`에 올린다 ⑤ 같은 (`item_book_id`, `name`)의 4행 모두 `image_url = <webp 공개주소>?v=<시각>`, `image_source = 'admin-generator'`로 갱신 ⑥ 생성 기록에 `status='applied'`, `applied_index`, `applied_url`, `previous_image_url`(갱신 직전 공통 주소, 없으면 null), `applied_at`. 4행 갱신이 4행이 아니면 오류로 본다.
6. **되돌리기** `revert/route.ts` — `POST { generationId }`. `status='applied'`인 기록만. 4행의 `image_url`을 `previous_image_url`로 되돌리고(null이면 null), 기록을 `status='reverted'`로. 그 뒤에 같은 아이템에 적용된 기록이 있으면 409(최신 적용분만 되돌릴 수 있다).

**규격 후처리** `normalize.ts` — 입력 PNG(배경 제거된 RGBA) → 알파 16 초과 픽셀의 바운딩 박스로 잘라 냄 → 긴 변이 870px가 되도록 비율 유지 확대·축소(`sharp` `resize`, `fit: 'inside'`, lanczos) → 1024×1024 투명 캔버스 정중앙에 합성 → PNG. 알파 영역이 비어 있으면 오류.

## 구현 계획

| 파일 | 내용 |
|---|---|
| `jam-web/src/lib/admin/badgeImageGenerator/prompt.ts` | `buildRecraftPrompt(description, preset)`, `buildRecraftRequest(description, preset)`(모델별 조건부 필드), `hexToRgb()`, `cleanClaudeSentence()` |
| `jam-web/src/lib/admin/badgeImageGenerator/claude.ts` | 모델 상수, system 문자열 3개, `describeItem()`, `reviseDescription()`, `checkImageHasText()`(256px 축소 포함) |
| `jam-web/src/lib/admin/badgeImageGenerator/recraft.ts` | `generateCandidates(body)`, `removeBackground(png)` |
| `jam-web/src/lib/admin/badgeImageGenerator/normalize.ts` | `normalizeBadgeImage(png)`, `candidateTouchesEdge(png, bgHex)`, 상수 `CANVAS_PX=1024`, `BOX_PX=870` |
| `jam-web/src/lib/admin/badgeImageGenerator/items.ts` | 컬렉션 검색·아이템 목록·상태 계산·마지막 프리셋 조회 |
| `jam-web/src/app/api/admin/badge-image-generator/{presets,items,describe,generate,apply,revert}/route.ts` | 위 1~6 |
| `jam-web/src/lib/admin/badgeImageGenerator/__tests__/` | `prompt.test.ts`(조건부 필드·프롬프트 조립·문장 정리), `normalize.test.ts`(sharp로 만든 합성 이미지: 300×100 막대 → 긴 변 870·중앙, 출력 1024×1024 RGBA, 테두리 판정), `claude.test.ts`(fetch 모의: YES/NO/이상 응답 판정, 문장 정리) |

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- `prompt.test.ts`: 모델이 `recraftv3`일 때만 `negative_prompt`·`no_text`가 들어가고, 프롬프트가 묘사+고정 문장 2개 순서로 조립된다.
- `normalize.test.ts`: 투명 배경 위 300×100 불투명 막대 이미지를 넣으면 결과가 1024×1024이고, 불투명 영역 바운딩 박스가 870×290(±2px)이며 중심이 (512, 512)(±2px)이다.
- `claude.test.ts`: 글자 검사 응답이 `NO`일 때만 통과, `YES`·빈 응답·HTTP 오류는 통과하지 않는다.
- 6개 라우트 모두 관리자가 아니면 401을 돌려준다(코드로 확인).
- 적용 라우트는 글자 검사 실패 시 DB·저장소를 바꾸지 않는다(호출 순서로 확인: 업로드·갱신이 검사 뒤에 있다).
- API 키가 응답·`request_json`·로그에 들어가지 않는다.
- `scripts/verify.sh`가 통과한다.

### 후속 범위 (담당: 카리나, 시점: 1132 머지 뒤)
- 로컬 어드민에서 실제 Recraft·Claude 호출로 아이템 1종을 생성·적용·되돌리기 해 본다(비용 약 0.1달러).

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
- 계획 반환 면제: 파일 14개·예상 700줄로 임계값을 넘지만, 구현 계획을 파일 단위로 적었고 설계는 2026-11-10~13 대화에서 사용자가 항목별로 확정했다. 서버 로직과 라우트를 더 쪼개면 라우트 티켓이 로직 티켓을 기다리기만 하므로 한 티켓으로 둔다.
- 배경 제거는 적용 때 한 번만 한다(미리보기는 Recraft 원본). 비용과 대기 시간을 줄이려는 결정.
- Anthropic·Recraft SDK를 새로 설치하지 않는다. 호출이 세 종류뿐이라 `fetch`로 충분하다.

### 잔여 이슈
-
