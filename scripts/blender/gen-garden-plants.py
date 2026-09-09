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
  - 花头参数契约：core/core_h/core_verts/core_color 是深色小圆顶花心；花瓣用
    rings=[dict(count, length, phase, tilt, wid, base, thick)] 表达（窄基宽尖的锥形
    叶片，wid=外端最宽、base=基部宽），外层参数 petal_wid/petal_base/petal_thick/
    tilt/jitter 是各圈的默认值；缺 rings 时退化成单圈 petals×petal。base_r 是花瓣
    基部的半径（旧键 base 兼容）。叶片用 count/size/z/tilt/flat/thin/inset 定位
    （旧参数 radius 仍兼容）。
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


def add_cylinder(name, r, h, color, verts=8, z=0.0, r_top=None):
    """圆柱；给了 r_top 且与 r 不同时退化成上细下粗的圆台（茎用它变细）。"""
    if r_top is None or abs(r_top - r) < 1e-6:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h,
                                            location=(0, 0, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r_top,
                                        depth=h, location=(0, 0, z + h / 2))
    return take(name, mat(name + "_m", color))


def add_sphere(name, r, color, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=8, rings=4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = take(name, mat(name + "_m", color))
    o.scale = scale
    o.rotation_euler = rot
    return o


def wobble(i, salt, amount):
    """确定性伪随机 ∈ [-amount, amount]：两次导出可复现，不需要 random 模块。"""
    v = math.sin((i + 1) * 12.9898 + salt) * 43758.5453
    return ((v - math.floor(v)) * 2.0 - 1.0) * amount


def add_petal(name, length, wid, base, thick, color, tip_thin=0.45):
    """花瓣：基部窄、向外渐宽到尖端的锥形叶片（梯形轮廓），12 三角面。

    不是等宽直板：base = 基部宽、wid = 外端最宽、length : wid ≈ 3 : 1；厚度从
    基部的 thick 收薄到尖端的 tip_thin×thick，所以侧视有厚度、俯视是花瓣不是方棒。
    几何从 x=0（基部）伸到 x=length（尖端），原点在基部——由 build_flower 摆到
    (base_r, base_z) 并按倾角/方位角旋转。
    """
    hb, hw = base / 2.0, wid / 2.0
    ht, tt = thick / 2.0, thick * tip_thin / 2.0
    verts = [
        (0.0, -hb, -ht), (0.0, hb, -ht), (length, hw, -tt), (length, -hw, -tt),
        (0.0, -hb, ht), (0.0, hb, ht), (length, hw, tt), (length, -hw, tt),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return take(name, mat(name + "_m", color))


def add_dome(name, r, h, color, verts=10, z=0.0):
    """花心：小圆盘 + 微微隆起的顶——不是高球、也不是薄片，4N 三角面。

    底圈（半径 r，z=0）→ 顶圈（0.55r，0.75h）→ 顶心（0，h），底面封平。
    z 是花心底面所在的绝对高度（通常 = 着生高度 attach）。
    """
    n = max(3, int(verts))
    bot, top = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        bot.append((math.cos(a) * r, math.sin(a) * r, z))
        top.append((math.cos(a) * r * 0.55, math.sin(a) * r * 0.55, z + h * 0.75))
    allv = bot + top + [(0.0, 0.0, z + h), (0.0, 0.0, z)]
    apex, center = 2 * n, 2 * n + 1
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))   # 侧壁
        faces.append((n + i, n + j, apex))   # 顶面扇
        faces.append((j, i, center))         # 底面扇
    me = bpy.data.meshes.new(name)
    me.from_pydata(allv, [], faces)
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
    return [add_cylinder("stem", cfg["r"], cfg["h"], cfg["color"],
                         verts=cfg.get("verts", 8), r_top=cfg.get("r_top"))]


def build_foliage(cfg):
    """叶片：默认把叶柄端贴在茎上，沿叶片方向外移半个叶长，再按 tilt 上抬。

    给了 radius（旧参数）时退回「中心距茎轴 radius、不因 tilt 补偿高度」的行为，
    Task 5 的老参数表仍能跑。
    """
    segs, rings = cfg.get("segs", 8), cfg.get("rings", 4)
    size = cfg["size"]
    tilt = math.radians(cfg.get("tilt", 0.0))
    inset = cfg.get("inset", 0.02)
    objs = []
    for i in range(cfg["count"]):
        a = i * (2 * math.pi / cfg["count"]) + cfg.get("phase", 0.0)
        if cfg.get("radius") is not None:
            r, z = cfg["radius"], cfg["z"]
        else:
            r = inset + size * math.cos(tilt)
            z = cfg["z"] + size * math.sin(tilt)
        objs.append(add_sphere(
            "foliage_%d" % i, size, cfg["color"], loc=(math.cos(a) * r, math.sin(a) * r, z),
            scale=(1.0, cfg.get("flat", 0.45), cfg.get("thin", 0.3)),
            rot=(0.0, -tilt, a), segs=segs, rings=rings,
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
    """花头：小圆顶深色花心 + 两圈错开的锥形花瓣。

    几何直接建在着生高度 attach 之上（花心底面贴着茎顶），原点由 build_species
    用 set_origin 抬到 attach——缩放时花头留在茎顶而不是掉进叶丛。
    花瓣圈写在 rings 里，每圈 dict(count=个数, length=花瓣长, phase=错开比例,
    tilt=该圈上抬角, wid/base/thick=该圈花瓣尺寸)；每片花瓣的倾角/长度/方位都带
    确定性抖动（jitter），避免机械感。缺 rings 时退化成单圈 petals×petal。
    """
    core_r = cfg["core"]
    core_h = cfg.get("core_h", 0.026)
    core_verts = cfg.get("core_verts", cfg.get("verts", 10))
    objs = [add_dome("flower_core", core_r, core_h, cfg["core_color"],
                     verts=core_verts, z=attach)]
    base_r = cfg.get("base_r", cfg.get("base", core_r * 0.74))  # 花瓣基部半径（伸进花心边缘）
    base_z = attach + core_h * 0.45
    jitter = cfg.get("jitter", 0.4)
    rings = cfg.get("rings") or [dict(count=cfg["petals"], length=cfg["petal"])]
    for ri, ring in enumerate(rings):
        n, length = ring["count"], ring["length"]
        tilt = math.radians(ring.get("tilt", cfg.get("tilt", 20.0)))
        wid = ring.get("wid", cfg.get("petal_wid", length * 0.32))
        base = ring.get("base", cfg.get("petal_base", wid * 0.36))
        thick = ring.get("thick", cfg.get("petal_thick", 0.010))
        for i in range(n):
            a = (i + ring.get("phase", 0.0)) * (2 * math.pi / n)
            li = length * (1.0 + wobble(i, 1.7 + ri, 0.07 * jitter))
            ti = tilt + math.radians(wobble(i, 5.3 + ri, 4.5 * jitter))
            ai = a + math.radians(wobble(i, 9.1 + ri, 2.0 * jitter))
            c, s = math.cos(ai), math.sin(ai)
            o = add_petal("flower_petal_%d_%d" % (ri, i), li, wid, base, thick,
                          cfg["petal_color"])
            # 基部落在 (base_r, base_z)，Ry(-tilt) 把 +x 端抬起，再绕 z 排到 ai 方向
            o.location = (base_r * c, base_r * s, base_z)
            o.rotation_euler = (0.0, -ti, ai)
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
        # 茎细一档（0.033 → 0.023 的圆台，均值 ≈ 0.028），不再读作一根柱子
        "stem": dict(r=0.033, r_top=0.023, h=0.95, color=(0.36, 0.55, 0.30)),
        # 两片大叶、对面着生、上抬 25°、位置压低（0.30），把上半段留给花头
        "foliage": dict(count=2, size=0.165, z=0.30, tilt=25.0, flat=0.45, thin=0.13,
                        inset=0.02, phase=0.6, color=(0.53, 0.76, 0.44)),
        # 花心 r=0.07 / 拱高 0.026 的深棕小圆顶；外圈 13 片长 0.118、上抬 20°，
        # 内圈 8 片更短更立（28°）错开半格、瓣尖伸进外圈缝隙——花瓣窄基宽尖带抖动
        "flower": dict(core=0.07, core_h=0.026, core_verts=10,
                       core_color=(0.24, 0.17, 0.11), petal_color=(0.97, 0.76, 0.24),
                       petal_wid=0.042, petal_base=0.014, petal_thick=0.011,
                       tilt=20.0, jitter=0.4,
                       rings=[dict(count=13, length=0.118),
                              dict(count=8, length=0.092, phase=0.5, tilt=28.0,
                                   wid=0.036, base=0.012, thick=0.009)]),
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
