"""参数化生成花园植物构件并导出 GLB。

两条入口都能直接跑（都会导出，不需要 `if __name__ == "__main__"` 守卫）：
  1. 命令行：blender --background --python scripts/blender/gen-garden-plants.py
  2. Blender MCP：execute_blender_code 里
     exec(open("<仓库绝对路径>/scripts/blender/gen-garden-plants.py").read())
     —— MCP 的 exec 命名空间里既没有 __file__ 也没有 __name__，所以输出目录
        由 OAK_GARDEN_OUT 环境变量或 FALLBACK_OUT_DIR 常量兜底。

产物：<OUT_DIR>/<species>.glb（默认 public/models/garden/）

约定：
  - 每个 GLB 含 4 个命名网格 stem / foliage / flower / fruit，Y-up，成株高 0.4~1.2m。
  - 原点约定（three.js 按生长阶段缩放构件时的锚点，见 PIVOT 表）：
      stem / foliage 原点在植株根部 (0,0,0) —— 缩放时贴地；
      flower / fruit  原点在着生高度（与茎顶相接处，= stem.h）—— 缩放时留在茎顶，
                      花苞期把 flower 缩到 0.45 也不会掉进叶丛。
  - 预算：单构件 ≤ MAX_TRIS_PER_PART，单物种 ≤ MAX_TRIS_PER_SPECIES，超了直接抛错。
"""
import bpy
import json
import math
import os

# MCP 入口（exec 命名空间里没有 __file__）的产物目录兜底
FALLBACK_OUT_DIR = "/Users/yabo/wwwroot/oak/public/models/garden"
MAX_TRIS_PER_PART = 300
MAX_TRIS_PER_SPECIES = 1000
EXPECTED_PARTS = ("stem", "foliage", "flower", "fruit")
# 构件原点：base = 植株根部 (0,0,0)；attach = 着生高度（茎顶）
PIVOT = {"stem": "base", "foliage": "base", "flower": "attach", "fruit": "attach"}


def out_dir():
    """产物目录：OAK_GARDEN_OUT 环境变量 > 脚本所在仓库 > 常量兜底。"""
    env = os.environ.get("OAK_GARDEN_OUT")
    if env:
        return env
    here = globals().get("__file__")
    if here:
        return os.path.abspath(os.path.join(
            os.path.dirname(here), "..", "..", "public", "models", "garden"))
    return FALLBACK_OUT_DIR


OUT_DIR = out_dir()


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


def add_cylinder(name, r, h, color, verts=8, z=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h,
                                        location=(0, 0, z + h / 2))
    return take(name, mat(name + "_m", color))


def add_sphere(name, r, color, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=8, rings=4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = take(name, mat(name + "_m", color))
    o.scale = scale
    o.rotation_euler = rot
    return o


def add_petal(name, length, width, tip_width, thick, color):
    """花瓣：沿 +x 伸出的扁盒（外端收窄），长/宽/厚为实际尺寸，12 三角面。

    有厚度、可绕 y 抬起、可绕 z 绕花心排布——不是零厚度的平面片。
    """
    hl, hw, tw, ht = length / 2.0, width / 2.0, tip_width / 2.0, thick / 2.0
    verts = [
        (-hl, -hw, -ht), (-hl, hw, -ht), (hl, tw, -ht), (hl, -tw, -ht),
        (-hl, -hw, ht), (-hl, hw, ht), (hl, tw, ht), (hl, -tw, ht),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return take(name, mat(name + "_m", color))


def join_group(name, objs):
    """把一组对象合并成一个网格，命名为构件名（原点先归零，最终由 set_origin 决定）"""
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
    # 三项全 apply：只 apply location 会把 join 留下的非均匀缩放带进导出节点
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def set_origin(obj, z):
    """把原点抬到 (0,0,z)，几何不动——导出后即该节点的平移量。"""
    if not z:
        return
    for v in obj.data.vertices:
        v.co.z -= z
    obj.location = (0.0, 0.0, z)


def build_stem(cfg):
    return [add_cylinder("stem", cfg["r"], cfg["h"], cfg["color"], verts=cfg.get("verts", 8))]


def build_foliage(cfg):
    segs, rings = cfg.get("segs", 8), cfg.get("rings", 4)
    objs = []
    for i in range(cfg["count"]):
        a = i * (2 * math.pi / cfg["count"]) + cfg.get("phase", 0.0)
        r = cfg["radius"]
        objs.append(add_sphere(
            "foliage_%d" % i, cfg["size"], cfg["color"],
            loc=(math.cos(a) * r, math.sin(a) * r, cfg["z"]),
            scale=(1.0, cfg.get("flat", 0.45), cfg.get("thin", 0.3)),
            rot=(0, 0, a), segs=segs, rings=rings,
        ))
    top = cfg.get("top")
    if top:
        objs.append(add_sphere(
            "foliage_top", top["size"], cfg["color"],
            loc=(0, 0, top["z"]),
            scale=top.get("scale", (1.0, 0.55, 0.22)),  # 压扁，否则是一颗球
            rot=top.get("rot", (0, 0, 0)), segs=segs, rings=rings,
        ))
    return objs


def build_flower(cfg, attach=0.0):
    """花头：深色扁圆花心 + 一圈或多圈有厚度、向上倾斜的花瓣。

    几何直接建在着生高度 attach 之上（花心底面贴着茎顶），原点由 build_species
    用 set_origin 抬到 attach——缩放时花头留在茎顶而不是掉进叶丛。
    花瓣圈写在 rings 里，每圈 dict(count=个数, length=花瓣长, phase=错开比例)。
    """
    core_h = cfg.get("core_h", 0.035)
    objs = [add_cylinder("flower_core", cfg["core"], core_h, cfg["core_color"],
                         verts=cfg.get("verts", 12), z=attach)]
    tilt = math.radians(cfg.get("tilt", 20.0))
    base_r = cfg.get("base", cfg["core"] * 0.92)
    base_z = attach + core_h * 0.55
    rings = cfg.get("rings") or [dict(count=cfg["petals"], length=cfg["petal"])]
    for ri, ring in enumerate(rings):
        n, length = ring["count"], ring["length"]
        wid = ring.get("wid", cfg.get("petal_wid", length * 0.38))
        tip = ring.get("tip", cfg.get("petal_tip", wid * 0.7))
        thick = ring.get("thick", cfg.get("petal_thick", length * 0.12))
        for i in range(n):
            a = (i + ring.get("phase", 0.0)) * (2 * math.pi / n)
            c, s = math.cos(a), math.sin(a)
            o = add_petal("flower_petal_%d_%d" % (ri, i), length, wid, tip, thick,
                          cfg["petal_color"])
            # 内端落在 (base_r, base_z)；Ry(-tilt) 把 +x 端抬起，再绕 z 排到 a 方向
            o.location = ((base_r + length / 2.0 * math.cos(tilt)) * c,
                          (base_r + length / 2.0 * math.cos(tilt)) * s,
                          base_z + length / 2.0 * math.sin(tilt))
            o.rotation_euler = (0.0, -tilt, a)
            objs.append(o)
    return objs


def build_fruit(cfg, attach=0.0):
    """果实：几何建在着生高度 attach 之上，cfg["z"] 是相对茎顶的抬升。"""
    return [add_sphere("fruit", cfg["r"], cfg["color"],
                       loc=(0, 0, attach + cfg.get("z", cfg["r"] * 0.4)),
                       scale=cfg.get("scale", (1, 1, 1)),
                       segs=cfg.get("segs", 8), rings=cfg.get("rings", 4))]


SPECIES = {
    "sunflower": {
        "stem": dict(r=0.035, h=0.95, color=(0.36, 0.55, 0.30)),
        "foliage": dict(count=3, radius=0.10, size=0.16, z=0.42, color=(0.53, 0.76, 0.44),
                        top=dict(size=0.13, z=0.62, scale=(1.0, 0.55, 0.22))),
        "flower": dict(core=0.06, core_h=0.032, core_color=(0.24, 0.15, 0.08),
                       petal_color=(0.97, 0.81, 0.40),
                       petal_wid=0.028, petal_tip=0.020, petal_thick=0.011, tilt=15.0,
                       rings=[dict(count=12, length=0.125),
                              dict(count=8, length=0.088, phase=0.5)]),
        "fruit": dict(r=0.075, z=0.03, color=(0.45, 0.32, 0.20)),
    },
}


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def glb_mesh_names(path):
    """读 GLB 的 JSON chunk 取网格名（只用标准库）"""
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        raise RuntimeError("不是 GLB 文件：%s" % path)
    length = int.from_bytes(data[12:16], "little")
    doc = json.loads(data[20:20 + length].decode("utf-8"))
    return [m.get("name") for m in doc.get("meshes", [])]


def build_species(key, cfg):
    reset_scene()
    attach = cfg["stem"]["h"]  # 花/果的着生高度 = 茎顶
    parts = []
    for name, objs in (
        ("stem", build_stem(cfg["stem"])),
        ("foliage", build_foliage(cfg["foliage"])),
        ("flower", build_flower(cfg["flower"], attach)),
        ("fruit", build_fruit(cfg["fruit"], attach)),
    ):
        obj = join_group(name, objs)
        if obj is None:
            continue
        set_origin(obj, attach if PIVOT[name] == "attach" else 0.0)
        tris = tri_count(obj)
        if tris > MAX_TRIS_PER_PART:
            raise RuntimeError("%s 的构件 %s 三角面 %d 超单构件预算 %d"
                               % (key, name, tris, MAX_TRIS_PER_PART))
        print("PART %-8s tris=%d" % (name, tris))
        parts.append(obj)
    names = sorted(p.name for p in parts)
    if names != sorted(EXPECTED_PARTS):
        raise RuntimeError("%s 构件不全：%s（应为 %s）" % (key, names, list(EXPECTED_PARTS)))
    total = sum(tri_count(p) for p in parts)
    if total > MAX_TRIS_PER_SPECIES:
        raise RuntimeError("%s 三角面 %d 超预算 %d" % (key, total, MAX_TRIS_PER_SPECIES))
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
    exported = glb_mesh_names(path)
    if sorted(exported) != sorted(EXPECTED_PARTS):
        raise RuntimeError("%s 导出的 GLB 网格 %s 与约定 %s 不符"
                           % (key, exported, list(EXPECTED_PARTS)))
    return path, total


def main():
    for key, cfg in SPECIES.items():
        path, total = build_species(key, cfg)
        print("EXPORTED %s tris=%d bytes=%d" % (path, total, os.path.getsize(path)))


# 无条件执行：CLI（--python）与 MCP（exec，命名空间里没有 __name__）两条入口都要导出
main()
