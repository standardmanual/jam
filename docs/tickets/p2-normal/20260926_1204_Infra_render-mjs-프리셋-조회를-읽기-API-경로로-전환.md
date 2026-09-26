---
id: "20260926_1204"
category: Infra
priority: P2
status: OPEN
created: 2026-09-26
closed:
parent: "20260926_1202"
specs:
  - docs/specs/prd/asset-generator/PRD.md
---

# [Infra] render.mjs 프리셋 조회를 어드민 읽기 API 경로로 전환하고 프리셋 목록 스크립트를 추가한다

> 상위 티켓 [20260926_1202](20260926_1202_Feature_예약실행에서-윤진-이미지-생성-상위.md). 선행: 20260926_1203.

## 핵심 요약

- 요구사항: `render.mjs`가 서비스 롤 키 없이 어드민 읽기 API(`ADMIN_API_BASE_URL` + `ADMIN_API_READ_TOKEN`)로 프리셋을 받아 렌더한다. 윤진이 프리셋 이름·대상 유형으로 프리셋 id를 찾는 목록 스크립트도 만든다.
- 구현 계획: 프리셋 조회를 `presetSource.mjs`로 분리한다. API 환경변수가 있으면 API 경로, 없으면 지금의 서비스 롤 키 경로(로컬 세션용)를 쓰고, 어느 경로를 썼는지 출력 JSON에 `presetSource`로 남긴다. 환경변수는 `.env.local`과 `process.env`를 모두 읽는다.
- 관련 파일: `jam-web/scripts/asset-generator/render.mjs`(`main()` 74~98행 프리셋 조회, 55~56·106행 인자·`loadEnv`), 신규 `presetSource.mjs`·`list-presets.mjs`, `jam-web/scripts/lib/loadEnv.mjs`(`.env.local`만 읽음), `jam-web/src/lib/asset-generator/presetSerialize.ts`(`toAssetPreset`, `PRESET_TARGET_TYPES`), 테스트 `jam-web/scripts/asset-generator/__tests__/`

## 배경 / 문제 정의

예약 환경에는 `ADMIN_API_READ_TOKEN`만 있고 서비스 롤 키는 두지 않는다(`scheduled-jobs.md` 4-1). 현재 `render.mjs`는 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 없으면 즉시 실패한다. `loadEnv()`는 `.env.local` 파일만 읽어 `process.env`로 주입되는 예약 환경 변수를 볼 수 없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `presetSource.mjs`(순수 함수 + 주입 가능한 `fetch`): `fetchPresetFromAdminApi({ baseUrl, token, presetId, fetchImpl })`은 `GET {baseUrl}/api/admin/asset-generator/presets/{id}`를 `x-admin-read-token` 헤더로 호출하고, 응답의 `preset`(camelCase: `stageRatio`·`layers` 이미 역직렬화됨)을 `render.mjs`가 쓰는 형태로 맞춘다. DB 행 경로는 snake_case(`stage_ratio`, 직렬화 상태의 `layers`)를 돌려주므로 두 경로의 결과를 같은 내부 형태로 정규화하는 함수를 둔다(이중 역직렬화 주의).
- 404·403·네트워크 오류는 한국어 메시지로 종료 코드 1로 끝낸다. 토큰 값은 로그에 찍지 않는다.
- 환경변수 읽기: `.env.local` 값과 `process.env`를 합친다(`process.env`가 우선). 이 합치기는 `render.mjs`·`list-presets.mjs`에서만 하고 `loadEnv()` 공용 함수는 바꾸지 않는다(다른 스크립트 영향 방지).
- API 경로를 쓸 때는 `SUPABASE_SERVICE_ROLE_KEY`를 요구하지 않는다. 두 경로 모두 불가능하면 어느 값이 없는지 알려 준다.
- `list-presets.mjs --target-type <badge|mission|collection|home_feed>`: 목록 API를 호출해 `id · 이름 · 비율`을 한 줄씩 출력한다(윤진이 「대상 유형이 home_feed이고 이름이 `홈피드`」인 프리셋을 찾는 용도).
- 출력 JSON에 `presetSource`(`admin-api` | `service-role`)를 추가한다(기존 필드 유지).

## 구현 계획

1. `presetSource.mjs` 작성 + 단위 테스트(가짜 `fetch`로 200·404·403·형태 정규화 검증).
2. `render.mjs` 조회 부분을 교체하고 정규화된 결과를 기존 코드에 연결.
3. `list-presets.mjs` 작성 + 테스트.
4. `render.mjs` 상단 주석의 「필요 환경변수」 절을 두 경로 기준으로 갱신.
5. `docs/specs/prd/asset-generator/PRD.md` §8 실행 환경 서술 갱신(서비스 롤 키 필요 → 읽기 API 또는 서비스 키).

## 완료 조건

- `ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN`만 있고 `SUPABASE_SERVICE_ROLE_KEY`가 없는 환경에서 `render.mjs`가 staging의 `홈피드` 프리셋으로 PNG를 만든다(스테이징 API가 1203을 반영한 뒤 실측). 같은 프리셋·색·텍스트·시드로 서비스 롤 키 경로가 만든 PNG와 바이트 단위로 같다.
- 두 경로 모두 불가능하면 어느 환경변수가 없는지 한국어로 알리고 종료 코드 1이다(자동 테스트).
- `list-presets.mjs --target-type home_feed`가 `홈피드` 프리셋의 id를 출력한다.
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 없음 (내부 스크립트)

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
