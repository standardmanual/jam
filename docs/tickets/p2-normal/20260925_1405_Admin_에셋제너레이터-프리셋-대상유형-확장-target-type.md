---
id: "20260925_1405"
category: Admin
priority: P2
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
parent: "20260925_1404"
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
---

# [Admin] 에셋 제너레이터 프리셋 대상 유형 확장(target_type)

> 상위 티켓 [20260925_1404](20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)
> 하위 1번. 기획 경위·결정 기록·리스크는 상위 티켓 참고.

## 핵심 요약

- 요구사항: `asset_presets.target_type`의 CHECK 제약을 `'badge'` 단일값에서
  `'badge'|'mission'|'collection'|'home_feed'` 4개로 확장한다. 프리셋 저장 화면(`PresetPanel.tsx`)에
  대상 유형 선택 UI를 추가하고, "프리셋 불러오기" 목록이 현재 작업 중인 콘텐츠 유형으로 필터링되게
  한다. 프리셋 하나는 유형 하나에만 속한다(공용 프리셋 아님, 상위 티켓 결정 2).
- 구현 계획: 마이그레이션 파일(`jam-web/supabase/migrations/`, CHECK 제약 확장, 재실행 가능·되돌림
  SQL 포함)을 작성한다(실행은 승인 후 메인 세션). `PresetPanel.tsx`·`presetSerialize.ts`·프리셋 API
  (`/api/admin/asset-generator/presets`)에 `target_type` 값을 다루는 로직을 추가한다. 이 티켓
  자체는 미션·컬렉션·홈피드의 제작·적용 화면을 만들지 않는다(뒤 하위 티켓 몫) — 프리셋 저장·목록
  단계에서 유형을 고를 수 있는 것까지만.
- 관련 파일: `jam-web/supabase/migrations/185_asset_presets.sql`(참고, CHECK 원본),
  `jam-web/src/app/admin/asset-generator/PresetPanel.tsx`, `jam-web/src/lib/asset-generator/presetSerialize.ts`,
  `jam-web/src/app/api/admin/asset-generator/presets/route.ts`

## 배경 / 문제 정의

지금 프리셋은 배지 전용(`target_type` CHECK가 `'badge'` 한 값)이라, 미션·컬렉션·홈피드 프리셋을
저장할 자리가 없다. 유형별로 프리셋을 나누는 이유는 PRD §6 원칙(컬러는 컨텐츠 단위로 정한다)과
맞고, 4종이 같은 프리셋 목록을 공유하면 운영자가 매번 "이 프리셋이 어느 콘텐츠용인지" 기억해야
하는 부담이 생기기 때문이다(상위 티켓 결정 2).

## 완료 조건
- `asset_presets.target_type` CHECK 제약이 4개 값을 허용한다(마이그레이션 파일, 실행은 승인 후).
- 프리셋 저장 화면에서 대상 유형을 골라 저장할 수 있고, 불러오기 목록이 현재 유형으로 필터링된다.
- 기존 배지 프리셋(마이그레이션 185로 만든 것들)이 `target_type='badge'`로 그대로 동작한다(회귀
  없음).
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `asset_presets.target_type` CHECK 제약을 `'badge'` 단일값에서 `'badge'|'mission'|'collection'|'home_feed'`
  4종으로 확장하는 마이그레이션(187) 작성(실행은 승인 후 메인 세션).
- `PresetPanel.tsx`에 대상 유형 선택 `Select` UI 추가 — 선택값이 저장 시 `targetType`으로 전송되고,
  유형 변경 시 불러오기 목록이 `GET ?targetType=` 쿼리로 서버 필터링된다.
- 프리셋 API(GET·POST `/api/admin/asset-generator/presets`)가 `target_type`을 검증(`isPresetTargetType`)·
  저장하도록 확장. 덮어쓰기 시에도 `target_type`을 함께 갱신한다.
- `presetSerialize.ts`에 `PRESET_TARGET_TYPES`·라벨·`isPresetTargetType` 검증 함수 추가,
  `types.ts`의 `AssetPreset.targetType`을 `PresetTargetType`로 확장.
- 미션·컬렉션·홈피드의 제작·적용 화면은 만들지 않음(티켓 범위 명시, 하위 티켓 1406~1411 몫).

### 변경된 파일
```
jam-web/supabase/migrations/187_asset_presets_target_type_expand.sql(신규),
jam-web/src/lib/asset-generator/{types.ts,presetSerialize.ts,__tests__/presetSerialize.test.ts},
jam-web/src/app/api/admin/asset-generator/presets/{route.ts,__tests__/route.test.ts},
jam-web/src/app/admin/asset-generator/PresetPanel.tsx
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과(lint·typecheck·test·ds:check·slop 등). CI(`verify`) 성공:
  https://github.com/standardmanual/jam/actions/runs/36102635347 (커밋 a30577bb)
- [x] 추가한 테스트: `presetSerialize.test.ts`에 `isPresetTargetType` 유효/무효 케이스,
  `route.test.ts`에 GET 필터링·잘못된 값 400, POST 대상 유형 검증 400, 덮어쓰기 시 target_type
  반영 테스트 29개
- [x] 게이트(민지) PASS: 완료 조건 4개 모두 충족, 회귀 위험 없음(확장 전용 마이그레이션, API
  호출자가 PresetPanel 하나뿐), 인가 체크 유지 확인

### 배포 정보
- 배포일: (main 배포 전. DB 마이그레이션 187은 2026-09-25 jam-prod에 적용됨)
- 환경: staging (DB는 프로덕션 공용)
- 커밋: d4223f0(staging 병합), a30577bb(구현 커밋)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 | 258,066 | 63,472 / 13,176 | 18분 53초 | 151 |
| 합계 | 아현·민지 | 258,066 | 63,472 / 13,176 | 18분 53초 | 151 |

### 주요 의사결정 / 핵심 메모
- 유형 `admin`(라이트 파이프라인, 아현 → 민지), 경로 ③ 표준(admin은 채원 판정 대상 제외).
- 계획 반환 면제 없이 호출했는데 실제 diff(7개 파일·230줄)가 `plan_only` 임계값을 넘겨(민지
  [주의]), 규모 사전 판정 재발 관찰용 티켓 [20260925_1529](20260925_1529_Infra_jam-work-규모-사전판정-plan-only-임계값-과소추정-재발.md)(P2)를
  범위 밖 발견물로 자동 생성했다. 실제 변경은 티켓 범위 안이라 게이트 판정은 불변.
- 아현 가정: "선택 UI"를 PresetPanel 로컬 드롭다운으로 구현(AssetGeneratorPanel·ApplyTab.tsx엔
  prop 미추가). GET `targetType` 쿼리는 옵션(생략 시 전체 반환, 하위 호환). 대상 유형 변경 시
  `activePresetId` 초기화(다른 유형 덮어쓰기 사고 방지).

### 잔여 이슈
- 없음. 마이그레이션 187은 2026-09-25 사용자 승인 후 카리나가 Supabase MCP `apply_migration`으로
  jam-prod(`ceehnkzdbecxwzxrhhns`)에 적용했다. 검증: CHECK 제약이 4개 값(`badge`·`mission`·
  `collection`·`home_feed`)을 허용, `asset_presets` 기존 행 0건(회귀 대상 없음).
