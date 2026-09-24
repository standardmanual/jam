---
id: "20260925_0239"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
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
