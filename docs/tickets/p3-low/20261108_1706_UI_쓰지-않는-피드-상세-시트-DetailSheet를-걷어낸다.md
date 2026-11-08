---
id: "20261108_1706"
parent: "20261108_1705"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
---

# [UI] 쓰지 않는 피드 상세 시트(DetailSheet)를 걷어낸다

## 핵심 요약
- 요구사항: 티켓 20261108_1705로 피드 카드가 시트 대신 상세 페이지로 가면서 `DetailSheet`를 여는 곳이 없어졌다. 컴포넌트와 그것만 쓰는 보조 코드(포커스 트랩, `BadgeChip`, `Row`, `eventLabel` 등)와 시험을 지운다.
- 관련 파일: `jam-web/src/app/(main)/FeedSection.tsx`(`DetailSheet` 315줄 부근과 보조 코드), `jam-web/src/app/(main)/FeedSection.test.tsx`(«상세 시트» describe), `docs/service/prd/chapter/PRD.md`

## 완료 조건
- `DetailSheet`와 전용 보조 코드·시험이 없고, `npm run lint`·시험이 통과한다. 다른 곳이 `DetailSheet`나 보조 코드를 쓰지 않음을 확인한다.
