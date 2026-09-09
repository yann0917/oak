"""参数化生成花园植物构件并导出 GLB。

用法（headless）：
  blender --background --python scripts/blender/gen-garden-plants.py
也可在 Blender MCP 里用 execute_blender_code 执行本文件内容。

产物：public/models/garden/<species>.glb
约定：每个 GLB 含 4 个命名网格 stem / foliage / flower / fruit，
      根部原点 (0,0,0)，Y-up，成株高 0.4~1.2m。
"""
import bpy
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "garden")
MAX_TRIS_PER_SPECIES = 1000


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mat(name, rgba, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    return m


def take(name, material):
    o = bpy.context.active_object
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(material)
    return o


def add_cylinder(name, r, h, color, verts=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(0, 0, h / 2))
    return take(name, mat(name + "_m", color))


def add_sphere(name, r, color, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=8, rings=4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = take(name, mat(name + "_m", color))
    o.scale = scale
    o.rotation_euler = rot
    return o


def join_group(name, objs):
    """把一组对象合并成一个网格，命名为构件名，并把原点归到根部 (0,0,0)"""
    objs = [o for o in objs if o]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.shade_flat()
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj


def build_stem(cfg):
    return [add_cylinder("stem", cfg["r"], cfg["h"], cfg["color"], verts=cfg.get("verts", 8))]


def build_foliage(cfg):
    objs = []
    for i in range(cfg["count"]):
        a = i * (2 * math.pi / cfg["count"]) + cfg.get("phase", 0.0)
        r = cfg["radius"]
        objs.append(add_sphere(
            "foliage_%d" % i, cfg["size"], cfg["color"],
            loc=(math.cos(a) * r, math.sin(a) * r, cfg["z"]),
            scale=(1.0, cfg.get("flat", 0.45), cfg.get("thin", 0.3)),
            rot=(0, 0, a),
        ))
    if cfg.get("top"):
        objs.append(add_sphere("foliage_top", cfg["top"]["size"], cfg["color"],
                               loc=(0, 0, cfg["top"]["z"])))
    return objs


def build_flower(cfg):
    objs = [add_sphere("flower_core", cfg["core"], cfg["core_color"], loc=(0, 0, cfg["z"]))]
    for i in range(cfg["petals"]):
        a = i * (2 * math.pi / cfg["petals"])
        objs.append(add_sphere(
            "flower_petal_%d" % i, cfg["petal"], cfg["petal_color"],
            loc=(math.cos(a) * cfg["spread"], math.sin(a) * cfg["spread"], cfg["z"]),
            scale=(1.0, 0.55, cfg.get("petal_thin", 0.3)), rot=(0, 0, a),
        ))
    return objs


def build_fruit(cfg):
    return [add_sphere("fruit", cfg["r"], cfg["color"], loc=(0, 0, cfg["z"]))]


SPECIES = {
    "sunflower": {
        "stem": dict(r=0.035, h=0.95, color=(0.36, 0.55, 0.30)),
        "foliage": dict(count=3, radius=0.10, size=0.16, z=0.42, color=(0.53, 0.76, 0.44),
                        top=dict(size=0.13, z=0.62)),
        "flower": dict(z=1.02, core=0.085, core_color=(0.42, 0.30, 0.18),
                       petal=0.075, petal_color=(0.97, 0.81, 0.40),
                       petals=12, spread=0.11, petal_thin=0.28),
        "fruit": dict(r=0.075, z=0.98, color=(0.45, 0.32, 0.20)),
    },
}


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def build_species(key, cfg):
    reset_scene()
    parts = [
        join_group("stem", build_stem(cfg["stem"])),
        join_group("foliage", build_foliage(cfg["foliage"])),
        join_group("flower", build_flower(cfg["flower"])),
        join_group("fruit", build_fruit(cfg["fruit"])),
    ]
    parts = [p for p in parts if p]
    tris = sum(tri_count(p) for p in parts)
    if tris > MAX_TRIS_PER_SPECIES:
        raise RuntimeError("%s 三角面 %d 超预算 %d" % (key, tris, MAX_TRIS_PER_SPECIES))
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, key + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_meshopt_compression_enable=True,
    )
    return path, tris


if __name__ == "__main__":
    for key, cfg in SPECIES.items():
        path, tris = build_species(key, cfg)
        print("EXPORTED %s tris=%d bytes=%d" % (path, tris, os.path.getsize(path)))
