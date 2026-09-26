---
id: "20260926_1209"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
parent: "20260926_1202"
specs:
  - docs/specs/prd/asset-generator/PRD.md
---

# [Infra] 프리셋 목록 스크립트(list-presets.mjs)를 만들고 에셋 제너레이터 PRD §8 실행 환경을 갱신한다

> 상위 티켓 [20260926_1202](20260926_1202_Feature_예약실행에서-윤진-이미지-생성-상위.md). 선행: 20260926_1204(`presetSource.mjs`의 `fetchPresetListFromAdminApi`를 불러 쓴다). 1204에서 규모 임계값 때문에 분리했다(2026-09-26 사용자 승인).

## 핵심 요약

- 요구사항: 윤진이 「대상 유형이 `home_feed`이고 이름이 `홈피드`」인 프리셋의 id를 찾을 수 있도록, 프리셋 목록을 한 줄씩 출력하는 CLI를 만든다. PRD §8의 실행 환경 서술도 새 경로(읽기 API 또는 서비스 키)로 맞춘다.
- 구현 계획: `jam-web/scripts/asset-generator/list-presets.mjs --target-type <badge|mission|collection|home_feed>`가 `id · 이름 · 비율`을 출력한다. 환경변수는 `.env.local`과 `process.env`를 합쳐 읽고(1204와 같은 방식), API 환경변수가 없으면 어느 값이 없는지 한국어로 알리고 종료 코드 1이다.
- 관련 파일(3개): 신규 `jam-web/scripts/asset-generator/list-presets.mjs`, 신규 테스트 `jam-web/scripts/asset-generator/__tests__/listPresets.test.ts`, `docs/specs/prd/asset-generator/PRD.md` §8 실행 환경(서비스 롤 키 필요 서술). 재사용: `jam-web/scripts/asset-generator/presetSource.mjs`(1204), 대상 유형 값 `jam-web/src/lib/asset-generator/presetSerialize.ts`(`PRESET_TARGET_TYPES` 57행)

## 상세 요구사항

### 서비스/코드베이스 관점
- 인자 검증: `--target-type`이 허용값 밖이면 한국어 메시지로 종료 코드 1. 생략하면 전체 목록.
- 출력 형식은 한 줄에 하나: `<id> · <이름> · <비율>`(1:1 등). 이름에 개행이 있으면 공백으로 바꾼다.
- 서비스 롤 키 경로는 이 CLI에 두지 않는다(읽기 API 경로만). 로컬 세션에서도 `ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN`을 쓴다.
- PRD §8: 「`render.mjs`는 `SUPABASE_SERVICE_ROLE_KEY`가 필요하다」는 서술을 「어드민 읽기 API(`ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN`) 또는 서비스 롤 키(로컬 세션)」로 고치고, `list-presets.mjs` 사용법과 `홈피드` 프리셋 찾는 방법을 적는다.

## 구현 계획

1. `list-presets.mjs` 작성(인자 파싱·출력 포맷은 테스트하기 쉽게 순수 함수로 분리).
2. 테스트: 인자 검증, 출력 형식, 환경변수 누락 메시지, 가짜 fetch로 `home_feed` 필터.
3. PRD §8 갱신.

## 완료 조건

- `list-presets.mjs --target-type home_feed`가 `홈피드` 프리셋의 id(`51aa4673-f723-4929-ac20-a302202b7aa7`)를 포함한 줄을 출력한다(1203이 staging에 반영된 뒤 실측, 결과를 완료 기록에 남긴다).
- 허용값 밖 유형·환경변수 누락은 한국어 메시지와 종료 코드 1이다(자동 테스트).
- PRD §8이 실제 동작(두 경로)과 일치한다.
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
- `list-presets.mjs`를 신규로 만들었다. `--target-type badge|mission|collection|home_feed`(생략하면 전체)로 프리셋 목록 API를 호출해 한 줄에 `<id> · <이름> · <비율>`을 출력한다(이름의 개행은 공백). 1204의 `presetSource.mjs`의 `fetchPresetListFromAdminApi`·`resolveEnv`를 재사용했고 서비스 롤 경로는 두지 않았다.
- 허용값 밖 유형, 값 없는 `--target-type`, 알 수 없는 인자, `ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN` 누락은 한국어 메시지와 종료 코드 1이다. 순수 함수 3개(`parseListArgs`, `requireApiEnv`, `formatPresetLine`)를 export한다.
- PRD §8 실행 환경을 두 경로(읽기 API 우선, 서비스 롤 폴백)로 고치고 `list-presets` 사용법과 `홈피드` 프리셋 id를 찾는 방법을 적었다.

### 변경된 파일
```
신규: jam-web/scripts/asset-generator/list-presets.mjs
신규: jam-web/scripts/asset-generator/__tests__/listPresets.test.ts
수정: docs/specs/prd/asset-generator/PRD.md §8
```

### 테스트 결과
- [x] `scripts/verify.sh` 통과, CI verify 성공(run 36215213842). 게이트(민지) WARN: 사유는 실측 미확인 하나였고 아래 실측으로 해소.
- [x] 자동 테스트 14건(인자 검증 4종, 환경변수 누락 메시지, 출력 형식·개행 치환, 가짜 fetch로 `home_feed` 필터).
- [x] 실측(2026-09-26, 머지 뒤 로컬 개발 서버 + 임시 테스트 토큰): `list-presets.mjs --target-type home_feed` 출력이 `51aa4673-f723-4929-ac20-a302202b7aa7 · 홈피드 · 1:1`이다. 허용값 밖 유형(`poster`)은 한국어 메시지와 종료 코드 1.
- [ ] CLI 종료 코드 1 경로의 자동 테스트는 없다(순수 함수 throw만 자동 검증, 수동 실행으로 확인, 민지 참고 등급).

### UX Writing 검증
- 사용자 노출 텍스트 없음 (내부 스크립트)

### 배포 정보
- 배포일: 2026-09-26
- 환경: staging(머지 `d6447b9a`)
- 커밋: `99789c26`, `79163b86`

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 2 | 94,958 | 38,628 / 11,662 | 12분 29초 | 41 |
| 합계 | 2 | 94,958 | 38,628 / 11,662 | 12분 29초 | 41 |

### 주요 의사결정 / 핵심 메모
- **계획 반환 면제 부여**: 1204에서 사용자 승인으로 분리된 범위이고 파일 3개로 계획이 확정돼 있었다. 신규 파일 줄 수로 100줄 기준을 넘을 수 있어 첫 호출부터 면제했다.
- 순수 함수를 별도 파일로 빼지 않고 `list-presets.mjs`에서 export했다(파일 3개 범위 유지, `main`은 직접 실행할 때만 돈다). 알 수 없는 `--` 인자는 오타 방지를 위해 오류로 처리했다.
- 1208과 PRD §8이 충돌해 머지 때 정리했다(양쪽 내용 보존).

### 잔여 이슈
- 예약(클라우드) 환경에서의 동작은 1205 시험 실행에서 확인한다.
