"""Orthographic software preview of the five residential meshes."""

from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_residential_models import MATERIALS, build_residence, normal


root = Path(__file__).resolve().parents[1]
output = root / "public" / "models" / "buildings" / "residential" / "preview.png"
width, height = 1800, 640
canvas = Image.new("RGB", (width, height), (240, 240, 236))
pixels = np.array(canvas)
depth = np.full((height, width), -np.inf)
view = np.array([0.42, 0.62, 0.78])
view /= np.linalg.norm(view)
right = np.cross([0, 1, 0], view)
right /= np.linalg.norm(right)
up = np.cross(view, right)

for level in range(1, 6):
    model = build_residence(level)
    origin_x = 180 + (level - 1) * 360
    scale = 34
    center_y = 530
    for name, triangles in model.triangles.items():
        base = np.array(MATERIALS[name][0][:3])
        for tri in triangles:
            pts = np.array(tri)
            n = np.array(normal(*tri))
            if np.dot(n, view) <= 0:
                continue
            light = max(0.38, min(1, 0.70 + 0.28 * np.dot(n, np.array([-0.5, 0.8, 0.4]))))
            rgb = tuple(int(v) for v in np.clip(base * light * 255, 0, 255))
            projected = [(origin_x + scale * np.dot(p, right), center_y - scale * np.dot(p, up)) for p in pts]
            p = np.array(projected)
            x0, y0 = np.maximum(np.floor(p.min(axis=0)).astype(int), [0, 0])
            x1, y1 = np.minimum(np.ceil(p.max(axis=0)).astype(int), [width - 1, height - 1])
            if x1 < x0 or y1 < y0:
                continue
            xx, yy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (p[1, 1] - p[2, 1]) * (p[0, 0] - p[2, 0]) + (p[2, 0] - p[1, 0]) * (p[0, 1] - p[2, 1])
            if abs(den) < 1e-8:
                continue
            a = ((p[1, 1] - p[2, 1]) * (xx - p[2, 0]) + (p[2, 0] - p[1, 0]) * (yy - p[2, 1])) / den
            b = ((p[2, 1] - p[0, 1]) * (xx - p[2, 0]) + (p[0, 0] - p[2, 0]) * (yy - p[2, 1])) / den
            c = 1 - a - b
            z = a * np.dot(pts[0], view) + b * np.dot(pts[1], view) + c * np.dot(pts[2], view)
            patch_depth = depth[y0:y1 + 1, x0:x1 + 1]
            mask = (a >= 0) & (b >= 0) & (c >= 0) & (z > patch_depth)
            patch_depth[mask] = z[mask]
            pixels[y0:y1 + 1, x0:x1 + 1][mask] = rgb

canvas = Image.fromarray(pixels)
draw = ImageDraw.Draw(canvas)
for level in range(1, 6):
    draw.text((168 + (level - 1) * 360, 590), f"L{level}", fill=(40, 40, 40))

canvas.save(output)
print(output)
