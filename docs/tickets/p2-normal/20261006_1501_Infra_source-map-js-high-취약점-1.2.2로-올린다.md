---
id: "20261006_1501"
category: Infra
priority: P2
status: OPEN
created: 2026-10-06
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
