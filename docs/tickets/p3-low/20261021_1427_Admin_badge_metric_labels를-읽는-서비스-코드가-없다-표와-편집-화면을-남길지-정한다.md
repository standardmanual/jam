---
id: "20261021_1427"
category: Admin
priority: P3
status: OPEN
created: 2026-10-21
parent: "20261019_1318"
---

# [Admin] badge_metric_labels를 읽는 서비스 코드가 없다: 표와 편집 화면을 남길지 정한다

## 핵심 요약

- 요구사항: 어드민 지표 이름 화면(`/admin/badge-metric-labels`)이 편집하는 `badge_metric_labels` 표를 읽는 서비스 코드가 없다. `getMetricLabels`(`jam-web/src/lib/badge-engine/metricLabels.ts` 23줄)는 정의와 주석, 시험 주석에만 나오고 호출하는 코드가 없다(카리나가 `git grep`으로 확인, 2026-10-21, 티켓 20261019_1318 2회 브랜치 기준). 화면을 고쳐도 유저에게 보이는 곳이 없으므로 표와 화면을 남길지 정한다.
- 구현 계획: ① 진행 문구(`badgeProgress.ts` 138줄의 `metricLabel` 채우는 자리)가 지금도 쓰이는지 확인한다. ② 쓰이지 않으면 화면과 라우트를 지우고, 표는 `db-migration-rules.md`의 확장→전환→축소 분할로 별도 차수에서 지운다. 쓰인다면 호출부를 이어 붙인다. 어느 쪽인지는 ①의 결과로 사용자에게 묻는다.
- 관련 파일: `jam-web/src/app/admin/badge-metric-labels/page.tsx`(16줄 설명 문구는 티켓 20261019_1318 2회가 사실에 맞게 고쳤다), `jam-web/src/lib/badge-engine/metricLabels.ts`, `jam-web/src/lib/badge-engine/badgeProgress.ts` 12줄·138줄(주석), 시험 `condition-registry.test.ts` 900줄(주석).

## 배경 / 문제 정의

티켓 20261019_1318 2회에서 아현이 알림([주의])으로 보고했고 게이트(민지)가 참고로 다시 지적했다. 2회는 화면 설명 문구만 고쳤고 표와 화면은 남겼다.

발견: 2026-10-21 티켓 20261019_1318 2회 게이트.

## 상세 요구사항

### 서비스/코드베이스 관점

- DB 표를 지우는 일은 공용 DB 변경이므로 이 티켓의 구현 단계가 아니라 별도 승인을 받는 `db` 유형 차수로 한다.
- 화면을 지우면 어드민 메뉴 항목과 시험도 함께 지운다.

## 완료 조건

- [ ] 표를 읽는 호출부의 유무가 확인되어 티켓에 기록됐다
- [ ] 사용자가 남긴다/지운다를 결정했다
- [ ] 결정대로 처리됐다

## 진행 기록

## 잔여 이슈
