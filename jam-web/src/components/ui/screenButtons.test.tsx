/** 티켓 20261126_1540 — 새 정본 3종(IconLabelButton·CountLabelButton·AvatarPickButton)의 핵심 마크업 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import IconLabelButton from './IconLabelButton'
import CountLabelButton from './CountLabelButton'
import AvatarPickButton from './AvatarPickButton'
import { IconButton } from './IconButton'

describe('IconLabelButton', () => {
  it('primary는 검은 서클, 기본은 회색 서클이고 busy일 때만 aria-busy가 붙는다', () => {
    const primary = renderToStaticMarkup(<IconLabelButton label="복사하기" icon={<i />} tone="primary" busy onClick={() => {}} />)
    const plain = renderToStaticMarkup(<IconLabelButton label="저장하기" icon={<i />} onClick={() => {}} />)
    expect(primary).toContain('bg-background-inverse')
    expect(primary).toContain('aria-busy="true"')
    expect(plain).toContain('bg-border')
    expect(plain).not.toContain('aria-busy')
  })
})

describe('CountLabelButton', () => {
  it('선택 여부를 aria-pressed로 알리고 선택되면 이름이 진한 글자색이다', () => {
    const on = renderToStaticMarkup(<CountLabelButton label="팔로워" value="3" selected onClick={() => {}} />)
    const off = renderToStaticMarkup(<CountLabelButton label="팔로워" value="3" onClick={() => {}} />)
    expect(on).toContain('aria-pressed="true"')
    expect(off).toContain('aria-pressed="false"')
    expect(off).toContain('text-muted')
  })
})

describe('AvatarPickButton', () => {
  it('올리는 중에는 비활성이고 덮개가 얹힌다', () => {
    const busy = renderToStaticMarkup(<AvatarPickButton src={null} alt="" label="사진 바꾸기" uploading onClick={() => {}} />)
    const idle = renderToStaticMarkup(<AvatarPickButton src={null} alt="" label="사진 바꾸기" onClick={() => {}} />)
    expect(busy).toContain('disabled=""')
    expect(busy).toContain('animate-spin')
    expect(idle).not.toContain('animate-spin')
  })
})

describe('IconButton locate', () => {
  it('내 위치 아이콘을 그리고 soft disabled면 aria-disabled를 단다', () => {
    const html = renderToStaticMarkup(<IconButton icon="locate" label="내 위치" disabled />)
    expect(html).toContain('<circle cx="12" cy="12" r="6.5"')
    expect(html).toContain('aria-disabled="true"')
  })
})
