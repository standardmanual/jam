---
id: "20261006_1501"
category: Infra
priority: P2
status: CLOSED
created: 2026-10-06
closed: 2026-10-06
---

# [Infra] source-map-js high 취약점(GHSA-68fv-2mgg-jv7q)을 1.2.2로 올린다

## 핵심 요약

- 요구사항: `npm audit --omit=dev`(jam-web)가 high 1건을 낸다. `source-map-js` 1.2.1(`next@16.3.6` → `postcss@8.5.23` → `source-map-js`)이고, 색인된 소스맵 구간 오프셋으로
  이벤트 루프를 멈출 수 있는 서비스 거부 취약점이다(1.0.0~1.2.1, 1.2.2에서 고침). lock 파일을 갱신해 1.2.2 이상으로 올리고 `npm audit --omit=dev` high 0건을 만든다.
- 구현 계획: `npm audit fix`(또는 `overrides`)로 lock만 갱신하고 `scripts/verify.sh`·빌드를 확인한다. `next` 메이저·마이너는 올리지 않는다.
- 관련 파일: `jam-web/package-lock.json`(11400행 부근 `node_modules/source-map-js`), 필요하면 `jam-web/package.json` `overrides`

## 배경 / 문제 정의

2026-10-06 `/jam-ship` 3단계 배포 전 점검표에서 발견했다(점검 기준: critical·high 0건). `package.json`·`package-lock.json`은 그 배포 범위(origin/main → staging)에서 바뀌지 않아
이번 배포가 들여온 것이 아니라 그 전부터 프로덕션에 있던 상태다. 앱은 사용자 입력으로 받은 소스맵을 파싱하지 않으므로 실제 악용 경로는 확인되지 않았다(판단).

## 완료 조건

- `cd jam-web && npm audit --omit=dev`가 critical·high 0건이고 `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `npm update source-map-js --package-lock-only`로 lock의 `node_modules/source-map-js`만 1.2.1 → 1.2.2(version·resolved·integrity 3줄). 워크트리의 `node_modules`가 메인 폴더 링크라
  메인 설치를 건드리지 않으려고 lock만 갱신했다. `package.json`·overrides·`next`·`postcss` 버전은 그대로다(의존 범위가 모두 `^1.2.1`).

### 변경된 파일
```
jam-web/package-lock.json (+3/−3. 리뷰 브랜치 claude/jamwork-20261006_1501-source-map-js-bump, 범위 c8489d877..dfa22966d, staging 머지 745d28287)
```

### 테스트 결과
- [x] 아현: `npm audit --omit=dev` 0건, `scripts/verify.sh` 전 단계 통과. 임시 폴더에서 `postcss` + `source-map-js@1.2.2` 소스맵 생성 확인.
- [x] CI `verify`(run 37432493870, `npm ci` 기반) success — 1.2.2 위의 전체 설치·검증은 CI가 확인했다.
- [x] 민지: 점검표 **PASS**(lock integrity가 레지스트리 값과 일치).
- [x] 카리나: 1540과 합친 상태(240977c47)에서 `npm audit --omit=dev` 0건, `scripts/verify.sh` 전 단계 통과. 메인 폴더 `node_modules`는 아직 1.2.1이라 다음 `npm install`에서 맞춰진다.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 사용자 노출 문구 신규·변경 없음(해당 없음)

### 배포 정보
- 배포일: (staging 머지까지, 2026-10-06. 프로덕션은 다음 `/jam-ship`)
- 환경: staging
- 커밋: 머지 745d28287

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현·민지 | 62,855 | 26,166 / 12,547 | 11분 1초 | 35 |
| 합계 | 2 | 62,855 | 26,166 / 12,547 | 11분 1초 | 35 |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- 2026-10-06 `/jam-ship` 점검표에서 발견(이미 프로덕션에 있던 상태), 사용자 결정으로 배포를 진행하고 P2로 처리. 1540과 같은 시각에 파일을 나눠 실행. 게이트 PASS와 머지(사용자 승인). 범위 밖 P3 20261006_1659(개발 의존성 취약점 13건).

### 잔여 이슈
-
