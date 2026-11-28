import type { CSSProperties } from 'react'

/**
 * 유저 목록(팔로워·팔로잉·유저 검색 결과)의 행 모양 (티켓 20261128_1700)
 *
 * 카드 없는 평평한 행(`ListRow tone="flat"`)에 지금보다 작은 프로필 이미지를 쓴다.
 * 행의 앞 칸 크기는 ListRow 컴포넌트 토큰 `--list-row-lead-size`(48px)가 정하므로, 목록을 감싸는 곳에
 * `USER_LIST_STYLE`을 걸어 이 목록 안에서만 36px로 줄인다. 이미지(Avatar)는 `USER_ROW_AVATAR_SIZE`와 같은 값이어야 앞 칸을 꽉 채운다.
 */
export const USER_ROW_AVATAR_SIZE = 36

export const USER_LIST_STYLE = {
  '--list-row-lead-size': `${USER_ROW_AVATAR_SIZE}px`,
} as CSSProperties
