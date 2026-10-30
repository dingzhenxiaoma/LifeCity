"""Generate the five LifeCity residential GLB assets without external packages."""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "models" / "buildings" / "residential"


MATERIALS = {
    "plaster": ([0.90, 0.83, 0.71, 1.0], 0.86, None),
    "plaster_light": ([0.94, 0.88, 0.76, 1.0], 0.82, None),
    "roof": ([0.27, 0.47, 0.27, 1.0], 0.68, None),
    "roof_edge": ([0.12, 0.28, 0.13, 1.0], 0.65, None),
    "wood": ([0.47, 0.23, 0.09, 1.0], 0.68, None),
    "wood_light": ([0.70, 0.38, 0.14, 1.0], 0.68, None),
    "frame": ([0.07, 0.18, 0.25, 1.0], 0.45, None),
    "glass": ([0.38, 0.55, 0.58, 1.0], 0.28, [0.27, 0.17, 0.055]),
    "window_glow": ([0.92, 0.66, 0.31, 1.0], 0.55, [0.43, 0.24, 0.07]),
    "glass_highlight": ([0.63, 0.79, 0.78, 1.0], 0.25, None),
    "terracotta": ([0.68, 0.25, 0.10, 1.0], 0.72, None),
    "stone": ([0.82, 0.79, 0.70, 1.0], 0.90, None),
    "leaf": ([0.18, 0.43, 0.10, 1.0], 0.88, None),
    "leaf_light": ([0.34, 0.58, 0.12, 1.0], 0.88, None),
    "soil": ([0.21, 0.10, 0.045, 1.0], 0.95, None),
    "rail_glass": ([0.34, 0.62, 0.67, 1.0], 0.30, [0.04, 0.06, 0.05]),
}


class Model:
    def __init__(self) -> None:
        self.triangles: dict[str, list[tuple[tuple[float, float, float], ...]]] = {
            name: [] for name in MATERIALS
        }

    def add_triangles(self, material: str, vertices, faces) -> None:
        for a, b, c in faces:
            self.triangles[material].append((vertices[a], vertices[b], vertices[c]))

    def box(self, material: str, center, size, rotation_z: float = 0.0) -> None:
        cx, cy, cz = center
        sx, sy, sz = (v * 0.5 for v in size)
        local = [
            (-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
            (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz),
        ]
        co, si = math.cos(rotation_z), math.sin(rotation_z)
        vertices = [
            (cx + x * co - y * si, cy + x * si + y * co, cz + z)
            for x, y, z in local
        ]
        faces = [
            (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
            (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2),
            (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5),
        ]
        self.add_triangles(material, vertices, faces)

    def gable(self, material: str, wall_height: float, z: float) -> None:
        vertices = [(-2.70, wall_height, z), (2.70, wall_height, z),
                    (-0.72, wall_height + 1.48, z)]
        self.add_triangles(material, vertices, [(0, 1, 2), (2, 1, 0)])

    def sphere(self, material: str, center, radius: float, rings: int = 4, segments: int = 8) -> None:
        cx, cy, cz = center
        vertices = [(cx, cy + radius, cz)]
        for ring in range(1, rings):
            phi = math.pi * ring / rings
            for seg in range(segments):
                theta = 2 * math.pi * seg / segments
                vertices.append((
                    cx + radius * math.sin(phi) * math.cos(theta),
                    cy + radius * math.cos(phi),
                    cz + radius * math.sin(phi) * math.sin(theta),
                ))
        vertices.append((cx, cy - radius, cz))
        bottom = len(vertices) - 1
        faces = []
        for seg in range(segments):
            nxt = (seg + 1) % segments
            faces.append((0, 1 + seg, 1 + nxt))
        for ring in range(rings - 2):
            start = 1 + ring * segments
            next_start = start + segments
            for seg in range(segments):
                nxt = (seg + 1) % segments
                faces.extend(((start + seg, next_start + seg, next_start + nxt),
                              (start + seg, next_start + nxt, start + nxt)))
        start = 1 + (rings - 2) * segments
        for seg in range(segments):
            nxt = (seg + 1) % segments
            faces.append((start + seg, bottom, start + nxt))
        self.add_triangles(material, vertices, faces)


def add_window_front(model: Model, x: float, y: float, width: float = 1.65, height: float = 0.82,
                     z: float = 2.326) -> None:
    model.box("window_glow", (x, y - 0.08, z + 0.008), (width - 0.12, height - 0.13, 0.058))
    model.box("glass", (x, y, z + 0.045), (width, height, 0.025))
    for dx in (-width / 3, 0, width / 3):
        model.box("glass_highlight", (x + dx - 0.10, y + height * 0.18, z + 0.064),
                  (0.055, height * 0.38, 0.012))
    bar = 0.075
    for dx in (-width / 2, width / 2):
        model.box("frame", (x + dx, y, z + 0.032), (bar, height + 0.13, 0.07))
    for dy in (-height / 2, height / 2):
        model.box("frame", (x, y + dy, z + 0.032), (width + 0.13, bar, 0.07))
    for dx in (-width / 6, width / 6):
        model.box("frame", (x + dx, y, z + 0.045), (0.055, height, 0.075))
    model.box("frame", (x, y - 0.06, z + 0.045), (width, 0.045, 0.075))
    model.box("plaster_light", (x, y - height / 2 - 0.105, z + 0.12), (width + 0.20, 0.10, 0.28))


def add_window_back(model: Model, x: float, y: float, width: float = 0.72, height: float = 0.78,
                    z: float = -2.326) -> None:
    model.box("window_glow", (x, y - 0.06, z - 0.03), (width - 0.10, height - 0.10, 0.02))
    model.box("glass", (x, y, z), (width, height, 0.055))
    bar = 0.07
    for dx in (-width / 2, width / 2):
        model.box("frame", (x + dx, y, z - 0.032), (bar, height + 0.12, 0.07))
    for dy in (-height / 2, height / 2):
        model.box("frame", (x, y + dy, z - 0.032), (width + 0.12, bar, 0.07))


def add_window_side(model: Model, z: float, y: float, x: float = 2.726,
                    width: float = 0.72, height: float = 0.78) -> None:
    model.box("window_glow", (x + 0.025, y - 0.06, z), (0.025, height - 0.11, width - 0.10))
    model.box("glass", (x, y, z), (0.055, height, width))
    bar = 0.07
    for dz in (-width / 2, width / 2):
        model.box("frame", (x + 0.032, y, z + dz), (0.07, height + 0.12, bar))
    for dy in (-height / 2, height / 2):
        model.box("frame", (x + 0.032, y + dy, z), (0.07, bar, width + 0.12))


def add_planter(model: Model, x: float, y: float, width: float, z: float = 2.62,
                bushes: int = 4) -> None:
    model.box("wood_light", (x, y, z), (width, 0.38, 0.45))
    model.box("soil", (x, y + 0.205, z), (width - 0.13, 0.045, 0.31))
    model.box("wood", (x, y + 0.15, z + 0.235), (width + 0.06, 0.07, 0.07))
    for i in range(bushes):
        px = x + (i - (bushes - 1) / 2) * (width - 0.32) / max(1, bushes - 1)
        model.sphere("leaf_light" if i % 2 else "leaf", (px, y + 0.38, z), 0.25 + 0.025 * (i % 2))


def add_roof(model: Model, wall_height: float) -> None:
    left_eave, ridge, right_eave = -3.0, -0.72, 3.0
    rise = 1.52
    roof_z = 0.0
    depth = 5.25
    thickness = 0.19
    left_len = math.hypot(ridge - left_eave, rise)
    left_angle = math.atan2(rise, ridge - left_eave)
    model.box("roof", ((left_eave + ridge) / 2, wall_height + rise / 2, roof_z),
              (left_len, thickness, depth), left_angle)
    right_len = math.hypot(right_eave - ridge, rise)
    right_angle = math.atan2(-rise, right_eave - ridge)
    model.box("roof", ((ridge + right_eave) / 2, wall_height + rise / 2, roof_z),
              (right_len, thickness, depth), right_angle)
    model.box("roof_edge", (ridge, wall_height + rise + 0.015, 0), (0.13, 0.13, depth + 0.04))
    # Raised standing seams follow both roof pitches from front to back.
    for side in (-1, 1):
        start, end = (left_eave, ridge) if side < 0 else (ridge, right_eave)
        angle = left_angle if side < 0 else right_angle
        for z in (-2.22, -1.45, -0.68, 0.09, 0.86, 1.63, 2.38):
            model.box("roof_edge", ((start + end) / 2, wall_height + rise / 2 + 0.10, z),
                      (math.hypot(end - start, rise), 0.025, 0.022), angle)
    for x, angle, length in (((left_eave + ridge) / 2, left_angle, left_len),
                             ((ridge + right_eave) / 2, right_angle, right_len)):
        for z in (-2.63, 2.63):
            model.box("roof_edge", (x, wall_height + rise / 2, z), (length, 0.12, 0.08), angle)


def add_chimney(model: Model, wall_height: float) -> None:
    y = wall_height + 1.45
    model.box("terracotta", (1.65, y, -1.42), (0.52, 1.55, 0.52))
    model.box("terracotta", (1.65, y + 0.80, -1.42), (0.64, 0.12, 0.64))
    model.box("soil", (1.65, y + 0.865, -1.42), (0.36, 0.03, 0.36))
    for dy in (-0.42, 0.03, 0.48):
        model.box("plaster_light", (1.65, y + dy, -1.687), (0.54, 0.028, 0.018))


def add_entrance(model: Model) -> None:
    model.box("wood", (1.35, 1.03, 2.338), (0.82, 1.85, 0.09))
    model.box("frame", (1.35, 1.88, 2.39), (0.84, 0.09, 0.08))
    model.sphere("terracotta", (1.62, 1.05, 2.40), 0.045, 3, 6)
    for x in (1.12, 1.30, 1.48):
        model.box("wood_light", (x, 1.03, 2.395), (0.018, 1.65, 0.015))
    model.box("wood_light", (1.35, 0.50, 2.40), (0.77, 0.035, 0.02))
    # Green entrance canopy.
    model.box("roof", (1.35, 2.18, 2.67), (1.42, 0.14, 0.83), -0.12)
    # Two shallow stone steps.
    model.box("stone", (1.35, 0.12, 2.67), (1.12, 0.24, 0.62))
    model.box("plaster_light", (1.35, 0.31, 2.48), (0.92, 0.17, 0.42))


def add_vertical_bay(model: Model, wall_height: float, levels: int) -> None:
    model.box("wood", (1.35, wall_height / 2, 2.342), (0.92, wall_height, 0.08))
    # Door covers the first level; narrow glazing starts above it.
    if levels >= 2:
        glass_h = wall_height - 2.58
        model.box("glass", (1.35, 2.58 + glass_h / 2, 2.405), (0.42, glass_h, 0.055))
        for x in (1.10, 1.60):
            model.box("frame", (x, 2.58 + glass_h / 2, 2.44), (0.055, glass_h, 0.07))
        for floor in range(1, levels):
            model.box("frame", (1.35, floor * 2.38 + 0.02, 2.45), (0.54, 0.065, 0.08))


def add_balcony_rail(model: Model, floor: int) -> None:
    y = floor * 2.38 + 0.18
    z = 2.50
    model.box("plaster_light", (-1.00, y, z), (2.65, 0.16, 0.38))
    model.box("wood_light", (-1.00, y + 0.28, z + 0.12), (2.52, 0.36, 0.36))
    model.box("wood", (-1.00, y + 0.49, z + 0.29), (2.60, 0.075, 0.08))
    for x in (-1.98, -1.56, -1.15, -0.74, -0.32, 0.04):
        model.sphere("leaf" if int((x + 2) * 10) % 2 else "leaf_light", (x, y + 0.63, z + 0.12), 0.25)


def add_rooftop_terrace(model: Model, level: int, pergola: bool) -> None:
    base_y = (level - 1) * 2.38 + 0.18
    # Glass-fronted shared lounge on the front-left of the upper level.
    model.box("glass", (-1.05, base_y + 1.22, 2.29), (2.55, 1.55, 0.075))
    for x in (-2.28, -1.43, -0.58, 0.22):
        model.box("frame", (x, base_y + 1.22, 2.345), (0.07, 1.66, 0.08))
    model.box("frame", (-1.05, base_y + 0.42, 2.345), (2.62, 0.07, 0.08))
    model.box("rail_glass", (-1.05, base_y + 0.47, 2.70), (2.72, 0.62, 0.055))
    model.box("rail_glass", (-2.47, base_y + 0.47, 2.42), (0.055, 0.62, 0.62))
    model.box("frame", (-1.05, base_y + 0.16, 2.73), (2.82, 0.07, 0.08))
    model.box("frame", (-2.43, base_y + 0.47, 2.73), (0.07, 0.67, 0.08))
    model.box("frame", (0.33, base_y + 0.47, 2.73), (0.07, 0.67, 0.08))
    for x in (-2.10, -1.45, -0.80, -0.15):
        model.sphere("leaf_light" if x < -1 else "leaf", (x, base_y + 0.40, 2.53), 0.23)
    model.box("wood_light", (-1.10, base_y + 0.03, 2.72), (2.80, 0.12, 0.48))
    for x in (-2.20, -1.68, -1.16, -0.64, -0.12):
        model.sphere("leaf" if x < -1.3 else "leaf_light", (x, base_y + 0.53, 2.72), 0.25)
    # A pair of small side terrace planters remains visible from the rear angles.
    for z in (0.90, 1.58):
        model.box("wood_light", (-2.51, base_y + 0.22, z), (0.32, 0.36, 0.48))
        model.sphere("leaf", (-2.51, base_y + 0.60, z), 0.24)
    if pergola:
        top_y = base_y + 2.22
        for x in (-2.18, 0.08):
            model.box("wood_light", (x, base_y + 1.26, 2.67), (0.12, 2.03, 0.12))
        for z in (2.28, 2.66, 3.02):
            model.box("wood_light", (-1.05, top_y, z), (2.55, 0.11, 0.11))


def build_residence(level: int) -> Model:
    model = Model()
    floor_h = 2.38
    wall_height = level * floor_h

    # Main body and subtle floor bands. Upper lounge levels are slightly inset in plan.
    lower_levels = level - 1 if level >= 4 else level
    if lower_levels:
        model.box("plaster", (0, lower_levels * floor_h / 2, 0), (5.4, lower_levels * floor_h, 4.6))
    if level >= 4:
        model.box("plaster", (0.18, (level - 0.5) * floor_h, -0.12), (4.75, floor_h, 4.15))
    for floor in range(1, level):
        model.box("plaster_light", (0, floor * floor_h, 0), (5.45, 0.075, 4.64))
        model.box("plaster_light", (-1.10, floor * floor_h + 0.04, 2.36), (2.75, 0.14, 0.18))

    add_vertical_bay(model, wall_height, level)
    add_entrance(model)

    # Front windows and flower balconies.
    for floor in range(level):
        y = floor * floor_h + 1.22
        add_window_front(model, -1.15, y, 2.30 if floor < level - 1 else 2.00, 1.12)
        if floor == 0:
            add_planter(model, -1.15, 0.47, 2.70, bushes=6)
        elif floor < level - 1 or level <= 3:
            add_balcony_rail(model, floor)

    # Right and rear elevations use restrained, aligned windows.
    for floor in range(level):
        y = floor * floor_h + 1.20
        add_window_side(model, 0.72, y)
        if level >= 3:
            add_window_side(model, -0.92, y, width=0.60)
        add_window_back(model, -1.15, y)
        if level >= 4:
            add_window_back(model, 1.05, y)

    # Terracotta awning over the lower right-side window.
    model.box("terracotta", (2.85, 1.72, 0.72), (0.48, 0.13, 1.14), rotation_z=0.08)

    if level >= 4:
        add_rooftop_terrace(model, level, pergola=level == 5)

    model.gable("plaster_light", wall_height, 2.30)
    model.gable("plaster_light", wall_height, -2.30)
    add_roof(model, wall_height)
    add_chimney(model, wall_height)

    # Ground-level corner planters around the entrance.
    for x in (0.63, 2.07):
        model.box("wood_light", (x, 0.29, 2.52), (0.48, 0.58, 0.48))
        model.sphere("leaf", (x, 0.73, 2.52), 0.31)
    return model


def normal(a, b, c):
    ux, uy, uz = (b[i] - a[i] for i in range(3))
    vx, vy, vz = (c[i] - a[i] for i in range(3))
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return nx / length, ny / length, nz / length


def export_glb(model: Model, path: Path, level: int) -> dict[str, int]:
    material_names = list(MATERIALS)
    material_indices = {name: i for i, name in enumerate(material_names)}
    binary = bytearray()
    buffer_views = []
    accessors = []
    primitives = []
    vertex_total = 0
    triangle_total = 0

    def align() -> None:
        while len(binary) % 4:
            binary.append(0)

    def add_view(data: bytes, target: int) -> int:
        align()
        offset = len(binary)
        binary.extend(data)
        index = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return index

    for name in material_names:
        tris = model.triangles[name]
        if not tris:
            continue
        positions = []
        normals = []
        indices = []
        for tri in tris:
            n = normal(*tri)
            for vertex in tri:
                indices.append(len(positions) // 3)
                positions.extend(vertex)
                normals.extend(n)
        pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
        nor_bytes = struct.pack(f"<{len(normals)}f", *normals)
        idx_bytes = struct.pack(f"<{len(indices)}I", *indices)
        pos_view = add_view(pos_bytes, 34962)
        nor_view = add_view(nor_bytes, 34962)
        idx_view = add_view(idx_bytes, 34963)
        coords = list(zip(positions[0::3], positions[1::3], positions[2::3]))
        pos_accessor = len(accessors)
        accessors.append({
            "bufferView": pos_view, "componentType": 5126, "count": len(coords), "type": "VEC3",
            "min": [min(v[i] for v in coords) for i in range(3)],
            "max": [max(v[i] for v in coords) for i in range(3)],
        })
        nor_accessor = len(accessors)
        accessors.append({"bufferView": nor_view, "componentType": 5126, "count": len(coords), "type": "VEC3"})
        idx_accessor = len(accessors)
        accessors.append({"bufferView": idx_view, "componentType": 5125, "count": len(indices), "type": "SCALAR",
                          "min": [0], "max": [len(coords) - 1]})
        primitives.append({
            "attributes": {"POSITION": pos_accessor, "NORMAL": nor_accessor},
            "indices": idx_accessor, "material": material_indices[name], "mode": 4,
        })
        vertex_total += len(coords)
        triangle_total += len(tris)

    materials = []
    for name in material_names:
        color, roughness, emissive = MATERIALS[name]
        entry = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": color,
                "metallicFactor": 0.0,
                "roughnessFactor": roughness,
            },
            "doubleSided": False,
        }
        if emissive:
            entry["emissiveFactor"] = emissive
        materials.append(entry)

    document = {
        "asset": {"version": "2.0", "generator": "LifeCity procedural residential modeler"},
        "scene": 0,
        "scenes": [{"name": f"Residential_L{level:02d}", "nodes": [0]}],
        "nodes": [{"name": f"Residential_L{level:02d}", "mesh": 0}],
        "meshes": [{"name": f"Residential_L{level:02d}_Mesh", "primitives": primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_data = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(json_data) % 4:
        json_data += b" "
    align()
    while len(binary) % 4:
        binary.append(0)
    total_length = 12 + 8 + len(json_data) + 8 + len(binary)
    glb = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    glb.extend(struct.pack("<I4s", len(json_data), b"JSON"))
    glb.extend(json_data)
    glb.extend(struct.pack("<I4s", len(binary), b"BIN\x00"))
    glb.extend(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb)
    return {"vertices": vertex_total, "triangles": triangle_total, "bytes": len(glb)}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for level in range(1, 6):
        model = build_residence(level)
        path = OUTPUT / f"house-l{level:02d}.glb"
        stats = export_glb(model, path, level)
        print(f"{path.relative_to(ROOT)}: {stats['triangles']} tris, {stats['vertices']} verts, {stats['bytes']} bytes")


if __name__ == "__main__":
    main()
