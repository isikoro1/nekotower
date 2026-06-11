from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "trimcats"
OUT = ROOT / "src" / "cat-hitboxes.js"
COLS = 9
ROWS = 12


def build_parts(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    parts: list[dict[str, float]] = []

    for row in range(ROWS):
        y0 = round(row * height / ROWS)
        y1 = round((row + 1) * height / ROWS)
        runs: list[tuple[int, int]] = []
        run_start: int | None = None

        for col in range(COLS):
            x0 = round(col * width / COLS)
            x1 = round((col + 1) * width / COLS)
            total = max(1, (x1 - x0) * (y1 - y0))
            solid = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    if pixels[x, y] > 34:
                        solid += 1
            filled = solid / total
            if filled > 0.08:
                if run_start is None:
                    run_start = col
            elif run_start is not None:
                runs.append((run_start, col))
                run_start = None
        if run_start is not None:
            runs.append((run_start, COLS))

        for start, end in runs:
            x0 = start / COLS
            x1 = end / COLS
            y0n = row / ROWS
            y1n = (row + 1) / ROWS
            parts.append(
                {
                    "x": round((x0 + x1) / 2 - 0.5, 4),
                    "y": round((y0n + y1n) / 2 - 0.5, 4),
                    "w": round((x1 - x0) * 0.98, 4),
                    "h": round((y1n - y0n) * 0.98, 4),
                }
            )

    if not parts:
        parts = [{"x": 0, "y": 0, "w": 0.8, "h": 0.8}]
    return {"width": width, "height": height, "parts": parts}


def main() -> None:
    hitboxes = {path.name: build_parts(path) for path in sorted(SOURCE.glob("*.png"))}
    OUT.write_text(
        "window.CAT_HITBOXES = "
        + json.dumps(hitboxes, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({len(hitboxes)} hitboxes)")


if __name__ == "__main__":
    main()
