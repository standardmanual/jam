---
id: 20260806_001
category: Infra
status: CLOSED
created: 2026-08-06
closed: 2026-08-06
---

# [Infra] Service Plan 폴더 재정리 및 Obsidian vault 연동

## 배경 / 문제 정의
개발이 진행되면서 `Service Plan/PRD/` 하위에 Phase 문서, 운영 문서, 기획서, 배지 명세 등이 혼재되어 파악이 어려워짐. Obsidian vault에서 직접 접근하는 경로도 없어 문서 관리 흐름이 분리됨.

## 상세 요구사항

### 서비스/코드베이스 관점
- `Service Plan/` 하위를 3개 카테고리 폴더로 분리
  - `Business/` — 사업모델·철학·핵심가치 등 비즈니스 기획 문서
  - `Specs/` — 현재 빌드 기준 최신 PRD·데이터 모델·운영 문서
  - `History/` — Phase별·버전별 과거 이력 문서
- `Archive/Operations/` — 과거 SERVICE_OPERATIONS 이력 보관
- git mv로 이력 유지하며 이동
- Obsidian vault(`589132427/JAM!/`)에 `Service Plan` symlink 생성

### UI/UX 관점
- Obsidian에서 `Service Plan/` 내 모든 문서 탐색 가능해야 함

## 구현 계획
1. git mv로 전체 파일 분류·이동 (약 125개)
2. 폴더명 한국어 → 영어 통일
3. symlink 생성: `ln -s <JAM! 프로젝트 경로>/Service Plan <Obsidian vault>/Service Plan`

---
## 완료 기록

### 구현 내용 요약
`Service Plan/` 전체 문서를 Business/Specs/History 3구조로 재정리 완료. Obsidian vault에 symlink 연결 완료.

### 변경된 파일
```
Service Plan/Business/          ← 철학·사업모델 6개 문서 이동
Service Plan/Specs/             ← 최신 PRD, badge/, SERVICE_OPERATIONS
Service Plan/Specs/badge/       ← 배지 관련 명세
Service Plan/History/           ← Phase7~17, DesignRenewal
Service Plan/Archive/Operations/ ← 과거 SERVICE_OPERATIONS 54개
```

### 테스트 결과
- [x] Obsidian에서 Service Plan 폴더 접근 확인
- [x] git log --follow로 파일 이력 유지 확인
- [x] CLAUDE.md의 SERVICE_OPERATIONS 경로 업데이트 반영

### 배포 정보
- 배포일: 2026-08-06
- 환경: git push (문서 전용, 배포 없음)
- 커밋: 이전 세션 커밋 포함

### 주요 의사결정 / 핵심 메모
- 폴더명을 처음엔 한국어(기획, 명세, 이력)로 설정했다가 영어(Business/Specs/History)로 변경 — git/터미널 경로 취급 일관성을 위해
- Obsidian symlink 첫 시도 시 경로 오류(`Work/JAM!`이 존재하지 않음). 올바른 Obsidian vault 루트 경로 `589132427/JAM!/`를 사용자가 직접 확인 후 재생성
- CLAUDE.md의 SERVICE_OPERATIONS 저장 경로를 `Service Plan/PRD/` → `Service Plan/Specs/`로 2회 업데이트 (중간 한국어 경로 거침)

### 잔여 이슈
- 없음
