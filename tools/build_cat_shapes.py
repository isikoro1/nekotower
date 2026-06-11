from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "trimcats"
OUT = ROOT / "src" / "cat-shapes.js"
MAX_POINTS = 18


def cross(o: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    points = sorted(set(points))
    if len(points) <= 1:
        return points

    lower: list[tuple[float, float]] = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[tuple[float, float]] = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def polygon_area(points: list[tuple[float, float]]) -> float:
    area = 0.0
    for i, point in enumerate(points):
        nxt = points[(i + 1) % len(points)]
        area += point[0] * nxt[1] - nxt[0] * point[1]
    return area / 2


def thin_points(points: list[tuple[float, float]], max_points: int) -> list[tuple[float, float]]:
    if len(points) <= max_points:
        return points
    result: list[tuple[float, float]] = []
    for i in range(max_points):
        result.append(points[round(i * len(points) / max_points) % len(points)])
    return result


def alpha_hull(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        w, h = image.size
        return {"width": w, "height": h, "vertices": [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]}

    w, h = image.size
    scale = max(w, h) / 220
    sample_w = max(24, round(w / scale))
    sample_h = max(24, round(h / scale))
    small = alpha.resize((sample_w, sample_h), Image.Resampling.BOX)
    pixels = small.load()

    edge_points: list[tuple[float, float]] = []
    for y in range(sample_h):
        for x in range(sample_w):
            if pixels[x, y] < 28:
                continue
            border = x in (0, sample_w - 1) or y in (0, sample_h - 1)
            if not border:
                border = (
                    pixels[x - 1, y] < 28
                    or pixels[x + 1, y] < 28
                    or pixels[x, y - 1] < 28
                    or pixels[x, y + 1] < 28
                )
            if border:
                edge_points.append(((x + 0.5) / sample_w - 0.5, (y + 0.5) / sample_h - 0.5))

    if len(edge_points) < 3:
        left, top, right, bottom = bbox
        points = [
            (left / w - 0.5, top / h - 0.5),
            (right / w - 0.5, top / h - 0.5),
            (right / w - 0.5, bottom / h - 0.5),
            (left / w - 0.5, bottom / h - 0.5),
        ]
    else:
        points = convex_hull(edge_points)

    points = thin_points(points, MAX_POINTS)
    if polygon_area(points) < 0:
        points.reverse()

    return {
        "width": w,
        "height": h,
        "vertices": [[round(x, 4), round(y, 4)] for x, y in points],
    }


def main() -> None:
    shapes = {path.name: alpha_hull(path) for path in sorted(SOURCE.glob("*.png"))}
    OUT.write_text(
        "window.CAT_SHAPES = "
        + json.dumps(shapes, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({len(shapes)} shapes)")


if __name__ == "__main__":
    main()
