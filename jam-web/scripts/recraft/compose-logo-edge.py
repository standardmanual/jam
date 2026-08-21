#!/usr/bin/env python3
"""
배지 원본(흰 배경) 이미지의 우측 하단에서, 디자인 외곽선(윤곽) 바깥쪽에
그 외곽선의 접선 각도를 따라 회전한 로고를 합성한다.

기존 compose-logo.js(하단 중앙 고정 배치)와 달리, 디자인의 실제 실루엣을
분석해 우측 하단 바깥 영역에서 로고와 콘텐츠가 겹치지 않는 위치를 찾는다.

로고 폭 비율(0.224)은 01-01 1차 검증 배치에서 확정한 기존 값을 그대로 사용한다.

실행: python3 compose-logo-edge.py <배지 이미지> <로고 경로(RGBA)> <출력 경로> [로고폭비율=0.224]
"""
import sys
import math
import numpy as np
from PIL import Image


def detect_bg_color(arr, patch=6):
    """네 모서리 패치의 중앙값으로 배경색을 추정한다 (흰 배경 가정 없음)."""
    h, w, _ = arr.shape
    corners = [
        arr[0:patch, 0:patch],
        arr[0:patch, w - patch : w],
        arr[h - patch : h, 0:patch],
        arr[h - patch : h, w - patch : w],
    ]
    samples = np.concatenate([c.reshape(-1, 3) for c in corners], axis=0)
    return np.median(samples, axis=0)


def erode_np(m):
    padded = np.pad(m, 1, mode="constant", constant_values=False)
    return (
        padded[1:-1, 1:-1]
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )


def dilate_np(m):
    d = m.copy()
    d |= np.roll(m, 1, axis=0)
    d |= np.roll(m, -1, axis=0)
    d |= np.roll(m, 1, axis=1)
    d |= np.roll(m, -1, axis=1)
    d |= np.roll(np.roll(m, 1, axis=0), 1, axis=1)
    d |= np.roll(np.roll(m, 1, axis=0), -1, axis=1)
    d |= np.roll(np.roll(m, -1, axis=0), 1, axis=1)
    d |= np.roll(np.roll(m, -1, axis=0), -1, axis=1)
    return d


def denoise_mask(mask, iterations=2):
    """작은 그레인 노이즈 스펙클을 3x3 opening(침식→팽창)으로 제거한다 (scipy 미사용)."""
    m = mask
    for _ in range(iterations):
        m = erode_np(m)
    for _ in range(iterations):
        m = dilate_np(m)
    return m


def largest_component(mask):
    """중심점에서 region growing으로 메인 디자인 덩어리만 남기고 나머지 노이즈는 제거한다."""
    if not mask.any():
        return mask
    ys, xs = np.nonzero(mask)
    cy0, cx0 = ys.mean(), xs.mean()
    d2 = (ys - cy0) ** 2 + (xs - cx0) ** 2
    seed_i = np.argmin(d2)
    seed_y, seed_x = int(ys[seed_i]), int(xs[seed_i])

    region = np.zeros_like(mask)
    region[seed_y, seed_x] = True
    prev_count = 0
    for _ in range(2000):
        region = dilate_np(region) & mask
        count = int(region.sum())
        if count == prev_count:
            break
        prev_count = count
    return region


def load_mask(badge_path, bg_threshold=40):
    im = Image.open(badge_path).convert("RGB")
    arr = np.asarray(im).astype(np.int16)
    bg_color = detect_bg_color(arr)
    dist = np.abs(arr - bg_color).sum(axis=2)  # 실측 배경색과의 거리
    raw_mask = dist > bg_threshold  # True = 콘텐츠(디자인) 픽셀
    mask = largest_component(denoise_mask(raw_mask))
    return im, mask


def boundary_points(mask):
    from scipy import ndimage  # optional; fallback below if unavailable
    eroded = ndimage.binary_erosion(mask)
    edge = mask & ~eroded
    ys, xs = np.nonzero(edge)
    return np.stack([xs, ys], axis=1)


def boundary_points_np(mask):
    # scipy 없을 때를 위한 순수 numpy 침식 fallback
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    eroded = (
        padded[1:-1, 1:-1]
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )
    edge = mask & ~eroded
    ys, xs = np.nonzero(edge)
    return np.stack([xs, ys], axis=1)


def main():
    args = sys.argv[1:]
    if len(args) < 3:
        print("사용법: compose-logo-edge.py <배지 이미지> <로고> <출력경로> [로고폭비율]")
        sys.exit(1)
    badge_path, logo_path, out_path = args[0], args[1], args[2]
    logo_width_ratio = float(args[3]) if len(args) > 3 else 0.224

    badge, mask = load_mask(badge_path)
    W, H = badge.size

    try:
        pts = boundary_points(mask)
    except Exception:
        pts = boundary_points_np(mask)

    if len(pts) == 0:
        raise RuntimeError("콘텐츠 경계를 찾지 못했습니다 (배경이 균일한 흰색인지 확인)")

    cx, cy = mask_centroid(mask)

    # 우측 하단 사분면(중심보다 오른쪽 아래) 경계 후보만 사용
    quad = pts[(pts[:, 0] > cx) & (pts[:, 1] > cy)]
    if len(quad) == 0:
        quad = pts

    # 우측 하단 바깥쪽으로 가장 튀어나온(= x+y 최대) 경계점을 기준점으로 채택
    order = np.argsort(-(quad[:, 0].astype(np.int64) + quad[:, 1].astype(np.int64)))
    quad_sorted = quad[order]

    logo_rgba = Image.open(logo_path).convert("RGBA")
    logo_w = max(1, round(W * logo_width_ratio))
    logo_h = max(1, round(logo_rgba.height * logo_w / logo_rgba.width))
    logo_resized = logo_rgba.resize((logo_w, logo_h), Image.LANCZOS)

    canvas = badge.convert("RGBA")

    placed = False
    for anchor in quad_sorted[: min(60, len(quad_sorted))]:
        ax, ay = int(anchor[0]), int(anchor[1])

        # 기준점 주변 국소 경계점들로 접선 각도 추정 (최소자승 직선 적합)
        radius = max(20, W // 20)
        local = pts[
            (np.abs(pts[:, 0] - ax) <= radius) & (np.abs(pts[:, 1] - ay) <= radius)
        ]
        if len(local) < 5:
            continue
        lx = local[:, 0].astype(np.float64)
        ly = local[:, 1].astype(np.float64)
        lx -= lx.mean()
        ly -= ly.mean()
        cov = np.array([[np.dot(lx, lx), np.dot(lx, ly)], [np.dot(lx, ly), np.dot(ly, ly)]])
        eigvals, eigvecs = np.linalg.eigh(cov)
        tangent = eigvecs[:, np.argmax(eigvals)]  # 분산이 가장 큰 방향 = 접선 방향
        angle_deg = math.degrees(math.atan2(tangent[1], tangent[0]))

        # 바깥쪽 방향(외곽선 밖) = 중심에서 기준점으로 향하는 벡터
        out_dx, out_dy = ax - cx, ay - cy
        norm = math.hypot(out_dx, out_dy) or 1.0
        out_dx, out_dy = out_dx / norm, out_dy / norm

        for gap in (10, 20, 35, 55, 80, 110):
            rotated = logo_resized.rotate(-angle_deg, expand=True, resample=Image.BICUBIC)
            rw, rh = rotated.size
            half_diag = math.hypot(rw, rh) / 2
            pcx = ax + out_dx * (half_diag * 0.55 + gap)
            pcy = ay + out_dy * (half_diag * 0.55 + gap)
            left = round(pcx - rw / 2)
            top = round(pcy - rh / 2)

            if left < 0 or top < 0 or left + rw > W or top + rh > H:
                continue

            region_mask = mask[top : top + rh, left : left + rw]
            if region_mask.size == 0:
                continue
            content_ratio = region_mask.mean()
            if content_ratio > 0.03:
                continue  # 디자인과 겹침 — 다음 gap/기준점 시도

            canvas.alpha_composite(rotated, (left, top))
            placed = True
            break
        if placed:
            break

    if not placed:
        raise RuntimeError("디자인과 겹치지 않는 로고 배치 위치를 찾지 못했습니다")

    canvas.convert("RGB").save(out_path)
    print(f"저장됨: {out_path}")


def mask_centroid(mask):
    ys, xs = np.nonzero(mask)
    return xs.mean(), ys.mean()


if __name__ == "__main__":
    main()
