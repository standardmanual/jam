---
id: "20260925_0541"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
parent: "20260924_2154"
specs:
  - "docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md"
---

# [Infra] 에셋 제너레이터 스크립트의 `loadEnv` 복제와 배지 insert 페이로드 복제를 공용 모듈로 모은다

> 티켓 20260924_2202 게이트 리뷰에서 민지가 낸 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 카리나가 실제 스키마로 확인한 사실을 덧붙였다.

## 핵심 요약

- 요구사항: `.env.local` 수동 파싱 `loadEnv`가 `jam-web/scripts/` 아래 10곳 넘게 복제돼 있고 2201·2202에서 둘이 더 늘었다. 또 `registerBundle.mjs`의 `buildBadgeInsertPayload`는 어드민 배지 생성 라우트의 insertPayload 매핑을 복제했고, 지금은 키 목록 대조 테스트로 드리프트를 막지만 값 매핑(예: `type === 'checkin'`일 때 null 처리, 정렬 기본값)의 어긋남은 못 잡는다.
- 구현 계획: (a) 스크립트 공용 `scripts/lib/loadEnv.mjs`를 만들고 에셋 제너레이터 스크립트부터 옮긴다(다른 스크립트는 건드릴 때 하나씩). (b) 라우트의 insertPayload 매핑을 `jam-web/src/lib/admin/` 아래 순수 함수로 빼 라우트와 등록 스크립트가 같이 쓰게 한다(라우트 동작 불변, 기존 라우트 테스트로 확인).
- 관련 파일: `jam-web/scripts/asset-generator/register-badge.mjs`(loadEnv 46줄), `render.mjs`(75줄), `registerBundle.mjs`(`buildBadgeInsertPayload` 346줄), `jam-web/src/app/api/admin/badges/route.ts`(insertPayload 92~145줄)

## 완료 조건
- 에셋 제너레이터 스크립트가 공용 `loadEnv`를 쓰고, 배지 insert 페이로드 매핑의 원본이 한 곳이다.
- 어드민 배지 생성 라우트의 기존 테스트와 등록 스크립트 테스트가 그대로 통과한다. `npm run lint`·`npm test` 통과.

---
## 진행 기록 (2026-09-26, 카리나)

- **(a) 병합 완료**: 게이트(민지) **FAIL**(완료 조건의 (b) 미충족)이지만 (a)는 독립적이고 검증이 끝나 사용자가 (a)만 병합하도록 승인했다(2026-09-26). 병합 커밋 bd3e4f01, 병합 뒤 `scripts/verify.sh` 전체 통과. 이 티켓은 (b)가 끝날 때까지 열어 둔다.
- **(b)의 결정**: 기존 테스트 5건(`route-contract.test.ts` 4건·`registerBundle.test.ts`의 「라우트 키 목록 대조」 1건)이 `route.ts` 소스를 정규식으로 읽어 매핑을 라우트 밖으로 뺄 수 없다. **사용자가 A안을 승인했다(2026-09-26)**: 두 테스트 파일의 소스 스캔 대상을 새 순수 함수 파일로 옮기는 수정을 허용한다. 「매핑에 필요한 키가 있다」는 검사의 의미는 유지하고, 추가로 「라우트가 그 함수를 호출한다」를 확인한다. 라우트의 요청·응답·상태 코드·검증 동작은 바뀌지 않아야 한다.
- (b)는 새 파이프라인 실행으로 진행한다(아래 완료 기록은 (a) 기준이며 (b) 완료 뒤 갱신한다).

---
## 완료 기록

### 구현 내용 요약

**(a) 완료 — `loadEnv` 공용화.** `jam-web/scripts/lib/loadEnv.mjs`를 만들고 에셋 제너레이터 스크립트 4개(`render.mjs`·`register-badge.mjs`·`register-home-feed-card.mjs`·`register-mission.mjs`)의 복제 함수를 걷어 그 모듈을 쓰게 했다. 파싱 정규식·경로(`jam-web/.env.local`)는 복제본과 글자까지 같다. 옮기고 쓸모없어진 `fs`·`path`·`fileURLToPath`·`scriptDir` import는 정리했다(`render.mjs`는 다른 곳에서 `fs`·`path`를 써서 유지). `jam-web/scripts/recraft/`·`jam-web/scripts/badge-image-gen/` 등 다른 디렉터리의 복제는 티켓 범위 밖이라 건드리지 않았다.

**(b) 완료 — 배지 insert 페이로드 매핑 공용화(사용자 A안 승인, 2026-09-26).** 라우트의 `insertPayload` 매핑(26개 키)을 `jam-web/src/lib/admin/badge-insert-payload.ts`의 순수 함수 `buildBadgeInsertPayload(body)`로 옮겼다(값 매핑·주석 그대로, 계열 키 정규화는 `normalizeFamilyKey`로 함께 노출). 라우트는 검증(400 응답)을 그대로 두고 `buildBadgeInsertPayload(body)`의 결과를 insert한다. 라우트 POST의 body 구조분해는 라우트가 검증에 쓰는 필드(`name`·`description`·`type`·`rarity`·`level`·`family_key`·`image_url`·`condition_json`)만 남겼다. `registerBundle.mjs`의 `buildBadgeInsertPayload`는 같은 함수를 부르고 `id`·`image_source`만 얹는 래퍼가 됐다(1차 범위 밖 필드는 넘기지 않아 «없음» 기본값).

소스 스캔 테스트의 스캔 대상 이동(승인 범위 안, 다른 검사는 약화·삭제 없음):
- `route-contract.test.ts`: `level:`·`admin_category:`·`category: type === 'checkin'`·admin_category 가드 없음 검사의 대상을 `postCode`에서 새 파일(`payloadCode`)로 옮겼다(PUT 쪽 검사는 그대로). 라우트가 `buildBadgeInsertPayload(body)`를 import·호출하고 `.insert(insertPayload)`하는지 확인하는 검사, 라우트에 `const insertPayload = {`가 다시 생기지 않는지 확인하는 검사를 추가했다.
- `registerBundle.test.ts`: 「라우트 키 목록 대조」의 파일 경로와 블록 시작 문자열만 새 파일 기준으로 바꿨다(키 목록 대조 판정은 그대로).

### 변경된 파일
```
jam-web/scripts/lib/loadEnv.mjs                                  (신규)
jam-web/scripts/lib/__tests__/loadEnv.test.ts                    (신규, 3건)
jam-web/scripts/asset-generator/render.mjs
jam-web/scripts/asset-generator/register-badge.mjs
jam-web/scripts/asset-generator/register-home-feed-card.mjs
jam-web/scripts/asset-generator/register-mission.mjs
jam-web/src/lib/admin/badge-insert-payload.ts                    ((b) 신규)
jam-web/src/lib/admin/__tests__/badge-insert-payload.test.ts     ((b) 신규, 단위 테스트)
jam-web/src/app/api/admin/badges/route.ts                        ((b) 매핑을 공용 함수 호출로 교체)
jam-web/src/app/api/admin/badges/__tests__/route-contract.test.ts ((b) 스캔 대상 이동 + 호출 확인 검사)
jam-web/scripts/asset-generator/registerBundle.mjs               ((b) 공용 함수 사용)
jam-web/scripts/asset-generator/__tests__/registerBundle.test.ts ((b) 키 목록 대조 스캔 대상 이동)
```

### 테스트 결과
- [x] `npx vitest run scripts/lib scripts/asset-generator` 15개 파일 337건 통과(등록 스크립트 테스트는 스텁으로 돌고 DB·Storage에 쓰지 않음)
- [x] 4개 스크립트와 `loadEnv.mjs` `node --check` 통과
- [x] (b): `npx vitest run src/lib/admin/__tests__/badge-insert-payload.test.ts src/app/api/admin/badges scripts/asset-generator` 17개 파일 360건 통과(등록 스크립트 테스트는 스텁, DB·Storage 쓰기 없음). 두 스캔 테스트 밖의 테스트는 수정 없이 통과
- [x] `scripts/verify.sh` 전체 통과(lint·typecheck·test·ds:check·asset-bundle·slop 등)

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 (a)(b) 시도, 게이트 FAIL | 아현·민지 | 110,611 | 22,528 / 2,642 | 10분 48초 | 57 |
| 2차 (b) 재실행(A안 승인 뒤), 게이트 PASS | 아현·민지 | 127,040 | 24,712 / 5,173 | 10분 3초 | 40 |
| 합계 | 아현·민지 | 237,651 | 47,240 / 7,815 | 20분 51초 | 97 |

### 주요 의사결정 / 핵심 메모
- 계획 반환 면제(카리나 부여, 2026-09-26): 파일이 5개를 넘을 수 있으나 티켓에 파일:줄 지도가 있고 사용자가 묶음 처리를 승인.
- (b)는 사용자가 A안(스캔 대상 이동 허용)을 승인해 진행했다(2026-09-26, 진행 기록 참조). 계획 반환 면제는 카리나가 다시 부여했다.

### 잔여 이슈
- 없음((b) 완료). 종료 처리는 카리나가 한다.
- `scripts/` 아래 다른 디렉터리(`recraft/*.js`, `badge-image-gen/generate.js`, 지도·POI 스크립트, `*.ts` 백필 스크립트)의 `loadEnv` 복제는 그대로다(티켓 지시: 건드릴 때 하나씩).

---
## 종료 기록 (2026-09-26, 카리나)

- **경위**: 1차 실행에서 (a)는 완료됐지만 (b)는 기존 테스트 5건이 라우트 소스 문자열을 정규식으로 읽어 매핑을 라우트 밖으로 뺄 수 없어 미적용이었고, 게이트(민지)가 완료 조건 미충족으로 **FAIL**을 냈다. 사용자가 (b)의 A안(두 테스트 파일의 소스 스캔 대상을 새 순수 함수 파일로 옮기는 수정)을 승인했고 (a)만 먼저 병합했다(병합 커밋 bd3e4f01). 이어서 (b)를 새 실행으로 구현해 게이트 **PASS**를 받았고 사용자가 병합과 실렌더 생략을 승인했다(2026-09-26, 병합 커밋 ab9e4b28). 병합 뒤 `scripts/verify.sh` 전체가 통과했다.
- **(b) 판정(민지)**: 옮긴 26개 키의 값 식·기본값·주석이 원본과 글자 단위로 같다. 라우트의 검증 순서·400·403 응답·`family_key` 검증은 그대로다. 등록 스크립트가 넘기지 않는 필드의 함수 기본값이 옛 래퍼의 하드코딩 값과 같다(`patch_available` false, `category`·`admin_category`·`background_*` null, `show_on_map` true). 라우트가 본문의 `image_source`를 무시하는 기존 규칙(2003·2023)도 `image_source`를 스프레드 뒤에 두어 유지된다.
- **테스트 수정은 승인 범위 안**: `route-contract.test.ts` 4건과 `registerBundle.test.ts` 1건의 스캔 대상 이동뿐이고 다른 검사는 약화·삭제하지 않았다. 「라우트가 새 함수를 호출하고 `.insert(insertPayload)`를 한다」와 「라우트에 `const insertPayload = {`를 다시 인라인하지 않는다」 검사를 추가했다. 이 두 파일 밖의 테스트는 수정 없이 통과했다.
- 실렌더는 생략했다(사용자 승인). 라우트의 요청·응답이 바뀌지 않는 리팩터링이고 동작은 라우트 테스트와 새 단위 테스트가 고정한다.

### 남은 한계 (민지 참고 사항)
- `registerBundle.test.ts:443`의 「키 목록 대조」가 소스 문자열 `return {\n    name,`과 들여쓰기 정규식에 의존한다. 순수 함수 반환 객체의 서식을 바꾸면 매핑과 무관하게 실패할 수 있다(값 단위 테스트가 실질 방어를 한다).
- `docs/service/prd/asset-generator/PRD.md:375`의 「어드민 API의 insertPayload 키 목록과 어긋나면 테스트가 실패한다」는 시점별 이력 문장이라 틀리지는 않지만 (b) 결과(매핑이 공용 순수 함수 한 곳)를 적는 항목은 없다. 새 티켓은 만들지 않았다.
- `scripts/` 아래 다른 디렉터리의 `loadEnv` 복제는 그대로다(티켓 지시: 건드릴 때 하나씩).
