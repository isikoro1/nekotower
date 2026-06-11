from __future__ import annotations

import csv
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cats"
OUT = ROOT / "assets" / "trimmed-cats"
MAX_SIZE = 520

# Fractions of the original image: left, top, right, bottom.
# These are intentionally coarse. They stop furniture/floor from winning the
# automatic component selection before the background removal pass runs.
MANUAL_CROPS: dict[int, tuple[float, float, float, float]] = {
    2: (0.28, 0.02, 0.72, 0.98),
    5: (0.00, 0.00, 0.88, 1.00),
    10: (0.00, 0.12, 0.82, 0.92),
    11: (0.18, 0.35, 0.86, 0.92),
    12: (0.28, 0.02, 0.98, 0.62),
    13: (0.00, 0.28, 0.82, 1.00),
    14: (0.34, 0.00, 0.82, 1.00),
    15: (0.00, 0.00, 1.00, 0.72),
    16: (0.23, 0.00, 0.98, 0.76),
    23: (0.05, 0.38, 0.96, 0.92),
    24: (0.10, 0.00, 0.92, 0.92),
    28: (0.36, 0.02, 0.92, 0.98),
    31: (0.00, 0.18, 1.00, 0.88),
    35: (0.18, 0.05, 0.80, 0.98),
    37: (0.18, 0.04, 0.78, 0.98),
}

# Normalized to the post-crop image. These rough masks are deliberately used
# for the photos where automatic foreground selection tends to pick furniture.
MANUAL_MASKS: dict[int, list[tuple[str, tuple[float, ...]]]] = {
    1: [("ellipse", (0.12, 0.08, 0.88, 0.98)), ("poly", (0.16, 0.25, 0.02, 0.98, 0.98, 0.98, 0.84, 0.25))],
    2: [("ellipse", (0.28, 0.48, 0.72, 0.98)), ("poly", (0.44, 0.10, 0.58, 0.10, 0.68, 0.70, 0.34, 0.70))],
    3: [("ellipse", (0.06, 0.08, 0.96, 0.88)), ("poly", (0.18, 0.18, 0.86, 0.16, 0.98, 0.66, 0.68, 0.98, 0.18, 0.86))],
    4: [("poly", (0.28, 0.05, 0.64, 0.06, 0.88, 0.45, 0.76, 0.98, 0.36, 0.92, 0.12, 0.42))],
    5: [("poly", (0.02, 0.38, 0.40, 0.08, 0.96, 0.28, 0.96, 0.98, 0.20, 0.92))],
    6: [("ellipse", (0.08, 0.08, 0.94, 0.92))],
    7: [("poly", (0.10, 0.36, 0.38, 0.16, 0.88, 0.18, 0.98, 0.42, 0.64, 0.60, 0.34, 0.96, 0.04, 0.98))],
    8: [("poly", (0.32, 0.04, 0.62, 0.02, 0.76, 0.40, 0.74, 0.94, 0.40, 0.98, 0.22, 0.42))],
    9: [("poly", (0.38, 0.02, 0.68, 0.12, 0.86, 0.62, 0.72, 0.98, 0.34, 0.94, 0.12, 0.44))],
    10: [("poly", (0.16, 0.08, 0.76, 0.10, 0.96, 0.45, 0.74, 0.82, 0.22, 0.90, 0.02, 0.50))],
    11: [("poly", (0.18, 0.22, 0.76, 0.10, 0.98, 0.42, 0.78, 0.86, 0.20, 0.92, 0.02, 0.52))],
    12: [("ellipse", (0.30, 0.10, 0.84, 0.84)), ("poly", (0.42, 0.02, 0.72, 0.08, 0.98, 0.48, 0.58, 0.98, 0.20, 0.52))],
    13: [("poly", (0.10, 0.10, 0.72, 0.00, 0.98, 0.46, 0.82, 0.98, 0.26, 0.90, 0.02, 0.45))],
    14: [("ellipse", (0.16, 0.04, 0.86, 0.92)), ("poly", (0.38, 0.62, 0.92, 0.98, 0.46, 0.98))],
    15: [("poly", (0.18, 0.02, 0.68, 0.00, 0.98, 0.36, 0.82, 0.90, 0.22, 0.98, 0.02, 0.42))],
    16: [("poly", (0.04, 0.28, 0.56, 0.04, 0.98, 0.26, 0.84, 0.82, 0.26, 0.94))],
    17: [("poly", (0.18, 0.02, 0.52, 0.00, 0.82, 0.34, 0.88, 0.98, 0.24, 0.98, 0.02, 0.42))],
    18: [("ellipse", (0.04, 0.04, 0.96, 0.92)), ("poly", (0.06, 0.30, 0.48, 0.00, 0.96, 0.32, 0.88, 0.98, 0.18, 0.92))],
    19: [("poly", (0.04, 0.20, 0.98, 0.16, 0.94, 0.88, 0.10, 0.86))],
    20: [("ellipse", (0.08, 0.02, 0.92, 0.96))],
    21: [("poly", (0.20, 0.04, 0.70, 0.02, 0.92, 0.58, 0.78, 0.98, 0.28, 0.90, 0.04, 0.42))],
    22: [("ellipse", (0.22, 0.28, 0.88, 0.98)), ("poly", (0.02, 0.48, 0.58, 0.28, 0.98, 0.64, 0.76, 0.98, 0.18, 0.92))],
    23: [("poly", (0.08, 0.02, 0.78, 0.00, 0.96, 0.96, 0.22, 0.98))],
    24: [("ellipse", (0.20, 0.02, 0.82, 0.70)), ("poly", (0.10, 0.30, 0.88, 0.28, 0.78, 0.98, 0.24, 0.96))],
    25: [("ellipse", (0.04, 0.06, 0.96, 0.96))],
    26: [("ellipse", (0.08, 0.04, 0.92, 0.92)), ("poly", (0.10, 0.30, 0.88, 0.30, 0.80, 0.98, 0.18, 0.98))],
    27: [("ellipse", (0.24, 0.22, 0.78, 0.70))],
    28: [("poly", (0.12, 0.06, 0.78, 0.04, 0.92, 0.54, 0.76, 0.98, 0.22, 0.88, 0.02, 0.34))],
    29: [("ellipse", (0.02, 0.04, 0.98, 0.94))],
    30: [("ellipse", (0.08, 0.02, 0.92, 0.90)), ("poly", (0.18, 0.36, 0.80, 0.32, 0.90, 0.98, 0.12, 0.98))],
    31: [("ellipse", (0.24, 0.04, 0.76, 0.90)), ("poly", (0.10, 0.44, 0.90, 0.40, 0.72, 0.98, 0.28, 0.98))],
    32: [("poly", (0.10, 0.18, 0.70, 0.02, 0.98, 0.38, 0.80, 0.92, 0.18, 0.98, 0.02, 0.48))],
    33: [("ellipse", (0.12, 0.04, 0.88, 0.94)), ("poly", (0.18, 0.30, 0.82, 0.30, 0.96, 0.98, 0.04, 0.98))],
    34: [("ellipse", (0.22, 0.02, 0.78, 0.72)), ("poly", (0.10, 0.40, 0.90, 0.40, 0.82, 0.98, 0.18, 0.98))],
    35: [("poly", (0.28, 0.02, 0.62, 0.04, 0.84, 0.82, 0.52, 0.98, 0.18, 0.56))],
    36: [("ellipse", (0.12, 0.04, 0.90, 0.88))],
    37: [("ellipse", (0.18, 0.04, 0.86, 0.96)), ("poly", (0.28, 0.22, 0.72, 0.18, 0.92, 0.98, 0.12, 0.98))],
    38: [("ellipse", (0.24, 0.00, 0.78, 0.62)), ("poly", (0.06, 0.28, 0.94, 0.28, 0.82, 0.98, 0.18, 0.98))],
}


def source_files() -> list[Path]:
    return sorted(SOURCE.glob("*.jfif"))


def crop_by_fraction(image: Image.Image, crop: tuple[float, float, float, float]) -> Image.Image:
    w, h = image.size
    left, top, right, bottom = crop
    return image.crop((int(w * left), int(h * top), int(w * right), int(h * bottom)))


def estimate_background(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    border = max(4, min(w, h) // 10)
    strips = [
        rgb.crop((0, 0, w, border)),
        rgb.crop((0, h - border, w, h)),
        rgb.crop((0, 0, border, h)),
        rgb.crop((w - border, 0, w, h)),
    ]
    pixels: list[tuple[int, int, int]] = []
    for strip in strips:
        small = strip.resize((max(1, strip.width // 8), max(1, strip.height // 8)))
        pixels.extend(list(small.getdata()))
    pixels.sort(key=lambda c: c[0] + c[1] + c[2])
    return pixels[len(pixels) // 2]


def color_distance_mask(image: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    rgb = image.convert("RGB")
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg))
    gray = ImageOps.grayscale(diff)
    stat = ImageStat.Stat(gray)
    threshold = max(18, min(64, int(stat.mean[0] + stat.stddev[0] * 0.32)))
    return gray.point(lambda v: 255 if v > threshold else 0, "L")


def central_weight(x: int, y: int, w: int, h: int) -> float:
    cx = abs((x / max(1, w - 1)) - 0.5)
    cy = abs((y / max(1, h - 1)) - 0.5)
    return 1.0 - min(0.85, (cx + cy) * 0.42)


def best_components(mask: Image.Image) -> Image.Image:
    mask = mask.convert("L")
    w, h = mask.size
    data = mask.load()
    seen = bytearray(w * h)
    components: list[tuple[float, list[tuple[int, int]]]] = []

    def idx(x: int, y: int) -> int:
        return y * w + x

    for y in range(h):
        for x in range(w):
            i = idx(x, y)
            if seen[i] or data[x, y] < 128:
                continue
            seen[i] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            score = 0.0
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                score += central_weight(cx, cy, w, h)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = idx(nx, ny)
                        if not seen[ni] and data[nx, ny] >= 128:
                            seen[ni] = 1
                            queue.append((nx, ny))
            if len(component) > 24:
                components.append((score, component))

    components.sort(key=lambda item: item[0], reverse=True)
    keep = components[:3]
    if keep:
        largest_score = keep[0][0]
        keep = [item for item in keep if item[0] >= largest_score * 0.22]

    out = Image.new("L", mask.size, 0)
    px = out.load()
    for _, component in keep:
        for x, y in component:
            px[x, y] = 255
    return out


def crop_alpha(image: Image.Image, alpha: Image.Image) -> Image.Image:
    bbox = alpha.getbbox()
    if bbox is None:
        rgba = image.convert("RGBA")
        rgba.putalpha(Image.new("L", image.size, 255))
        return rgba
    pad = 18
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(image.width, bbox[2] + pad)
    bottom = min(image.height, bbox[3] + pad)
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba.crop((left, top, right, bottom))


def smooth_alpha(mask: Image.Image) -> Image.Image:
    mask = mask.filter(ImageFilter.MedianFilter(5))
    mask = mask.filter(ImageFilter.MaxFilter(7))
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(2.8))
    return mask.point(lambda v: 0 if v < 18 else min(255, int(v * 1.18)), "L")


def manual_mask(size: tuple[int, int], index: int) -> Image.Image:
    scale = 4
    w, h = size
    mask = Image.new("L", (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask)
    for kind, values in MANUAL_MASKS[index]:
        if kind == "ellipse":
            left, top, right, bottom = values
            draw.ellipse(
                (left * w * scale, top * h * scale, right * w * scale, bottom * h * scale),
                fill=255,
            )
        else:
            points = [
                (values[i] * w * scale, values[i + 1] * h * scale)
                for i in range(0, len(values), 2)
            ]
            draw.polygon(points, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(3.5 * scale))
    return mask.resize(size, Image.Resampling.LANCZOS)


def cutout(path: Path, index: int) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if index in MANUAL_CROPS:
        image = crop_by_fraction(image, MANUAL_CROPS[index])
    image.thumbnail((MAX_SIZE, MAX_SIZE), Image.Resampling.LANCZOS)
    if index in MANUAL_MASKS:
        return crop_alpha(image, manual_mask(image.size, index))
    bg = estimate_background(image)
    mask = color_distance_mask(image, bg)
    mask = best_components(mask)
    mask = smooth_alpha(mask)
    return crop_alpha(image, mask)


def write_mapping(rows: list[tuple[str, str]]) -> None:
    csv_path = OUT / "mapping.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["cat_id", "source_file"])
        writer.writerows(rows)

    md_path = ROOT / "trimmed-cats-mapping.md"
    lines = ["# Trimmed Cat Mapping", "", "| Cat ID | Source file |", "| --- | --- |"]
    for cat_id, source_file in rows:
        lines.append(f"| {cat_id} | {source_file} |")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows: list[tuple[str, str]] = []
    for index, path in enumerate(source_files(), start=1):
        cat_id = f"CAT_{index:02d}"
        out = OUT / f"{cat_id}.png"
        cutout(path, index).save(out)
        rows.append((cat_id, path.name))
        print(out.relative_to(ROOT))
    write_mapping(rows)


if __name__ == "__main__":
    main()
