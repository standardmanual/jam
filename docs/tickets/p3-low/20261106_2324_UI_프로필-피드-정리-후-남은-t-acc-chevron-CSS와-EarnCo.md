---
id: "20261106_2324"
category: UI
priority: P3
status: OPEN
created: 2026-11-06
parent: "20261106_1750"
---

# [UI] 프로필 피드 정리 후 남은 .t-acc-chevron CSS와 EarnCountBadge를 걷어낸다

## 핵심 요약

- 요구사항: 서비스 코드에서 사용처가 없어진 `.t-acc-chevron` 규칙과, 상세 시트 개편 뒤 쓰이지 않게 되는 `EarnCountBadge`를 정리한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/src/components/transitions.css`(222~236줄, 416~419줄 근처), `jam-web/src/app/(main)/FeedSection.tsx`(`EarnCountBadge`), `FeedSection.test.tsx`의 부재 검증

## 배경 / 문제 정의

티켓 20261106_2252에서 프로필 피드 행이 `ListRow`로 바뀌어 `.t-acc-chevron`을 쓰는 곳이 없어졌다. `EarnCountBadge`는 `DetailSheet`가 아직 써서 지우지 못했다. 상세 시트를 옮기는 배치와 함께 처리하는 편이 맞다.

## 완료 조건

- 두 항목이 코드에서 사라지고 전체 시험이 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
