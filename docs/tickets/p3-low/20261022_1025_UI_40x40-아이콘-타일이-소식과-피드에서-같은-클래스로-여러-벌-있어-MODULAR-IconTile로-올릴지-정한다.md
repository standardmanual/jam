---
id: "20261022_1025"
category: UI
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261021_1249"
---

# [UI] 40×40 아이콘 타일이 소식과 피드에서 같은 클래스로 여러 벌 있어 MODULAR `IconTile`로 올릴지 정한다

## 핵심 요약

- 요구사항: 40×40 아이콘 타일(`w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center`)이 `NotificationsClient`의 `RowIcon`, `FeedSection`의 `FeedCard` 대체 머리, `ActivityGroupCard` 머리에 같은 클래스로 여러 벌이다. 티켓 `20261021_1249` 5회가 소식 3종과 피드 2종에 같은 타일을 더 썼다. 채원 사전 판정이 MODULAR 승격 후보(`IconTile`)로 올렸다. 올릴지, 서비스 전용으로 남길지 정한다.
- 구현 계획: ① 사용처를 모두 찾아(`grep`으로 같은 클래스 조합) props(아이콘, 크기, 톤)를 정리한다. ② 올리기로 하면 `jam-web/design-system/components/`에 컴포넌트와 Story를 더하고 `_ds_manifest.json`을 `ds-manifest-sync`로 맞추며 서비스 쪽을 `@ds` import로 바꾼다. 티켓 `20261021_2244`(`InlineNotice` 승격)와 `20261022_0539`(확인 시트 푸터 승격)와 함께 묶어 한 번에 하는 편이 낫다. ③ 남기기로 하면 «서비스 전용, 사유»로 닫는다.
- 관련 파일: `jam-web/src/app/(main)/notifications/NotificationsClient.tsx` 127줄 근처(민지 보고, 카리나가 직접 확인하지는 않았다), `jam-web/src/app/(main)/FeedSection.tsx`.

## 배경 / 문제 정의

6-3 5회 채원 사전 판정과 게이트(민지, 참고)가 제안했다. 승격 기준(안정성·범용성)에는 닿았으나 취향과 범위가 걸려 있어 이 티켓에서 바로 올리지 않았다.

발견: 2026-10-22 티켓 20261021_1249 5회 채원 사전 판정.

## 상세 요구사항

### UI/UX 관점

- 올려도 소식과 피드 화면의 모양이 바뀌지 않는다.

## 완료 조건

- [ ] 올리기 또는 남기기를 정했다
- [ ] 올렸다면 `ds:check`와 `ds-manifest-sync`가 통과한다

## 진행 기록

## 잔여 이슈
