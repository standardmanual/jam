---
id: "20261126_2358"
category: Infra
priority: P3
status: OPEN
created: 2026-11-26
---

# [Infra] eslint-config-next를 Next 판에 맞추고 새 lint 경고 32건을 정리한다

## 핵심 요약

- 배경: `jam-web/package.json`의 `eslint-config-next`는 16.2.10이고 Next는 16.3.8이다(2026-09-23 보안 상향 때 Next만 올라감). 티켓 20261126_2350에서 16.3.8로 올려 실제 설치본 verify를 돌리자 lint 단계가 경고 32건으로 실패했다(`lint:ci`는 경고도 실패로 본다). 그래서 판을 올리지 않고 되돌렸다.
- 경고 내역(2026-11-26): `@typescript-eslint/no-unused-vars` 24건, `@next/next/no-location-assign-relative-destination` 6건, `@next/next/no-img-element` 2건. 경고가 난 파일 27개: `/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/design-system/f`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/design-system/f`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/design-system/f`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/scripts/asset-g`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/scripts/jam2-to`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/scripts/recraft`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/app/(auth)/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/app/(main)/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/app/api/adm`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/app/api/adm`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/components/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/admin/o`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/ambient`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/asset-g`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/asset-g`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/badge-e`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/strava/`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/lib/today/c`�`/Volumes/뚝섬하드/시현/JAM!/.claude/worktrees/wf_981069e8-a24-1/jam-web/src/types/strav`.
- 요구사항: 판을 16.3.8(고정 표기)로 올리고 경고 32건을 고친다. 새 규칙을 끄는 대신 코드를 고치는 것을 기본으로 하되, `location` 대입·`<img>`처럼 의도가 있는 곳은 줄 단위 예외와 사유를 단다. 화면 변화가 생기면 멈추고 보고한다.
- 관련 파일: `jam-web/package.json`·`package-lock.json`, 위 파일들.

## 완료 조건

- 실제 설치본에서 `scripts/verify.sh` 20단계 통과.

## 완료 기록 *(작업 완료 후 작성)*
