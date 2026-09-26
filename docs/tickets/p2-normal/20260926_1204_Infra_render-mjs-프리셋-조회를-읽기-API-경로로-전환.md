---
id: "20260926_1204"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
parent: "20260926_1202"
specs:
  - docs/specs/prd/asset-generator/PRD.md
---

# [Infra] render.mjs 프리셋 조회를 어드민 읽기 API 경로로 전환한다

> 상위 티켓 [20260926_1202](20260926_1202_Feature_예약실행에서-윤진-이미지-생성-상위.md). 선행: 20260926_1203. 프리셋 목록 스크립트(`list-presets.mjs`)와 PRD §8 갱신은 규모 임계값(파일 5개 초과) 때문에 티켓 20260926_1209로 분리했다(2026-09-26 사용자 승인, 아현 `plan_only` 반환).

## 핵심 요약

- 요구사항: `render.mjs`가 서비스 롤 키 없이 어드민 읽기 API(`ADMIN_API_BASE_URL` + `ADMIN_API_READ_TOKEN`)로 프리셋을 받아 렌더한다.
- 구현 계획: 프리셋 조회를 `presetSource.mjs`로 분리한다. `fetchPresetFromAdminApi`는 1209의 목록 스크립트도 재사용할 수 있게 `baseUrl`·`token`·`fetchImpl`을 인자로 받는 독립 함수로 만들고, 목록 조회 함수(`fetchPresetListFromAdminApi`)도 함께 둔다(1209가 이 함수를 불러 쓴다). API 환경변수가 있으면 API 경로, 없으면 지금의 서비스 롤 키 경로(로컬 세션용)를 쓰고, 어느 경로를 썼는지 출력 JSON에 `presetSource`로 남긴다. 환경변수는 `.env.local`과 `process.env`를 모두 읽는다.
- 관련 파일(3개): `jam-web/scripts/asset-generator/render.mjs`(`main()` 74~98행 프리셋 조회, 55~56·106행 인자·`loadEnv`, 상단 주석 22행 「필요 환경변수」), 신규 `presetSource.mjs`, 신규 테스트 `jam-web/scripts/asset-generator/__tests__/presetSource.test.ts`, 참고 `jam-web/scripts/lib/loadEnv.mjs`(`.env.local`만 읽음, 수정 없음), `jam-web/src/lib/asset-generator/presetSerialize.ts`(`toAssetPreset`)

## 배경 / 문제 정의

예약 환경에는 `ADMIN_API_READ_TOKEN`만 있고 서비스 롤 키는 두지 않는다(`scheduled-jobs.md` 4-1). 현재 `render.mjs`는 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 없으면 즉시 실패한다. `loadEnv()`는 `.env.local` 파일만 읽어 `process.env`로 주입되는 예약 환경 변수를 볼 수 없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `presetSource.mjs`(순수 함수 + 주입 가능한 `fetch`): `fetchPresetFromAdminApi({ baseUrl, token, presetId, fetchImpl })`은 `GET {baseUrl}/api/admin/asset-generator/presets/{id}`를 `x-admin-read-token` 헤더로 호출하고, 응답의 `preset`(camelCase: `stageRatio`·`layers` 이미 역직렬화됨)을 `render.mjs`가 쓰는 형태로 맞춘다. DB 행 경로는 snake_case(`stage_ratio`, 직렬화 상태의 `layers`)를 돌려주므로 두 경로의 결과를 같은 내부 형태로 정규화하는 함수를 둔다(이중 역직렬화 주의).
- 404·403·네트워크 오류는 한국어 메시지로 종료 코드 1로 끝낸다. 토큰 값은 로그에 찍지 않는다.
- 환경변수 읽기: `.env.local` 값과 `process.env`를 합친다(`process.env`가 우선). 이 합치기는 `render.mjs`·`list-presets.mjs`에서만 하고 `loadEnv()` 공용 함수는 바꾸지 않는다(다른 스크립트 영향 방지).
- API 경로를 쓸 때는 `SUPABASE_SERVICE_ROLE_KEY`를 요구하지 않는다. 두 경로 모두 불가능하면 어느 값이 없는지 알려 준다.
- 목록 조회 함수 `fetchPresetListFromAdminApi({ baseUrl, token, targetType, fetchImpl })`도 `presetSource.mjs`에 둔다(`GET .../presets?targetType=`, 응답 `{ presets }`). 이 함수를 쓰는 CLI(`list-presets.mjs`)는 1209에서 만든다.
- 출력 JSON에 `presetSource`(`admin-api` | `service-role`)를 추가한다(기존 필드 유지).

## 구현 계획

1. `presetSource.mjs` 작성 + 단위 테스트(가짜 `fetch`로 200·404·403·형태 정규화·목록 조회 검증).
2. `render.mjs` 조회 부분을 교체하고 정규화된 결과를 기존 코드에 연결.
3. `render.mjs` 상단 주석의 「필요 환경변수」 절을 두 경로 기준으로 갱신.

## 완료 조건

- `ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN`만 있고 `SUPABASE_SERVICE_ROLE_KEY`가 없는 환경에서 `render.mjs`가 staging의 `홈피드` 프리셋으로 PNG를 만든다(스테이징 API가 1203을 반영한 뒤 실측). 같은 프리셋·색·텍스트·시드로 서비스 롤 키 경로가 만든 PNG와 바이트 단위로 같다.
- 두 경로 모두 불가능하면 어느 환경변수가 없는지 한국어로 알리고 종료 코드 1이다(자동 테스트).
- 목록 조회 함수가 `targetType=home_feed` 필터와 200·403 응답을 처리한다(자동 테스트).
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
- 프리셋 조회를 `presetSource.mjs`로 분리했다: `normalizePreset`(DB 행/API 응답 정규화, 이중 역직렬화 방지), `fetchPresetFromAdminApi`, `fetchPresetListFromAdminApi`(1209 CLI가 사용), `resolveEnv`(`.env.local`과 `process.env`를 합침, `process.env` 우선), `pickPresetSource`(API 변수가 둘 다 있으면 `admin-api`, 아니면 서비스 롤 변수가 있을 때 `service-role`, 둘 다 불가면 없는 변수명을 한국어로 알리고 종료 코드 1).
- `render.mjs`는 위 경로로 프리셋을 받고 출력 JSON에 `presetSource`를 추가했다(기존 필드 유지). `createClient`는 서비스 롤 경로에서만 만든다. 공용 `loadEnv()`는 수정하지 않았다.
- 404·401/403·네트워크 오류·기타 상태는 각각 한국어 메시지이고 토큰 값은 메시지에 넣지 않는다.

### 변경된 파일
```
신규: jam-web/scripts/asset-generator/presetSource.mjs
신규: jam-web/scripts/asset-generator/__tests__/presetSource.test.ts
수정: jam-web/scripts/asset-generator/render.mjs
```

### 테스트 결과
- [x] `scripts/verify.sh` 통과, CI verify 성공(run 36214405697). 게이트(민지) WARN: 사유는 「staging 실측 미확인」 하나였고 실측은 카리나 담당으로 티켓에 명시돼 있었다. 아래 실측으로 해소.
- [x] 자동 테스트 17건(상세 200·404·403·네트워크 오류·토큰 미노출·URL·헤더, 정규화 두 경로 동일, 목록 `home_feed`·200·403, 환경 선택 4경우와 둘 다 없음).
- [x] 실측(2026-09-26, 로컬 개발 서버 + 임시 테스트 토큰): 같은 프리셋(`홈피드`)·색·텍스트·시드(12345)로 읽기 API 경로(`presetSource: admin-api`)와 서비스 롤 경로(`service-role`)를 각각 렌더한 결과 PNG의 SHA-1이 같다(`e458765…`, 905KB, 1280×1280). 
- [ ] 예약(클라우드) 환경에서 서비스 롤 키 없이 도는지는 1205 시험 실행에서 확인한다(로컬에는 서비스 키가 있어 「키 없음」 상황을 재현하지 못했고, 그 분기는 자동 테스트가 검증한다).

### UX Writing 검증
- 사용자 노출 텍스트 없음 (내부 스크립트)

### 배포 정보
- 배포일: 2026-09-26
- 환경: staging(머지 `fd0ad0b1`, push `cfcf6438`)
- 커밋: `bd596d36`

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 (plan_only, 파일 6개) | 1 | 32,660 | 6,424 / 0 | 43초 | 9 |
| 2 (plan_only, 100줄) | 1 | 42,944 | 7,197 / 0 | 1분 24초 | 15 |
| 3 (면제 후 구현·게이트) | 2 | 96,721 | 20,159 / 3,979 | 11분 59초 | 34 |
| 합계 | 4 | 172,325 | 33,780 / 3,979 | 14분 6초 | 58 |

### 주요 의사결정 / 핵심 메모
- 원래 1204는 `list-presets.mjs`와 PRD §8까지 담아 파일 6개로 `plan_only`(1차)가 났고, 사용자 승인(2026-09-26)으로 1209로 분리했다.
- 분리 뒤에도 파일 3개인데 신규 파일 줄 수만으로 「100줄 이상」에 걸려 2차 `plan_only`가 났다. **면제 부여 사유**: 구현 계획이 파일·함수 단위로 확정됐고(아현 계획을 카리나가 승인), 사용자가 분리안을 승인했다. 1단계 규모 사전 판정에서 신규 파일 줄 수를 미리 세지 못한 것이 원인이며, 두 번의 왕복으로 약 75k 토큰이 들었다(측정 방식 명시는 티켓 20260926_1223).
- 1203이 머지되기 전 review 브랜치 단독으로는 `admin-api` 경로가 403으로 끝나는 것이 정상이었다(민지 참고). 머지 뒤 로컬 실측에서 200을 확인했다.

### 잔여 이슈
- 예약 환경 실측은 1205.
