#!/usr/bin/env python3
"""
로컬(비-API) 배경 제거 — 캔버스 바깥 여백(흰 배경)만 투명 처리한다.

Recraft의 POST /v1/images/removeBackground(API 유닛 소모)를 대체한다. 이 파이프라인의
배지는 항상 "원형 배지가 캔버스 중앙에 있고 그 바깥은 단색 배경"이라는 구도 규칙을 따르므로,
캔버스 네 변에서 시작한 플러드필로 배경색과 비슷한 픽셀만 따라가며 투명 처리하면 충분하다.
배지 안쪽에 흰색·배경색과 비슷한 소재(흰 종이 등)가 있어도, 테두리에 막혀 플러드필이
도달하지 못하므로 지워지지 않는다.

실행: python3 remove-background-local.py <이미지 경로> [<이미지 경로> ...] [--tolerance=60]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def remove_background(path: str, tolerance: float = 60.0, feather: float = 1.2) -> None:
    img = Image.open(path).convert("RGBA")
    arr = np.array(img).astype(np.int16)
    rgb = arr[:, :, :3]
    h, w = rgb.shape[:2]

    patch = 6
    corners = np.concatenate(
        [
            rgb[0:patch, 0:patch].reshape(-1, 3),
            rgb[0:patch, w - patch : w].reshape(-1, 3),
            rgb[h - patch : h, 0:patch].reshape(-1, 3),
            rgb[h - patch : h, w - patch : w].reshape(-1, 3),
        ],
        axis=0,
    )
    bg_color = np.median(corners, axis=0)

    dist = np.sqrt(((rgb - bg_color) ** 2).sum(axis=2))
    bg_candidate = dist < tolerance

    labeled, _ = ndimage.label(bg_candidate, structure=np.ones((3, 3)))
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)

    is_bg = np.isin(labeled, list(border_labels))

    alpha = np.where(is_bg, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, mode="L")
    if feather > 0:
        alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=feather))

    out = img.copy()
    out.putalpha(alpha_img)
    out.save(path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    tolerance = 60.0
    for a in sys.argv[1:]:
        if a.startswith("--tolerance="):
            tolerance = float(a.split("=", 1)[1])

    if not args:
        print("사용법: python3 remove-background-local.py <이미지 경로> [...] [--tolerance=60]", file=sys.stderr)
        sys.exit(1)

    for p in args:
        print(f"배경 제거 중(로컬): {p} ... ", end="")
        try:
            remove_background(p, tolerance=tolerance)
            print("완료")
        except Exception as e:  # noqa: BLE001
            print(f"실패: {e}")


if __name__ == "__main__":
    main()
