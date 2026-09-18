---
id: DS-030
status: CLOSED
severity: P3
type: ADVISORY
category: Implementation Integrity
---

# DS-030 — `dashboard.html` em-dash 포화도 (Advisory)

## Problem
Impeccable 탐지기가 `dashboard.html` body text에 em-dash 67개를 감지. Advisory 임계값(500자당 1개 이상 포화) 해당.

## 완료 기록

- **결정**: Advisory 수용 — 별도 수정 없이 CLOSED 처리
- **근거**: `dashboard.html`은 디자인 시스템 문서/가이드라인 페이지임. em-dash는 DS 컴포넌트 설명, 토큰 주석, 스펙 기술 등 문서 맥락에서 정당하게 사용됨. "AI 캐던스 텔" 경고는 짧은 마케팅 카피에 적합한 기준이며, 기술 문서 볼륨에는 적용 불가.
- **조치**: 없음
- **배포**: 2026-08-14
