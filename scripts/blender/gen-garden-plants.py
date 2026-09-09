"""参数化生成花园植物构件并导出 GLB。

两条入口都能直接跑（都会导出，不需要 `if __name__ == "__main__"` 守卫）：
  1. 命令行：blender --background --python scripts/blender/gen-garden-plants.py
  2. Blender MCP：execute_blender_code 里
     exec(open("<仓库绝对路径>/scripts/blender/gen-garden-plants.py").read())
     —— MCP 的 exec 命名空间里既没有 __file__ 也没有 __name__，所以输出目录
        由 OAK_GARDEN_OUT 环境变量或 FALLBACK_OUT_DIR 常量兜底。

产物：<OUT_DIR>/<species>.glb（默认 public/models/garden/）

造型方法（2026-09-09 返工：不再用球/圆柱拼图元，全部构件是函数生成的参数化曲面）：
  - 花瓣 / 叶片 `lens_mesh()`：nu×nv 参数网格的「透镜壳」。中面由 mid_fn(u, v) 给出——
    花瓣 = 窄基宽尖的轮廓 + 杯状横截面（边缘高于中脊）+ 尖端上卷；叶片 = 宽叶轮廓 +
    中脊折痕（边缘低于中脊）+ 叶尖下垂 + 沿长度渐进扭转。内部顶点沿中面法向按 thick_fn
    偏移 ±厚/2，边界（u=0/1、v=±1）厚度收敛为 0 所以顶底共享边界顶点：壳水密、不需要
    rim 面，比 Solidify 省一半面数，横截面还是真实的「中间厚、边缘薄刃」花瓣剖面。
  - 茎 / 叶柄 `tube_mesh()`：沿轴扫掠的圆管，半径按剖面关键帧变化（基部略粗、向上渐细）。
  - 花心 / 果实 `dome_mesh()`：旋转面，半径-高度剖面控制圆顶（花心是扁圆顶，果实是带
    轻微扇贝边缘的种子盘）；花头背面另有绿色花托锥，侧视才不是「薄片贴一根棍」。
  - 每个构件最后 `shade_smooth` + `shade_smooth_by_angle(38°)`：曲面平滑、薄刃折边清晰。

约定：
  - 每个 GLB 含 4 个命名网格 stem / foliage / flower / fruit，Y-up，成株高 0.4~1.2m。
  - 原点约定（three.js 按生长阶段缩放构件时的锚点，见 PIVOT 表）：
      stem / foliage 原点在植株根部 (0,0,0) —— 缩放时贴地；
      flower / fruit  原点在着生高度（与茎顶相接处，= stem.h）—— 缩放时留在茎顶，
                      花苞期把 flower 缩到 0.45 也不会掉进叶丛。
  - 预算：单构件 ≤ MAX_TRIS_PER_PART，单物种 ≤ MAX_TRIS_PER_SPECIES，超了直接抛错。
  - 花头参数契约（Task 5 加新物种请按此写）：
      core/core_h/core_segs/core_color  深色扁圆顶花心；back_color 花托（背面）
      petal_color                       花瓣色
      head_tilt/head_az                 整个花头相对茎顶的低头角度/方位（0 = 正朝上）
      rings=[dict(count, length, tilt, wid, thick, curl, cup, phase, base_r)]
        count   该圈花瓣数
        length  花瓣长（米，基部到尖端）
        tilt    该圈上抬角（度，0 = 水平、90 = 竖直向上）
        wid     花瓣最大半宽（米）
        thick   花瓣中脊最大厚度（米）
        curl    尖端上卷高度（米，沿长度方向的弧形）
        cup     杯状横截面的边缘抬升（米）
        phase   该圈方位偏移（圈，1.0 = 一整圈；外层 0、内层 0.5/count 就错开半格）
        base_r  花瓣基部距花轴的半径（米，应 < core，压在花心边缘下）
      jitter    每片花瓣的长度/倾角/方位/滚转确定性抖动幅度（0 = 完全规整）
    叶片参数：count + 每片的 z/az/tilt 数组（度，朝向各异）+ blade/wid 叶身尺寸 +
      petiole/petiole_r 叶柄 + droop/fold/twist/thick 曲面参数 + color；
    果实用 r/h/segs/scallop 描述种子盘，back_color 是背面花托。
"""
import bpy
import bmesh
import json
import math
import os

# MCP 入口（exec 命名空间里没有 __file__）的产物目录兜底
FALLBACK_OUT_DIR = "/Users/yabo/wwwroot/oak/public/models/garden"
MAX_TRIS_PER_PART = 1200
MAX_TRIS_PER_SPECIES = 3000
EXPECTED_PARTS = ("stem", "foliage", "flower", "fruit")
# 构件原点：base = 植株根部 (0,0,0)；attach = 着生高度（茎顶）
PIVOT = {"stem": "base", "foliage": "base", "flower": "attach", "fruit": "attach"}
# 平滑着色角度阈值：小于它算同一曲面（平滑），大于它算折边（保持锐利）
SMOOTH_ANGLE = 38.0
TWO_PI = 2.0 * math.pi


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
_MATS = {}


def reset_scene():
    _MATS.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mat(name, rgba, rough=0.85):
    """材质（按颜色+粗糙度缓存复用，一个构件里同色只出一个材质）。"""
    key = (name, tuple(round(c, 4) for c in rgba), round(rough, 3))
    if key not in _MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = 0.0
        _MATS[key] = m
    return _MATS[key]


def keyed(keys, t):
    """剖面关键帧插值（smoothstep）：keys = [(t0, v0), ...] 按 t 升序，两端夹紧。"""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            return v0 + (v1 - v0) * (u * u * (3.0 - 2.0 * u))
    return keys[-1][1]


def wobble(i, salt, amount):
    """确定性伪随机 ∈ [-amount, amount]：两次导出可复现，不需要 random 模块。"""
    v = math.sin((i + 1) * 12.9898 + salt) * 43758.5453
    return ((v - math.floor(v)) * 2.0 - 1.0) * amount


def new_obj(name, verts, faces, material, smooth=SMOOTH_ANGLE):
    """建网格 → 统一法线朝外 → 平滑着色（按角度保留折边）→ 挂材质。"""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.data.materials.append(material)
    if smooth:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth))
    return obj


def lens_mesh(name, material, nu, nv, mid_fn, thick_fn):
    """水密「透镜壳」：nu×nv 参数网格，边界厚度为 0 → 顶底共享顶点。

    mid_fn(u, v) -> (x, y, z)  中面；u ∈ [0,1] 沿长度，v ∈ [-1,1] 横向
    thick_fn(u, v) -> 全厚（米）；内部顶点沿中面法向各偏移 ±厚/2
    三角面数 = 2 × (nu-1) × (nv-1) × 2
    """
    verts = []
    top, bot = {}, {}

    def add(p):
        verts.append(p)
        return len(verts) - 1

    def normal(u, v):
        e = 1e-4
        pu, pu0 = mid_fn(min(1.0, u + e), v), mid_fn(max(0.0, u - e), v)
        pv, pv0 = mid_fn(u, min(1.0, v + e)), mid_fn(u, max(-1.0, v - e))
        tu = [(a - b) / (2.0 * e) for a, b in zip(pu, pu0)]
        tv = [(a - b) / (2.0 * e) for a, b in zip(pv, pv0)]
        n = (tu[1] * tv[2] - tu[2] * tv[1],
             tu[2] * tv[0] - tu[0] * tv[2],
             tu[0] * tv[1] - tu[1] * tv[0])
        ln = math.sqrt(sum(c * c for c in n)) or 1.0
        return [c / ln for c in n]

    for i in range(nu):
        u = i / (nu - 1.0)
        for j in range(nv):
            v = -1.0 + 2.0 * j / (nv - 1.0)
            p = mid_fn(u, v)
            if i in (0, nu - 1) or j in (0, nv - 1):
                top[(i, j)] = bot[(i, j)] = add(p)
            else:
                t = 0.5 * max(0.0, thick_fn(u, v))
                n = normal(u, v)
                top[(i, j)] = add(tuple(p[d] + n[d] * t for d in range(3)))
                bot[(i, j)] = add(tuple(p[d] - n[d] * t for d in range(3)))
    faces = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            faces.append((top[(i, j)], top[(i + 1, j)], top[(i + 1, j + 1)], top[(i, j + 1)]))
            faces.append((bot[(i, j + 1)], bot[(i + 1, j + 1)], bot[(i + 1, j)], bot[(i, j)]))
    return new_obj(name, verts, faces, material)


def tube_mesh(name, material, segs, profile, axis="z", cap=True):
    """沿轴扫掠的圆管：profile = [(t, r), ...]，t 沿轴位置、r 该处半径。"""
    verts, faces, rings = [], [], []
    for t, r in profile:
        rings.append(len(verts))
        for k in range(segs):
            a = TWO_PI * k / segs
            c, s = math.cos(a), math.sin(a)
            if axis == "z":
                verts.append((c * r, s * r, t))
            else:
                verts.append((t, c * r, s * r))
    for ri in range(len(profile) - 1):
        a0, b0 = rings[ri], rings[ri + 1]
        for k in range(segs):
            k2 = (k + 1) % segs
            faces.append((a0 + k, a0 + k2, b0 + k2, b0 + k))
    if cap:
        for ri in (0, len(profile) - 1):
            t = profile[ri][0]
            c = len(verts)
            verts.append((0.0, 0.0, t) if axis == "z" else (t, 0.0, 0.0))
            base = rings[ri]
            for k in range(segs):
                faces.append((base + k, base + (k + 1) % segs, c))
    return new_obj(name, verts, faces, material)


def dome_mesh(name, material, segs, profile, radius=1.0, scallop=0.0, close_bottom=True):
    """旋转面：profile = [(rho, z), ...] 从顶点（rho=0）到边缘（rho=1），rho 是半径比例。

    radius 是边缘实际半径（米），z 用绝对高度。scallop 给边缘加径向波纹（种子盘扇贝边）。
    close_bottom 用扇面封住最后一个环（朝下的花心底面 / 花托底面）。
    """
    verts, faces, rings = [], [], []
    for rho, z in profile:
        if rho <= 1e-6:
            rings.append((len(verts), 1))
            verts.append((0.0, 0.0, z))
        else:
            rings.append((len(verts), segs))
            for k in range(segs):
                a = TWO_PI * k / segs
                r = radius * rho * (1.0 + scallop * (rho ** 2) * math.sin(8.0 * a))
                verts.append((math.cos(a) * r, math.sin(a) * r, z))
    for ri in range(len(profile) - 1):
        (a0, na), (b0, nb) = rings[ri], rings[ri + 1]
        if na == 1:
            for k in range(nb):
                faces.append((a0, b0 + k, b0 + (k + 1) % nb))
        elif nb == 1:
            for k in range(na):
                faces.append((a0 + k, a0 + (k + 1) % na, b0))
        else:
            for k in range(segs):
                k2 = (k + 1) % segs
                faces.append((a0 + k, a0 + k2, b0 + k2, b0 + k))
    if close_bottom:
        a0, na = rings[-1]
        c = len(verts)
        verts.append((0.0, 0.0, profile[-1][1]))
        for k in range(na):
            faces.append((a0 + (k + 1) % na, a0 + k, c))
    return new_obj(name, verts, faces, material)


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


def nod(obj, angle_deg, azimuth_deg):
    """绕构件原点低头：整个花头朝 azimuth 方向倾斜 angle 度（向日葵的低头姿态）。"""
    if not angle_deg:
        return
    a = math.radians(angle_deg)
    az = math.radians(azimuth_deg)
    ca, sa = math.cos(a), math.sin(a)
    cz, sz = math.cos(az), math.sin(az)
    for v in obj.data.vertices:
        x, y, z = v.co
        x1, z1 = x * ca + z * sa, -x * sa + z * ca   # Ry(+a)：+z 倒向 +x
        v.co = (x1 * cz - y * sz, x1 * sz + y * cz, z1)   # Rz(az)：转到方位
    obj.data.update()


# ---------------------------------------------------------------- 花瓣 / 叶片
# 花瓣轮廓：u 处半宽相对最大值（窄基 → 最宽在 0.6 处 → 钝圆尖端）
PETAL_W = [(0.0, 0.30), (0.16, 0.60), (0.40, 0.92), (0.62, 1.0), (0.82, 0.86), (1.0, 0.42)]
# 叶片轮廓：基部收窄 → 宽心形 → 尖叶尖
LEAF_W = [(0.0, 0.16), (0.10, 0.44), (0.26, 0.80), (0.44, 1.0), (0.64, 0.90), (0.82, 0.58), (1.0, 0.08)]


def petal_mid(length, wid, curl, cup):
    """花瓣中面：+x 沿长度、±y 横向、+z 向上（杯状横截面 + 尖端上卷）。

    杯状（cup）从基部 0 渐增到尖端满值，这样花瓣根部平贴花心、不会在花心边缘拱出折痕。
    """
    def f(u, v):
        half = wid * keyed(PETAL_W, u)
        return (length * u,
                v * half,
                curl * (u ** 1.8) + cup * (abs(v) ** 1.8) * (0.05 + 0.95 * u))
    return f


def petal_thick(thick):
    """花瓣厚度：中脊最厚，向两侧和尖端收薄（边界处由透镜拓扑收敛到 0）。"""
    return lambda u, v: thick * (1.0 - abs(v) ** 2.0) * (1.0 - 0.30 * u)


def leaf_mid(length, wid, droop, fold, twist):
    """叶片中面：中脊折痕（边缘低于中脊）+ 叶尖下垂 + 沿长度的渐进扭转。"""
    def f(u, v):
        half = wid * keyed(LEAF_W, u)
        z = -droop * length * (u ** 1.7) - fold * abs(v) * half + twist * u * (v * half)
        return (length * u, v * half, z)
    return f


def leaf_thick(thick):
    """叶片厚度：主脉处更厚（(1-|v|)³ 项），向边缘和叶尖收薄。"""
    return lambda u, v: thick * ((1.0 - abs(v) ** 1.5) + 0.55 * (1.0 - abs(v)) ** 3) * (1.0 - 0.25 * u)


# ---------------------------------------------------------------- 构件
def build_stem(cfg):
    """茎：沿 z 扫掠的圆台管，半径按 profile 关键帧变化（基部略粗、向上渐细）。"""
    h = cfg["h"]
    r = cfg["r"]
    ts = cfg.get("rings", [0.0, 0.03, 0.12, 0.30, 0.55, 0.80, 1.0])
    profile = [(t * h, r * keyed(cfg["profile"], t)) for t in ts]
    return [tube_mesh("stem", mat("stem_m", cfg["color"]), cfg.get("segs", 14), profile)]


def build_foliage(cfg):
    """叶片：每片 = 细叶柄（管）+ 宽叶身（透镜壳），从茎轴向外斜上伸展。

    每片的 z/az/tilt/twist 都是独立数组，所以叶子是互生、朝向各异而不是复制粘贴。
    """
    color = mat("leaf_m", cfg["color"])
    objs = []
    for i in range(cfg["count"]):
        pet = cfg.get("petiole", 0.07)
        pr = cfg.get("petiole_r", 0.0085)
        stalk = tube_mesh("petiole_%d" % i, color, 8,
                          [(0.0, pr * 1.15), (pet * 0.55, pr * 0.95), (pet, pr * 0.82)],
                          axis="x")
        blade = lens_mesh("blade_%d" % i, color, cfg.get("nu", 7), cfg.get("nv", 4),
                          leaf_mid(cfg["blade"], cfg["wid"], cfg.get("droop", 0.16),
                                   cfg.get("fold", 0.30), cfg.get("twist", 0.35)),
                          leaf_thick(cfg.get("thick", 0.014)))
        for v in blade.data.vertices:
            v.co.x += pet
        obj = join_group("leaf_%d" % i, [stalk, blade])
        obj.location = (0.0, 0.0, cfg["z"][i])
        obj.rotation_euler = (0.0, -math.radians(cfg["tilt"][i]), math.radians(cfg["az"][i]))
        objs.append(obj)
    return objs


def build_flower(cfg, attach):
    """花头：深色扁圆顶花心 + 绿色花托 + 两圈错开的花瓣（每片长度/倾角/方位/滚转有抖动）。

    几何直接建在着生高度 attach 之上（花心底面贴着茎顶），原点由 build_species 用
    set_origin 抬到 attach——缩放时花头留在茎顶而不是掉进叶丛。
    """
    core_r = cfg["core"]
    core_h = cfg.get("core_h", 0.030)
    segs = cfg.get("core_segs", 12)
    objs = [
        dome_mesh("flower_core", mat("core_m", cfg["core_color"]), segs,
                  [(0.0, attach + core_h), (0.62, attach + core_h * 0.95), (1.0, attach)],
                  radius=core_r, scallop=cfg.get("core_scallop", 0.010), close_bottom=True),
        # 花头背面：从花心边缘收向茎顶的绿色花托（浅锥，不能太深否则读成酒杯）
        dome_mesh("flower_back", mat("back_m", cfg.get("back_color", cfg["core_color"])), segs,
                  [(0.0, attach - core_r * 0.30), (0.55, attach - core_r * 0.22), (1.0, attach)],
                  radius=core_r, close_bottom=False),
    ]
    petal_mat = mat("petal_m", cfg["petal_color"])
    jitter = cfg.get("jitter", 0.5)
    base_z = attach + cfg.get("base_z", 0.002)
    for ri, ring in enumerate(cfg["rings"]):
        n = ring["count"]
        tilt = ring.get("tilt", 22.0)
        base_r = ring.get("base_r", core_r * 0.82)
        for i in range(n):
            a = (i / n + ring.get("phase", 0.0)) * TWO_PI
            length = ring["length"] * (1.0 + wobble(i, 1.7 + ri, 0.06 * jitter))
            ti = tilt + wobble(i, 5.3 + ri, 4.5 * jitter)
            ai = a + math.radians(wobble(i, 9.1 + ri, 2.0 * jitter))
            roll = math.radians(wobble(i, 13.7 + ri, 7.0 * jitter))
            wid = ring["wid"] * (1.0 + wobble(i, 3.1 + ri, 0.05 * jitter))
            p = lens_mesh("petal_%d_%d" % (ri, i), petal_mat,
                          ring.get("nu", 6), ring.get("nv", 4),
                          petal_mid(length, wid, ring.get("curl", 0.030), ring.get("cup", 0.011)),
                          petal_thick(ring.get("thick", 0.013)))
            # 基部落在 (base_r, base_z)，Ry(-tilt) 把 +x 端抬起，Rx(roll) 先自转，再绕 z 排方位
            p.location = (base_r * math.cos(ai), base_r * math.sin(ai), base_z)
            p.rotation_euler = (roll, -math.radians(ti), ai)
            objs.append(p)
    return objs


def build_fruit(cfg, attach):
    """果实：带扇贝边的深棕种子盘 + 绿色花托，几何建在着生高度之上。"""
    segs = cfg.get("segs", 16)
    r, h = cfg["r"], cfg["h"]
    return [
        dome_mesh("fruit_disc", mat("fruit_m", cfg["color"]), segs,
                  [(0.0, attach + h), (0.35, attach + h * 0.94), (0.68, attach + h * 0.76),
                   (0.90, attach + h * 0.44), (1.0, attach)],
                  radius=r, scallop=cfg.get("scallop", 0.020), close_bottom=True),
        dome_mesh("fruit_back", mat("back_m", cfg.get("back_color", cfg["color"])), segs,
                  [(0.0, attach - r * 0.62), (0.30, attach - r * 0.56),
                   (0.66, attach - r * 0.30), (1.0, attach)],
                  radius=r, close_bottom=False),
    ]


SPECIES = {
    "sunflower": {
        # 茎：基部略粗的圆台管，向上收细到 58%
        "stem": dict(h=0.88, r=0.018, segs=14, color=(0.34, 0.50, 0.28),
                     profile=[(0.0, 1.32), (0.03, 1.05), (0.50, 0.82), (1.0, 0.58)]),
        # 叶：4 片互生、朝向各异、上抬 18~30°，叶尖下垂 + 渐进扭转
        "foliage": dict(count=4, color=(0.40, 0.63, 0.31),
                        blade=0.235, wid=0.098, petiole=0.085, petiole_r=0.0085,
                        droop=0.24, fold=0.18, twist=0.40, thick=0.014, nu=8, nv=4,
                        z=[0.30, 0.45, 0.60, 0.72], az=[15.0, 108.0, 200.0, 292.0],
                        tilt=[26.0, 30.0, 22.0, 18.0]),
        # 花头：花心 r=0.095 扁圆顶（占头宽约一半，向日葵的关键比例）；外圈 12 片
        # 近平铺（上抬 12°、尖端轻上卷），内圈 6 片错开半格、更立（26°）填缝
        "flower": dict(core=0.090, core_h=0.026, core_segs=16, core_scallop=0.010,
                       core_color=(0.26, 0.17, 0.10), back_color=(0.33, 0.46, 0.26),
                       petal_color=(0.98, 0.78, 0.22), jitter=0.5,
                       head_tilt=7.0, head_az=305.0,
                       rings=[dict(count=12, length=0.128, tilt=9.0, wid=0.050,
                                   thick=0.012, curl=0.024, cup=0.007,
                                   phase=0.0, base_r=0.078),
                              dict(count=6, length=0.096, tilt=19.0, wid=0.040,
                                   thick=0.010, curl=0.018, cup=0.006, nu=5,
                                   phase=0.5 / 6.0, base_r=0.070)]),
        # 果实：种子盘比花心大一圈，边缘轻微扇贝
        "fruit": dict(r=0.120, h=0.058, segs=16, scallop=0.035,
                      color=(0.36, 0.25, 0.15), back_color=(0.33, 0.46, 0.26),
                      head_tilt=7.0, head_az=305.0),
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
        if name in ("flower", "fruit"):
            nod(obj, cfg[name].get("head_tilt", 0.0), cfg[name].get("head_az", 0.0))
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
