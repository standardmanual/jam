---
id: "20261115_0030"
category: Infra
priority: P2
status: OPEN
created: 2026-11-15
closed:
---

# [Infra] staging CI verify가 선행 실패 시험 5건으로 계속 실패한다

## 핵심 요약

- 요구사항: staging의 CI verify가 2026-11-14 16:25 KST(07:25Z)부터 연속 실패한다. 실패 시험 5건을 고쳐 CI를 초록으로 되돌린다. 아이콘 1회차(20261114_2345) 게이트에서 민지가 베이스 2d900bbeb에서도 같은 5건이 실패함을 재현했다.
- 관련 파일: jam-web/src/lib/today/__tests__/cardView.test.ts, jam-web/src/lib/today/__tests__/eventsImports.test.ts, jam-web/scripts/asset-generator/__tests__/registerMissionBundle.test.ts, jam-web/scripts/jam2-content/__tests__/gen-launch-sql.test.mjs, jam-web/scripts/jam2-content/__tests__/gen-recipe-sql.test.mjs
- 출처: 민지 sideFindings [주의] (20261114_2345 게이트)
- 완료 조건: 다섯 시험이 통과하고 staging CI verify가 success다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |
