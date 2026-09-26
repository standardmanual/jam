---
id: "20260926_1209"
category: Infra
priority: P2
status: OPEN
created: 2026-09-26
closed:
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
