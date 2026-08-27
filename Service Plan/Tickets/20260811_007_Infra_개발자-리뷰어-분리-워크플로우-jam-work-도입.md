---
id: 20260811_007
category: Infra
status: CLOSED
created: 2026-08-11
closed: 2026-08-11
---

# [Infra] 개발자/리뷰어 분리 워크플로우 (`/jam-work`) 도입

## 배경 / 문제 정의
1인 개발자가 AI 에이전트로 서비스를 운영하는 인터뷰(길포일 사례 — 오케스트레이터/개발자/보수 리뷰어/진보 리뷰어 3단 구조)를 참고해, JAM! 프로젝트에도 "구현"과 "검증"을 서로 다른 컨텍스트(서브에이전트)로 분리하는 구조를 도입할지 검토했다.

기존에는 메인 세션이 조사→구현→보고를 한 컨텍스트에서 전부 처리했음. 별도 리뷰 컨텍스트가 없어 개발자 본인이 놓친 회귀·사각지대를 스스로 다시 잡아내야 하는 구조였음.

## 상세 요구사항

### 서비스/코드베이스 관점
- 개발 담당(`jam-developer`)과 리뷰 담당(`conservative-reviewer`: 동작 여부만 게이트키핑, `progressive-reviewer`: 개선 제안·UX 라이팅·문서 갱신 필요 여부)을 분리된 서브에이전트로 정의
- 파이프라인 트리거는 `/jam-work` 스킬로 고정 (Workflow 툴은 매번 명시적 opt-in이 필요하므로, 스킬 호출 자체를 opt-in으로 간주)

### 도입 전 점검한 사이드이펙트와 결정 사항
기존 CLAUDE.md/메모리 규칙과 새 워크플로우가 충돌하는 지점이 있어 사용자에게 직접 의사결정을 물었음:

1. **자동 push 시점**: 기존 규칙("작업 완료 즉시 push")을 그대로 두면 리뷰 게이트 통과 전에 이미 main에 반영돼 리뷰가 무의미해짐.
   → **결정: jam-developer는 review 브랜치(`claude/jamwork-{ticket-id}-*`)까지만 push. 사용자 승인 후 오케스트레이터가 main으로 merge.**
2. **DB 스키마/데이터 변경 권한**: 기존에는 SQL 직접 실행+배포 확인까지 허용돼 있었음(`feedback_direct_sql_deploy` 메모리).
   → **결정: jam-developer에는 위임하지 않음. SQL 마이그레이션 파일 작성까지만 하고, 실행은 사용자 승인 후 오케스트레이터가 처리.** (jam-developer 서브에이전트 `tools`에 Supabase MCP를 아예 포함하지 않아 실행 경로 자체를 차단)
3. **문서 갱신(①~⑤ 카테고리) + 티켓 CLOSED 처리 담당**: progressive-reviewer는 제안만 하고 실제 반영 주체가 불명확했음.
   → **결정: 오케스트레이터가 사용자 최종 승인 직후 직접 처리.**
4. **파이프라인 실행 방식**: Workflow 툴은 매번 명시적 opt-in이 필요함.
   → **결정: 전용 스킬 `/jam-work`를 만들어 스킬 호출 자체를 opt-in으로 고정.**

### 검토했으나 채택하지 않은 대안
- jam-developer가 main에 즉시 commit+push하고 리뷰는 사후 검증만 하는 방식 → 리뷰 게이트가 배포를 막을 수 없어 기각.
- jam-developer에 기존 SQL 직접 배포 권한을 그대로 위임 → 리뷰 전 DB 변경 위험 있어 기각.
- progressive-reviewer가 문서까지 직접 수정 → 문서 체계 일관성 책임 주체가 분산돼 기각. 오케스트레이터 단일 책임으로 유지.

## 구현 계획
- `.claude/agents/jam-developer.md`, `conservative-reviewer.md`, `progressive-reviewer.md` 신설 (JAM! 프로젝트 전용, 글로벌 미러링 대상 아님 — 프로젝트 경로/티켓 체계에 종속적인 페르소나이므로)
- `.claude/skills/jam-work/SKILL.md` 신설 — 0단계(티켓 검토/생성, 오케스트레이터 직접 수행) → 1단계(Workflow pipeline: 구현→게이트→개선 리뷰) → 2단계(사용자 보고+승인 요청) → 3단계(승인 후 merge+문서갱신+티켓CLOSED, 오케스트레이터 직접 수행) 순서로 고정.

---
## 완료 기록

### 구현 내용 요약
위 계획대로 서브에이전트 3종 + 스킬 1종을 신설. 함께 발견된 부수 이슈(메모리 인덱스 4/15 누락, 글로벌/프로젝트 스킬 목록 불일치)는 별도로 처리.

### 변경된 파일
```
.claude/agents/jam-developer.md
.claude/agents/conservative-reviewer.md
.claude/agents/progressive-reviewer.md
.claude/skills/jam-work/SKILL.md
Service Plan/Tickets/20260811_007_Infra_개발자-리뷰어-분리-워크플로우-jam-work-도입.md
```

### 테스트 결과
- [ ] 실제 버그 수정 케이스로 `/jam-work` 파이프라인 1회 이상 실행해 검증 필요 (문서화만 완료, 실사용 검증은 잔여 이슈)

### UX Writing 검증
해당 없음 (사용자 노출 텍스트 변경 아님, 개발 프로세스 문서)

### 배포 정보
- 배포일: 2026-08-11
- 환경: 로컬 문서/설정 (서비스 코드 변경 아님)
- 커밋: `ec1686f` (콜사인 페르소나는 후속 티켓 008 · 커밋 `5a5c5df`에서 추가)

### 주요 의사결정 / 핵심 메모
사용자가 AskUserQuestion으로 4개 결정 사항에 직접 답변: (1) 리뷰용 브랜치 push 후 승인 시 merge, (2) DB 변경 권한 위임 안 함, (3) 오케스트레이터가 문서갱신/CLOSED 처리, (4) `/jam-work` 전용 스킬로 트리거.

### 잔여 이슈
- 실제 파이프라인 미검증 (다음 버그 수정 요청 시 `/jam-work`로 첫 실행 검증 필요)
- conservative-reviewer FAIL 시 재시도 루프는 자동화하지 않고 사용자에게 물어보는 방식으로 남겨둠 — 반복 사용해보고 번거로우면 자동 재시도 상한(예: 2회)을 추가할지 재검토
- 메모리 통합(①CLAUDE.md 이관 ②티켓 히스토리 이관 ③메모리 유지)은 별도 후속 작업으로 분리, 이번 티켓 범위 아님
