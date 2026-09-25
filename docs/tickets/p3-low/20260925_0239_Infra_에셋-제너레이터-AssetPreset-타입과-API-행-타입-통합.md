---
id: "20260925_0239"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
---

# [Infra] 에셋 제너레이터 `AssetPreset` 타입과 API 응답 행 타입을 하나로 합친다

> 티켓 20260924_2159 게이트 리뷰에서 민지가 낸 범위 밖 발견물(`[참고]`)을 3.2절대로 자동 티켓화했다.

## 핵심 요약

- 요구사항: `jam-web/src/lib/asset-generator/types.ts`의 `AssetPreset` 인터페이스(약 140줄)가 프리셋 API 라우트에서 재사용되지 않고, 라우트가 `PresetRow`·`PresetDetailRow`를 따로 정의한다. 두 형태가 따로 진화하면 어드민 화면·CLI(2201)·등록 스크립트(2202)가 서로 다른 모양을 기대하게 된다.
- 구현 계획: API 응답 타입을 `AssetPreset`(또는 그 부분 타입)에서 파생시키고 `PresetRow`류를 제거한다. `database.generated.ts`의 `asset_presets` Row에서 `AssetPreset`으로 바꾸는 변환 함수를 `presetSerialize.ts`에 둔다.
- 관련 파일: `jam-web/src/lib/asset-generator/types.ts`(`AssetPreset`), `jam-web/src/lib/asset-generator/presetSerialize.ts`, `jam-web/src/app/api/admin/asset-generator/presets/route.ts`·`[id]/route.ts`, `jam-web/src/app/admin/asset-generator/PresetPanel.tsx`

## 배경 / 문제 정의

2201(에이전트 CLI)이 프리셋을 읽어 렌더링하므로 착수 전에 타입을 하나로 모아 두는 편이 안전하다.

## 완료 조건
- 프리셋 API·화면·직렬화 모듈이 같은 `AssetPreset` 타입을 쓰고 `PresetRow`·`PresetDetailRow` 정의가 사라진다.
- 기존 라우트·직렬화 테스트가 그대로 통과한다. `npm run lint`·`npm test` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `PresetRow`(목록·저장 라우트)와 `PresetDetailRow`(상세 라우트) 정의를 없애고 `AssetPreset`에서 파생한 타입으로 통합했다.
- `types.ts`에 `AssetPresetSummary = Pick<AssetPreset, 'id'|'name'|'stageRatio'|'createdAt'|'updatedAt'>`를 추가했다. 목록·저장 응답이 이 형태다.
- `presetSerialize.ts`에 `AssetPresetRow`(생성 타입 `asset_presets` Row), `AssetPresetSummaryRow`, 변환 함수 `toAssetPreset`(행 → `AssetPreset`, 레이어 역직렬화 포함)·`toAssetPresetSummary`(행 → 요약)를 두었다.
- 목록·저장 라우트는 `toAssetPresetSummary`, 상세 라우트는 `toAssetPreset`을 쓴다. `PresetPanel.tsx`의 로컬 `PresetSummary`는 `AssetPresetSummary`로 바꿨다. 라우트 응답 모양·상태 코드는 그대로다.

### 변경된 파일
```
jam-web/src/lib/asset-generator/types.ts
jam-web/src/lib/asset-generator/presetSerialize.ts
jam-web/src/lib/asset-generator/__tests__/presetSerialize.test.ts
jam-web/src/app/api/admin/asset-generator/presets/route.ts
jam-web/src/app/api/admin/asset-generator/presets/[id]/route.ts
jam-web/src/app/admin/asset-generator/PresetPanel.tsx
```

### 테스트 결과
- [x] 기존 라우트·직렬화 테스트 수정 없이 통과. 변환 함수 테스트 3건 추가(`presetSerialize.test.ts`). `tsc --noEmit` 통과. 전체 검증은 `scripts/verify.sh` 결과를 최종 보고에 기록.
- [ ] PresetPanel 실제 화면 확인은 카리나가 병합 뒤 로컬에서 진행(이번 작업에서 하지 않음)

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
- 목록·저장 응답은 레이어·대상 유형·작성자를 담지 않으므로 `AssetPreset` 전체가 아니라 `Pick` 부분 타입(`AssetPresetSummary`)으로 통합했다(티켓의 "또는 그 부분 타입").
- DB 컬럼 `target_type`·`stage_ratio`는 생성 타입상 `string`이라 변환 함수에서 `PresetTargetType`·`StageRatio`로 캐스팅한다. 응답 값은 기존과 같고 별도 검증을 더하지 않았다(라우트 동작 불변 조건).
- `lib/asset-generator`(브라우저·서버 공용)가 생성 타입을 `import type`으로만 참조한다. 타입 전용이라 번들에서 지워진다.

### 잔여 이슈
-

---
## 종료 기록 (2026-09-26, 카리나)

- 병합: 로컬 `staging`에 병합 커밋 a2f35450(구현 fd771d97·7b36efdd). 게이트(민지) **PASS**(재작업 없음), CI `verify` success(run 36156323170). 사용자가 병합과 실렌더를 승인했다(2026-09-26).
- **실렌더 확인(2026-09-26)**: 로컬 `next dev`(`ADMIN_EMAILS` 셸 환경변수)로 에셋 제너레이터 제작 탭의 프리셋 패널을 확인했다. 기준: `asset_presets` 0건.
  - 임시 이름 `[임시-0239] 프리셋`으로 저장하니 목록에 나타났고(`POST`, 새 요약 타입으로 응답) DB 행은 `target_type=badge`·`stage_ratio=1:1`·레이어 0개로 올바르다.
  - 「불러오기」: `GET presets/[id]` 200, 프리셋 이름 입력란에 이름이 채워지고 오류 화면·토스트 없음.
  - 삭제 버튼이 패널에 없어 삭제 라우트를 페이지에서 직접 호출했다: `DELETE presets/[id]` 200 `{ok:true}`, 이어서 `GET`은 404. **`asset_presets`는 다시 0건**이고 임시 행은 남지 않았다. 스토리지 객체는 이미지 레이어가 없는 프리셋이라 만들어지지 않았다.
- 비관리자 403 경로는 실렌더 대상이 아니다(단위 테스트 2건으로 고정, dev-login 계정은 관리자로 통과한다).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차(0239·0240 묶음) | 아현·민지 | 99,720 | 68,564 / 14,818 | 8분 56초 | 38 |
| 합계 | 아현·민지 | 99,720 | 68,564 / 14,818 | 8분 56초 | 38 |

(두 티켓을 한 번의 실행으로 처리해 지표는 묶음 전체 값이다. 두 티켓 모두 같은 값을 적었다.)
