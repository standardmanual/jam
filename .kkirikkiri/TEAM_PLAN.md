# 팀 작업 계획

- 팀명: kkirikkiri-design-phase01
- 목표: PRD/DesignRenewal/Design_Phase01_01~04 문서대로 SuperHi Plus 디자인 리뉴얼 Phase 1 구현 (jam-web/)
- 생성 시각: 2026-07-29
- 참고: 이 환경엔 TeamCreate(Agent Teams)가 없어 메인세션이 팀장을 겸하고, Agent 도구로 보조 AI를 불러오는 방식으로 대체함

## 팀 구성
| 이름 | 역할 | 담당 업무 |
|------|------|----------|
| 메인세션 | 팀장 | 계획/배분/검증/통합, 브라우저 스크린샷 검증 직접 수행 |
| dev-tokens | 토큰/공통컴포넌트 담당 | globals.css SuperHi Plus 토큰, TopNav/TabBar/Card/Button 공통 컴포넌트 |
| dev-integration | 화면통합 담당 | i18n 딕셔너리 구조, ProfileClient.tsx 전면 교체 (dev-tokens 완료 후 착수) |

## 태스크 목록
- [ ] 태스크 1: globals.css에 SuperHi Plus 토큰 CSS 변수 정의 → dev-tokens
- [ ] 태스크 2: TopNav/TabBar/Card/Button 공통 컴포넌트 신설 → dev-tokens
- [ ] 태스크 3: i18n 딕셔너리 구조 신설 (src/lib/i18n/) → dev-integration
- [ ] 태스크 4: ProfileClient.tsx를 공통 컴포넌트 + i18n으로 전면 교체 → dev-integration
- [ ] 태스크 5: 타입체크/빌드 확인 + 브라우저 스크린샷 검증 → 메인세션

## 주요 결정사항
- PRD 확정 사항(01_PRD.md 7절) 그대로 준수: 이모지 금지(등록 이미지 예외), 드롭섀도 금지, 1px inset border만, Pretendard 400 고정, 상태 팔레트는 jam-teal/purple/yellow 값 그대로 이관, 색상 변수는 시맨틱 이름 병행(라이트 테마 확장 대비)
- 기존 TabBar 라우팅/활성탭 로직은 절대 변경 금지, 스타일만 교체
