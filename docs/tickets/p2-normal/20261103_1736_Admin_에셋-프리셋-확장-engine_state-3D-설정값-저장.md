---
id: "20261103_1736"
category: Admin
priority: P2
status: OPEN
created: 2026-11-03
parent: "20261103_1733"
workType: db
---

# [Admin] 에셋 프리셋 확장 — `asset_presets.engine_state`(JSON)를 추가해 3D 설정값(폰트·두께·색·시점)을 저장·불러온다

> 상위 티켓 [20261103_1733](20261103_1733_Feature_3D-모드를-에셋-화면으로-통합-프리셋-확장-상위.md)의 3번. 착수 조건: 2번(20261103_1735) 머지 뒤.
> **DB 변경이 있다** — 구현 에이전트는 마이그레이션 파일(+ 되돌림 SQL) 작성까지만 하고, 실행은 메인 세션이 점검 뒤에 한다(CLAUDE.md 6, `.claude/skills/jam-work/references/db-migration-rules.md`).

## 핵심 요약

- 요구사항: 프리셋을 저장할 때 지금 모드의 설정값을 함께 저장하고, 불러올 때 되살린다. 이번 범위는 3D 모드: 입력(폰트 이름·굵기·글자열·입력 방식, 올린 SVG), 두께(`params` 전체), 색(팔레트·틀·타일), 시점(회전 x·y·z·줌·원근/등각). Shape·Ribbon은 이번에 저장하지 않지만 같은 형식에 나중에 담을 수 있게 한다.
- 구현 계획: ① 마이그레이션 `{번호}_asset_presets_engine_state.sql` — `engine_state JSONB NULL` 칸 추가(확장 단계만, 기존 행·기존 코드 영향 없음)와 되돌림 SQL ② 저장 API(`presets/route.ts` POST)가 `engineState` 폼 값을 받아 검증·저장, 조회 API(`presets/[id]`)가 돌려준다 ③ `PresetPanel`이 저장 때 현재 모드 설정을 보내고, 불러올 때 모드와 설정을 되살린다.
- 관련 파일:
  - `jam-web/supabase/migrations/185_asset_presets.sql`(테이블 원본), `205_asset_presets_stage_ratio_16x9.sql`(최근 변경 예시). 새 번호는 **push 직전 원격 staging 기준**으로 다시 확인한다(2026-11-03 17:33 기준 최신 314).
  - `jam-web/src/app/api/admin/asset-generator/presets/route.ts`(POST: 폼 파싱 110~130줄, update/insert 183~210줄 근처, GET select 60~61줄), `presets/[id]/route.ts`(단건 조회), `presets/__tests__/`
  - `jam-web/src/app/admin/asset-generator/PresetPanel.tsx`(props 58~60줄 `stageRatio`·`overlayLayers`·`onLoadPreset`, 저장 폼 65~90줄)
  - `jam-web/src/app/admin/assets/page.tsx`(`onLoadPreset` 연결, 596줄 근처 `(newStageRatio, newLayers)`), 3D 상태 위치는 1번 티켓 결과를 따른다
  - 타입: `jam-web/src/lib/supabase/database.types.ts`(있다면 `asset_presets` 행 타입에 칸 추가 — `npm run db:types`는 쓰지 않는다, MCP `generate_typescript_types`로 대조)

## 상세 요구사항

### 서비스/코드베이스 관점
- 저장 형식: `engine_state = { "mode": "3d", "version": 1, "state": { ... } }`. 알 수 없는 `mode`·`version`이나 깨진 값은 불러올 때 무시하고(비율·레이어만 불러옴) 경고를 한 줄 보인다.
- 3D `state`에 담는 값: `source`, `fontFamily`, `fontWeight`, `text`, `params`(형상 매개변수 전체), `paletteId`, `frameColor`, `tileColor`, `rotX`·`rotY`·`rotZ`, `zoom`, `view`. 배경·비율은 프리셋의 기존 필드·에셋 공통 상태가 맡는다(중복 저장하지 않는다 — 배경은 Shape와 공유하는 에셋 상태이므로 이번 범위에서는 저장하지 않고 잔여 이슈로 남긴다).
- 올린 SVG: 기본 로고(올린 파일 없음)면 저장하지 않는다. 올린 SVG가 있으면 이미지 레이어 원본과 같은 방식으로 저장소(`asset-generator/presets/{presetId}/`)에 파일로 올리고 `state`에는 그 URL만 담는다(행에 큰 문자열을 넣지 않는다).
- 서버 검증: `engineState`는 JSON 객체, 크기 상한(예: 32KB), `mode`가 허용 값, 숫자 필드는 유한수. 실패하면 400과 `[현상] → [원인] → [해결책]` 한국어 메시지.
- 기존 프리셋(칸이 비어 있음)을 불러오면 지금처럼 비율·레이어만 불러온다(회귀 없음).
- 자동 경로(윤진 CLI 등 프리셋을 읽는 다른 코드)는 새 칸을 몰라도 그대로 동작해야 한다.

### UI/UX 관점
- 3D 모드에서 프리셋을 저장하면 3D 설정이 함께 저장된다는 안내를 프리셋 섹션에 한 줄 보인다(해요체).
- 3D 설정이 든 프리셋을 Shape·Ribbon 모드에서 불러오면 3D 모드로 바꾸고 설정을 되살린다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 마이그레이션 파일과 되돌림 파일이 있다: `engine_state JSONB` 칸 추가(NULL 허용, 기본값 없음), 되돌림은 칸 삭제. 기존 행·제약·RLS를 건드리지 않는다. 다시 실행해도 안전하다(`IF NOT EXISTS`).
- POST가 `engineState`를 검증해 저장하고, 단건 조회가 돌려준다(라우트 시험: 정상·형식 오류·크기 초과·칸 없음).
- `PresetPanel`이 3D 모드에서 저장할 때 위 `state`를 보내고, 불러올 때 모드와 값을 되살린다(시험: 직렬화 → 역직렬화 왕복이 같은 상태). 깨진 `engine_state`는 무시하고 경고한다.
- 기존 프리셋(칸 없음) 불러오기가 그대로다(시험).
- `npm run lint`·`typecheck`·`test`가 통과한다(`scripts/verify.sh`).

### 후속 범위 (담당: 카리나, 시점: 머지 뒤, push 전)
- **마이그레이션 실행 순서**: 칸을 읽는 코드가 배포되기 전에 DB에 칸을 먼저 만든다(공유 DB). 실행 전 점검(되돌림 SQL 확인, `DO` 블록 롤백 실측) → 실행 → 읽기 전용 확인(칸 존재·기존 행 수 그대로) → 결과 보고.
- 로컬 실렌더로 3D 프리셋을 하나 저장했다가 불러와 설정이 되살아나는지 확인한다(시험 프리셋은 확인 뒤 지운다 — 공유 DB).

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
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
