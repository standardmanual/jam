# JAM! 디자인 리뉴얼 — Phase 분리 계획

> 한 번에 전체 화면을 바꾸면 회귀 버그를 잡기 어렵습니다.
> 공통 컴포넌트 → 화면 순차 적용 → 고도화 순으로 진행합니다.

---

## Phase 1: 공통 컴포넌트 + 토큰 시스템 (예상 1주)

### 목표
Phase 1이 끝나면 SuperHi Plus 토큰(코발트/아이스/미스트/피치, Pretendard 400, 1px inset border)이 CSS 변수로 정의되고, TopNav/TabBar/Card/Button 4개 공통 컴포넌트가 실제로 마이페이지에 적용되어 동작한다.

### 기능
- [ ] `globals.css`에 SuperHi Plus 컬러/타이포/스페이싱/라디우스 토큰을 CSS 변수로 정의 (`--color-main`, `--color-sub` 등 어드민 가변 이름으로)
- [ ] Pretendard Variable 웹폰트 적용, weight 400 강제 (다른 weight 사용 시 빌드 경고 또는 린트 규칙 고려)
- [ ] `src/components/ui/TopNav.tsx` 신설 — 뒤로가기(chevron SVG, `router.back()`) + 타이틀 + 우측 액션 슬롯, 44×44pt 터치 영역
- [ ] `src/components/ui/TabBar.tsx` 리팩터 — 기존 `(main)/TabBar.tsx` 로직을 유지하되 시각 스타일만 1px inset border + 코발트/아이스 반전으로 교체
- [ ] `src/components/ui/Card.tsx` 신설 — 16px radius, 1px inset border, 24px padding, 드롭섀도 없음
- [ ] `src/components/ui/Button.tsx` 신설 — Primary(필 72px)/Outline(pill 50px)/Arrow(텍스트+화살표) 3종 variant
- [ ] `src/lib/i18n/ko.ts` + `src/lib/i18n/index.ts` 딕셔너리 구조 신설 (마이페이지 문구부터 이관)
- [ ] 마이페이지(ProfileClient.tsx)를 4개 공통 컴포넌트 + i18n 딕셔너리로 전면 교체

### 데이터
- 없음 (순수 프론트엔드 토큰/컴포넌트 작업)

### 인증
- 변경 없음 (기존 Supabase Auth 그대로)

### "진짜 제품" 체크리스트
- [ ] 로컬 mock이 아닌 실제 마이페이지 라우트(`/profile`, `/[username]`)에서 동작 확인
- [ ] 실제 로그인 세션으로 접속해 편집/로그아웃/탭 전환이 정상 동작
- [ ] Vercel 프리뷰 배포로 실기기(iOS Safari) 확인
- [ ] 44×44pt 미만 터치 영역이 없는지 실제 화면에서 검증

### Phase 1 시작 프롬프트
```
이 PRD를 읽고 Phase 1을 구현해주세요.
@PRD/DesignRenewal/Design_Phase01_01_PRD.md
@PRD/DesignRenewal/Design_Phase01_02_DATA_MODEL.md
@PRD/DesignRenewal/Design_Phase01_04_PROJECT_SPEC.md

Phase 1 범위:
- globals.css에 SuperHi Plus 토큰 CSS 변수로 정의 (main/sub 컬러는 어드민 가변 이름 사용)
- src/components/ui/에 TopNav, TabBar, Card, Button 공통 컴포넌트 신설
- src/lib/i18n/ 딕셔너리 구조 신설
- src/app/(main)/profile/ProfileClient.tsx를 위 컴포넌트 + i18n으로 전면 교체

반드시 지켜야 할 것:
- Design_Phase01_04_PROJECT_SPEC.md의 "절대 하지 마" 목록 준수
- 기존 TabBar의 라우팅/활성탭 로직(다른 유저 프로필 보기, ?from=badges 케이스)은 그대로 보존, 스타일만 교체
- 드롭섀도/오프셋섀도 금지, 1px inset border만 사용
- 이모지 금지 (단, 배지/아이템북에 등록된 실제 이미지는 그대로 유지)
```

---

## Phase 2: 화면 순차 리뉴얼 (예상 2~3주)

### 전제 조건
- Phase 1의 공통 컴포넌트가 마이페이지에서 안정적으로 동작

### 목표
결정된 순서(투데이 → 배지 목록/상세 → 인벤토리/드랍/미션)대로 화면을 공통 컴포넌트 기반으로 전환하고, 상태 팔레트(희귀도/카테고리 색상) 어드민 관리 기능을 추가한다.

### 기능
- [ ] 투데이(홈) 리뉴얼 — TodayCardStack 포함, 카드 스택 UI를 Card 컴포넌트 기반으로 재설계
- [ ] 배지 목록/상세 리뉴얼 — `state_color_palette`(희귀도/카테고리) 도입, 하드코딩된 `jam-lime/teal/purple/yellow` 매핑을 팔레트 조회로 교체 (색상값 자체는 변경 없이 그대로 이관)
- [ ] 인벤토리/드랍/미션 화면 리뉴얼 (단순 조회 화면, 상대적으로 작업량 적음)
- [ ] `state_color_palette` 테이블 마이그레이션 + 시드 데이터(기존 jam-teal/purple/yellow 값을 rare/legendary/mythic으로 그대로 이관, 색 재조정 없음)
- [ ] 어드민에 상태 팔레트 관리 화면 추가 — 희귀도 4개 고정 슬롯을 리스트로 보여주고 각 슬롯의 색상값만 수정 가능 (슬롯 추가/삭제 UI 없음)
- [ ] 사용자 화면 전반의 나머지 이모지(빈 상태, 아이콘) → SVG 아이콘 교체 (등록된 배지/아이템북 이미지는 유지)

### 추가 데이터
- `state_color_palette` (Design_Phase01_02_DATA_MODEL.md 참고)

### 통합 테스트
- Phase 1에서 만든 마이페이지가 여전히 정상 동작하는지 확인 (공통 컴포넌트 변경이 다른 화면에 영향 없는지)
- 배지 상세에서 팔레트 색상 변경 시 목록/상세 양쪽에 즉시 반영되는지 확인

---

## Phase 3: BottomSheet 통합 + 어드민 테마 컬러 (예상 1~2주)

### 전제 조건
- Phase 1 + 2가 안정적으로 배포된 상태

### 목표
개별 시트 3종을 공통 BottomSheet 컴포넌트로 통합하고, 어드민이 메인/서브 컬러 프리셋을 컬러피커로 만들고 실시간 미리보기로 확인한 뒤 활성화(전환)할 수 있게 한다.

### 기능
- [ ] `src/components/ui/BottomSheet.tsx` 신설 — 드래그 핸들, 스와이프다운 닫기, backdrop, iOS detents 스타일
- [ ] `BadgeDetailSheet`, `InventoryItemHistorySheet`, `ShareCardModal`을 BottomSheet 위에 재구현
- [ ] `theme_presets` 테이블 마이그레이션 (기본 프리셋 1개 시드: "기본(코발트/아이스)", `is_active: true`)
- [ ] 어드민 테마 설정 화면 — 프리셋 목록(카드형) + 컬러피커 2개(메인/서브)로 새 프리셋 생성 + 실시간 미리보기 프레임(모바일 목업 미니어처) + 프리셋 즉시 활성화 버튼 (예약 발행 기능은 만들지 않음)
- [ ] CSS 변수 런타임 바인딩 — 서버에서 `is_active = true`인 `theme_presets` row 조회 후 `<style>` 태그 또는 인라인 변수로 전체 서비스에 주입
- [ ] 프리셋 활성화 전환 시 이전 활성 row → false, 신규 row → true 트랜잭션 처리

### 주의사항
- 어드민이 저품질 대비(예: 코발트와 아이스가 거의 같은 밝기)로 컬러를 설정하면 접근성이 깨질 수 있음 — 최소 대비 경고 UI 고려.
- 관리자 화면 이모지 정리는 이 Phase에서도 필수는 아님(Out of Scope 유지), 여유 있으면 P3로 진행.

---

## Phase 로드맵 요약

| Phase | 핵심 기능 | 상태 |
|-------|----------|------|
| Phase 1 | 토큰 시스템 + 공통 컴포넌트 4종 + 마이페이지 적용 + i18n 구조 | 시작 전 |
| Phase 2 | 투데이/배지/인벤토리·드랍·미션 리뉴얼 + 상태 팔레트 어드민화 + 이모지 교체 | Phase 1 완료 후 |
| Phase 3 | BottomSheet 통합 + 어드민 테마 컬러(컬러피커+실시간 미리보기) | Phase 2 완료 후 |
