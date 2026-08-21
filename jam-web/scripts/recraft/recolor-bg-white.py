#!/usr/bin/env python3
"""
Recraft 스타일이 프롬프트의 흰 배경 지시를 무시하고 검정/어두운 배경을 계속 생성하는
문제(레퍼런스 편향 추정)를 후처리로 보정한다.

이미지 모서리에서 실제 배경색을 추정한 뒤, 그 배경색과 가까운 픽셀을 흰색으로
부드럽게(soft threshold) 치환한다. 디자인 콘텐츠(배경색과 크게 다른 픽셀)는 그대로 둔다.

실행: python3 recolor-bg-white.py <이미지 경로> [<이미지 경로> ...]
"""
import sys
import numpy as np
from PIL import Image


def detect_bg_color(arr, patch=6):
    h, w, _ = arr.shape
    corners = [
        arr[0:patch, 0:patch],
        arr[0:patch, w - patch : w],
        arr[h - patch : h, 0:patch],
        arr[h - patch : h, w - patch : w],
    ]
    samples = np.concatenate([c.reshape(-1, 3) for c in corners], axis=0)
    return np.median(samples, axis=0)


def recolor_bg_white(path, low=14.0, high=34.0):
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    bg = detect_bg_color(arr)
    dist = np.abs(arr - bg).sum(axis=2)
    weight = np.clip((dist - low) / (high - low), 0.0, 1.0)[..., None]
    white = np.full_like(arr, 255.0)
    out = arr * weight + white * (1.0 - weight)
    Image.fromarray(out.astype("uint8")).save(path)
    print(f"보정됨: {path} (감지 배경색 {bg.round(1).tolist()})")


if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        print("사용법: recolor-bg-white.py <이미지 경로> [...]")
        sys.exit(1)
    for p in paths:
        recolor_bg_white(p)
