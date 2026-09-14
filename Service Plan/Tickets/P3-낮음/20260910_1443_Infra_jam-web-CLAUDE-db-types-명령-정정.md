---
id: 20260910_1443
category: Infra
priority: P3
status: CLOSED
created: 2026-09-10
closed: 2026-09-14
---

# [Infra] jam-web/CLAUDE.md의 db:types 지시가 실행 불가한 명령을 가리킨다

## 배경 / 문제 정의

`jam-web/CLAUDE.md`는 마이그레이션을 추가하면 `npm run db:types`로 생성 타입을 재생성하라고
지시한다. 그러나 이 환경에는 supabase CLI가 설치되어 있지 않아 명령이 실패하며, 실패하면서
`src/types/database.generated.ts`를 빈 파일로 덮어쓴다.

실제 절차는 Supabase MCP의 `generate_typescript_types`로 타입을 받아 기존 파일과 대조하는
것이다. 규칙 문서가 실행 불가한 경로를 가리켜 새 세션이 그대로 따르면 생성 타입 파일이
비워진다.

티켓 `20260910_1408`(믹스 v3 재설계) 개선 리뷰에서 범위 밖 발견물로 확인되었다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/CLAUDE.md`의 해당 지시를 실제 가능한 절차로 정정한다.
- `package.json`의 `db:types` 스크립트 자체를 어떻게 할지도 함께 정한다. 실행하면 파일을
  비우는 스크립트를 남겨 두는 것 자체가 함정이므로, 제거하거나 supabase CLI 부재를 감지해
  실패 시 파일을 건드리지 않도록 감싸는 편이 안전하다.

## 구현 계획

문서 문구 정정과 `package.json` 스크립트 처리를 한 커밋으로 묶는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`package.json`의 `db:types` 스크립트(supabase CLI 필요, 실패 시 파일을 빈 값으로 덮어씀)를
제거하고, `jam-web/CLAUDE.md`의 지시를 Supabase MCP의 `generate_typescript_types`로
정정했다. 다른 활성 문서·githooks·스킬에서 `db:types`를 참조하는 곳이 없음을 grep으로 확인.

### 변경된 파일
```
jam-web/package.json
jam-web/CLAUDE.md
```

### 테스트 결과
- [x] grep으로 `.githooks`·`.claude/skills`에 `db:types` 참조 없음 확인

### 배포 정보
- 배포일: 2026-09-14
- 환경: staging
- 커밋: (직접 커밋)

### 주요 의사결정 / 핵심 메모
- 스크립트를 "실패해도 안전하게" 감싸는 대신 아예 제거했다 — 이 환경에서 애초에 실행
  가능한 경로가 없으므로 감싸는 방어 코드 자체가 불필요하다는 판단.

### 잔여 이슈
- 없음
