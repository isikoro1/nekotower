from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "trimcats"
OUT = ROOT / "src" / "cat-contours.js"
MAX_SIDE = 180
MAX_POINTS = 48


def largest_component(mask: list[list[int]]) -> list[list[int]]:
    h = len(mask)
    w = len(mask[0])
    seen = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not mask[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and mask[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    out = [[0] * w for _ in range(h)]
    for x, y in best:
        out[y][x] = 1
    return out


def boundary_points(mask: list[list[int]]) -> list[tuple[float, float]]:
    h = len(mask)
    w = len(mask[0])
    points: list[tuple[float, float]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            if (
                x == 0
                or y == 0
                or x == w - 1
                or y == h - 1
                or not mask[y][x - 1]
                or not mask[y][x + 1]
                or not mask[y - 1][x]
                or not mask[y + 1][x]
            ):
                points.append(((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5))
    return points


def radial_outline(points: list[tuple[float, float]], bins: int = 96) -> list[tuple[float, float]]:
    if not points:
        return []
    cx = sum(x for x, _ in points) / len(points)
    cy = sum(y for _, y in points) / len(points)
    buckets: list[tuple[float, float, float] | None] = [None] * bins
    for x, y in points:
        angle = math.atan2(y - cy, x - cx)
        index = int(((angle + math.pi) / (math.tau)) * bins) % bins
        dist = (x - cx) ** 2 + (y - cy) ** 2
        current = buckets[index]
        if current is None or dist > current[2]:
            buckets[index] = (x, y, dist)
    outline = [(item[0], item[1]) for item in buckets if item is not None]
    return outline


def perpendicular_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    px, py = point
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)
    return abs(dy * px - dx * py + ex * sy - ey * sx) / math.hypot(dx, dy)


def rdp(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    best_index = 0
    best_dist = 0.0
    for i in range(1, len(points) - 1):
        dist = perpendicular_distance(points[i], points[0], points[-1])
        if dist > best_dist:
            best_index = i
            best_dist = dist
    if best_dist > epsilon:
        left = rdp(points[: best_index + 1], epsilon)
        right = rdp(points[best_index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def signed_area(points: list[tuple[float, float]]) -> float:
    area = 0.0
    for i, point in enumerate(points):
        nxt = points[(i + 1) % len(points)]
        area += point[0] * nxt[1] - nxt[0] * point[1]
    return area / 2


def reduce_points(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= MAX_POINTS:
        return points
    return [points[round(i * len(points) / MAX_POINTS) % len(points)] for i in range(MAX_POINTS)]


def contour(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    scale = max(width, height) / MAX_SIDE
    sw = max(24, round(width / scale))
    sh = max(24, round(height / scale))
    alpha = image.getchannel("A").resize((sw, sh), Image.Resampling.BOX)
    pixels = alpha.load()
    mask = [[1 if pixels[x, y] > 34 else 0 for x in range(sw)] for y in range(sh)]
    mask = largest_component(mask)
    boundary = boundary_points(mask)
    outline = radial_outline(boundary)
    if len(outline) < 3:
      outline = [(-0.4, -0.4), (0.4, -0.4), (0.4, 0.4), (-0.4, 0.4)]
    outline.append(outline[0])
    simplified = rdp(outline, 0.012)[:-1]
    simplified = reduce_points(simplified)
    if signed_area(simplified) > 0:
        simplified.reverse()
    return {
        "width": width,
        "height": height,
        "vertices": [[round(x, 4), round(y, 4)] for x, y in simplified],
    }


def main() -> None:
    contours = {path.name: contour(path) for path in sorted(SOURCE.glob("*.png"))}
    OUT.write_text(
        "window.CAT_CONTOURS = "
        + json.dumps(contours, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({len(contours)} contours)")


if __name__ == "__main__":
    main()
