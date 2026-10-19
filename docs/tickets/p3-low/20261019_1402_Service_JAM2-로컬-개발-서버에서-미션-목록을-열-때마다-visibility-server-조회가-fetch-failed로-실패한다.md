---
id: "20261019_1402"
category: Service
priority: P3
status: OPEN
created: 2026-10-19
parent: "20261019_1310"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
  - "docs/plan/jam2/service-redesign/현재 서비스 비교.md"
---

# [Service] JAM2 로컬 개발 서버에서 미션 목록을 열 때마다 visibility-server의 조회가 fetch failed로 실패한다 (원인 미확정)

## 핵심 요약

- 요구사항: 2026-10-19 5-1 머지 뒤 로컬 화면 확인에서, 시험 계정으로 `/missions`를 열 때마다 서버 로그에 `[visibility-server] 조회 실패 — 부분 목록으로 판정하지 않는다 TypeError: fetch failed`가 한 줄 남았다(목록·상세·상태 화면은 모두 정상 렌더링). 이 로그는 `lib/missions/visibility-server.ts`의 `fetchAllPages`(18~40줄)가 오류를 삼키고 지금까지 읽은 행만 돌려줄 때 나온다. 5-1의 diff는 이 함수와 호출 쪽(`loadOwnedFamilyTiers` 등)을 건드리지 않았으므로 5-1이 만든 문제가 아니다. 어느 조회가 실패하는지 먼저 찾고, 실패를 삼키는 대신 안전하게 처리할지 정한다.
- 의심되는 지점(확인 전): 게이트 미션이 53건이라 `loadOwnedFamilyTiers`의 `in('family_key', realKeys)` 조건이 길어져 요청이 실패할 수 있다. 실패하면 보유 계열 맵이 비어 게이트 미션이 실제보다 잠긴 것으로 판정될 수 있다. 정식 오픈 때 게이트 미션은 폐기되므로(13.2절) 영향이 그 전에 끝난다.
- 구현 계획: 시작 때 로그에 어느 조회인지 찍어 재현하고(로컬 `preview_start jam-web`, `/api/dev-login`), 원인에 따라 조회를 나누거나 오류를 알리게 고친다. 급하지 않다.
- 관련 파일: `jam-web/src/lib/missions/visibility-server.ts`(`fetchAllPages` 18~40줄, `loadOwnedFamilyTiers`).

## 완료 조건

- 원인이 밝혀져 이 티켓에 기록되어 있다. 고치기로 정했다면 로컬에서 `/missions`를 열어도 해당 로그가 남지 않는다.

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

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
