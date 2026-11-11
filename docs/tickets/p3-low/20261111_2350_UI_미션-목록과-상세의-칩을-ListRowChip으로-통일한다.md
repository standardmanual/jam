---
id: "20261111_2350"
category: UI
priority: P3
status: CLOSED
created: 2026-11-11
closed: 2026-11-11
parent: "20261111_2340"
---

# [UI] 미션 목록과 상세의 칩을 ListRowChip으로 통일한다

## 핵심 요약

- 요구사항: 목록과 상세 화면의 칩 크기를 같게, 글자 크기와 굵기를 같게, 모두 디자인시스템 토큰 기반으로 한다(사용자 지시, 2026-11-11).
- 구현: 상세의 손으로 만든 칩(참가중 14px, 종료·잠김 11px, 달성·미달성 14px)을 모두 `ListRowChip`(12px·700·안쪽 `--list-row-chip-padding` 2px 8px)으로 바꿨다. `ListRowChip`에 `tone="red"`(`--jam-red` 면 + `--foreground`)와 `tone="gray"`(`--muted` 면 + `--snow`)를 더해, 목록의 «참가중»과 상황 화면의 «미달성»이 인라인 색 대신 이 톤을 쓴다. 상세 «참가중»은 목록처럼 레드 면이다.
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.jsx`·`ListRow.d.ts`·`ListRow.prompt.md`·`ListRow.stories.tsx`(C5), `jam-web/src/components/ui/ListRow.tsx`, `jam-web/src/app/(main)/missions/MissionsListClient.tsx`(`topStatusLabel`), `jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx`(`StatusChip`, 달성 칩), `jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx`(`AchievementRow`).

## 상세 요구사항

- 상세 «종료»는 목록과 같은 `neutral`(`--default-soft` 면 + `--foreground`)이라 글자 대비가 4.56에서 14.23으로 올랐다.
- 상세 «미달성»은 연회색에서 상황 화면과 같은 진회색(`gray`)이 됐다.
- 배지 목록(`BadgeGridCard`)의 등급·레벨 칩은 `size="md"`(12px, 줄 높이 1, 안쪽 5px 10px, 높이 22px)라 `ListRowChip`(높이 20px, 안쪽 2px 8px)과 높이·가로 여백이 다르다. 글자 크기(12px)·굵기(700)·모서리는 같다. 행 안에서 쓰는 `size="row"`는 `ListRowChip`과 같은 값이다.

---
## 완료 기록

### 변경된 파일
```
jam-web/design-system/components/patterns/ListRow.jsx
jam-web/design-system/components/patterns/ListRow.d.ts
jam-web/design-system/components/patterns/ListRow.prompt.md
jam-web/design-system/components/patterns/ListRow.stories.tsx
jam-web/src/components/ui/ListRow.tsx
jam-web/src/app/(main)/missions/MissionsListClient.tsx
jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
docs/plan/jam2/11 JAM 2.0 디자인 시스템.md
```

### 테스트 결과
- [x] `vitest run 'src/app/(main)/missions' src/components/ui` 497건 통과, `npm run typecheck` 통과, 변경 파일 eslint 통과
- [x] 개발 서버의 상세 화면에서 «참가중» 칩이 12px·700·높이 20px·안쪽 2px 8px로 목록과 같음을 측정
- [ ] 상세 «종료»·«잠김»·«달성»·«미달성»은 이 계정에 해당 상태가 없어 실제 화면에서는 확인하지 못했다(같은 컴포넌트라 같은 값이다)
- [ ] claude.ai/design 업로드본 갱신과 Storybook 시각 확인은 하지 못했다
