---
id: DS-028
status: CLOSED
severity: P3
type: FIX
category: Implementation Integrity
---

# DS-028 — `_ds_manifest.json` deprecated 토큰 5종 잔존

## Problem
`_ds_manifest.json`의 `tokens` 배열이 DS v2에서 제거된 deprecated 토큰 5종을 아직 포함:
- `--color-text-tertiary` (DS-011 제거)
- `--color-white` (deprecated alias)
- `--color-black` (deprecated alias)
- `--color-surface-card` (deprecated alias)
- `--color-surface-tint` (deprecated alias)

또한 v2에서 신규 추가된 토큰들이 manifest에 없음:
- `--color-base-grey-750`, `--color-bg-tint`, `--color-surface-inverse`
- `--color-text-inverse`, `--color-rarity-*-text` 토큰 8종
- `--color-icon-inactive`, `--color-overlay` (DS-024/025 신규)

## Impact
- Figma Code Connect 등 manifest 의존 도구에서 오참조 위험
- 빌드 스크립트 없음 — 수동 JSON 패치 또는 재생성

## Acceptance Criteria
- [x] deprecated 토큰 5종 제거 (`--color-text-tertiary`, `--color-white`, `--color-black`, `--color-surface-card`, `--color-surface-tint`)
- [x] v2 신규 토큰 반영 (`--color-icon-inactive`, `--color-overlay` 포함)

## 완료 기록
- **구현**: Python 스크립트로 deprecated 토큰 5종 제거. 결과 토큰 96개. `--color-icon-inactive`, `--color-overlay`는 `colors.css`에서 manifest 재동기화로 포함됨.
- **변경 파일**: `_ds_manifest.json`
- **배포**: 2026-08-14, design-system-staging/v2
