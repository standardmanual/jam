---
id: "20260925_0541"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md"
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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**(a) 완료 — `loadEnv` 공용화.** `jam-web/scripts/lib/loadEnv.mjs`를 만들고 에셋 제너레이터 스크립트 4개(`render.mjs`·`register-badge.mjs`·`register-home-feed-card.mjs`·`register-mission.mjs`)의 복제 함수를 걷어 그 모듈을 쓰게 했다. 파싱 정규식·경로(`jam-web/.env.local`)는 복제본과 글자까지 같다. 옮기고 쓸모없어진 `fs`·`path`·`fileURLToPath`·`scriptDir` import는 정리했다(`render.mjs`는 다른 곳에서 `fs`·`path`를 써서 유지). `jam-web/scripts/recraft/`·`jam-web/scripts/badge-image-gen/` 등 다른 디렉터리의 복제는 티켓 범위 밖이라 건드리지 않았다.

**(b) 미적용 — 배지 insert 페이로드 매핑 공용화.** 라우트 동작 불변·기존 테스트 수정 없음 조건을 둘 다 지키면서 하는 방법이 없어 적용하지 않았다. 매핑을 `jam-web/src/lib/admin/` 순수 함수로 빼는 시험 구현을 만들어 돌려 보았고(시험 코드는 되돌림), 아래 5개가 실패했다.
- `src/app/api/admin/badges/__tests__/route-contract.test.ts` 4개: 이 테스트는 `route.ts` 소스를 읽어 POST 코드에 `level:`(44줄), `admin_category:`(91·96줄), `category: type === 'checkin'`(110줄) 문자열이 있는지 정규식으로 확인한다. 매핑이 라우트 밖으로 나가면 이 문자열이 라우트에 없다.
- `jam-web/scripts/asset-generator/__tests__/registerBundle.test.ts` 1개("라우트 키 목록 대조", 436줄 근처): `route.ts`에서 `const insertPayload = {` 블록을 찾아 키를 뽑는다. 블록이 사라지면 `expected -1 to be greater than -1`로 실패한다.
- 지시("라우트 테스트를 고쳐야만 통과하면 고치지 말고 보고")에 따라 테스트를 고치지 않았고 (b)는 적용하지 않았다. 라우트 코드는 원래대로다.

### 변경된 파일
```
jam-web/scripts/lib/loadEnv.mjs                                  (신규)
jam-web/scripts/lib/__tests__/loadEnv.test.ts                    (신규, 3건)
jam-web/scripts/asset-generator/render.mjs
jam-web/scripts/asset-generator/register-badge.mjs
jam-web/scripts/asset-generator/register-home-feed-card.mjs
jam-web/scripts/asset-generator/register-mission.mjs
```

### 테스트 결과
- [x] `npx vitest run scripts/lib scripts/asset-generator` 15개 파일 337건 통과(등록 스크립트 테스트는 스텁으로 돌고 DB·Storage에 쓰지 않음)
- [x] 4개 스크립트와 `loadEnv.mjs` `node --check` 통과
- [ ] (b): 위 5개 실패로 적용하지 않음. 완료 조건 첫 항목의 "페이로드 매핑 원본이 한 곳" 부분은 미충족

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
- 계획 반환 면제(카리나 부여, 2026-09-26): 파일이 5개를 넘을 수 있으나 티켓에 파일:줄 지도가 있고 사용자가 묶음 처리를 승인.
- (b)를 진행하려면 사용자 결정이 필요하다. 선택지: ① 두 테스트 파일의 소스 스캔 검사를 새 순수 함수 파일을 읽도록 옮기는 것을 승인(라우트 응답·상태 코드·검증 동작은 그대로 유지 가능) ② (b)를 포기하고 현행 키 목록 대조 테스트에 의존. 이 티켓은 ①이 선행돼야 하는 별도 티켓으로 나누는 편이 안전하다.

### 잔여 이슈
- (b) 페이로드 매핑 공용화 미완료(위 사유).
- `scripts/` 아래 다른 디렉터리(`recraft/*.js`, `badge-image-gen/generate.js`, 지도·POI 스크립트, `*.ts` 백필 스크립트)의 `loadEnv` 복제는 그대로다(티켓 지시: 건드릴 때 하나씩).
