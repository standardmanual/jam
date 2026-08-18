/**
 * 배지 배경 쉐이더 임시 선택 옵션 (20260818_003).
 *
 * 쉐이더 기술 스택(CSS vs WebGL)이 아직 미정이라 어드민에서는 값을 선택·저장할 수만 있고,
 * `getBadgeBackgroundStyle`은 `background_shader_id`를 무시하므로 상세화면 렌더링에는
 * 관여하지 않는다. 스택이 확정돼 쉐이더가 실제로 개발되면 이 배열에 옵션만 추가하면
 * 어드민 UI(드롭다운) 코드는 수정할 필요 없다.
 */
export interface BadgeBackgroundShaderOption {
  value: string
  label: string
}

export const BADGE_BACKGROUND_SHADER_OPTIONS: BadgeBackgroundShaderOption[] = [
  { value: '', label: '없음' },
  { value: 'preset_a', label: '프리셋 A (개발 예정)' },
  { value: 'preset_b', label: '프리셋 B (개발 예정)' },
  { value: 'preset_c', label: '프리셋 C (개발 예정)' },
]
