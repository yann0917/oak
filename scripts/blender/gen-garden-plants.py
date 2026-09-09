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
  - 花头参数契约：
      core/core_h/core_segs/core_color  深色扁圆顶花心；back_color 花托（背面）
      core_profile/back_profile         可选：自定义花心/花托的旋转面剖面
                                        （[(rho, 相对高度)]，绣球用上下两个半球拼成整球）
      petal_color                       花瓣色
      core ≤ 0 时省略花心与花托，只留花瓣（绣球小花 / 梅花 / 桂花簇这类「点状小花」）
      head_tilt/head_az                 整个花头相对茎顶的低头角度/方位（0 = 正朝上）
      rings=[dict(count, length, tilt, wid, thick, curl, cup, phase, base_r)]
        count   该圈花瓣数
        length  花瓣长（米，基部到尖端）
        tilt    该圈上抬角（度，0 = 水平、90 = 竖直向上；负值 = 下垂，风铃草用 -76）
        wid     花瓣最大半宽（米）
        thick   花瓣中脊最大厚度（米）
        curl    尖端上卷高度（米，沿长度方向的弧形；tilt 为负时变成「尖端外翻」）
        cup     杯状横截面的边缘抬升（米）
        phase   该圈方位偏移（圈，1.0 = 一整圈；外层 0、内层 0.5/count 就错开半格）
        base_r  花瓣基部距花轴的半径（米，应 < core，压在花心边缘下）
      jitter    每片花瓣的长度/倾角/方位/滚转确定性抖动幅度（0 = 完全规整）
      heads=[dict(...)]  多头模式：一个植株上散布多个花头（梅树的花团、绣球的小花、
        风铃草的垂铃、桂花的黄花簇）。每个 head 的键：
          x/y/dz   相对茎顶的水平/竖直偏移（米）
          elev/az  该花头自身朝向（度，elev = 0 朝上、90 水平朝外）
          scale    该花头整体缩放
          core/core_h/core_profile/back_profile/rings/petal_color/core_color/back_color
                   覆盖共享参数
        （给了 heads 就忽略 head_tilt/head_az——每个头自己带 elev/az）
    叶片参数：count + 每片的 z/az/tilt 数组（度，朝向各异）或 pos 数组（[(x,y,z)]，
      长在枝干上时用，配 foliage_on()）+ blade/wid 叶身尺寸 + shape 轮廓（LEAF_W 宽叶 /
      NARROW_W 窄披针叶）+ petiole/petiole_r/petiole_segs 叶柄 +
      droop/fold/twist/thick 曲面参数 + color + 可选 scale 数组（每片缩放）。
    茎参数：h/r/segs/color/profile/rings + 可选 bend（整株向 +x 弧弯，米）；
      branches=[dict(len, r, segs, profile, rings, elev, az, x, y, z, bend)]
        —— 侧枝 / 竹竿 / 树杈：从 (x,y,z) 出发、方位 az、仰角 elev（度，0 = 竖直向上）、
           长 len 的锥管，bend 让枝梢向生长方向弧弯。配 along()/foliage_on()/heads_on()
           把叶花果精确挂到枝干上（竹子的「多竿」也是用 branches 实现的）。
    果实用 r/h/segs/scallop 描述种子盘，back_color 是背面花托；
      berries=[dict(x, y, dz, r, scale)] 则改成散生小球果（梅子 / 浆果）。
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
# 窄披针形轮廓（竹叶 / 桂花叶这类细长叶）
NARROW_W = [(0.0, 0.22), (0.12, 0.62), (0.30, 0.94), (0.52, 1.0), (0.74, 0.80), (0.90, 0.44), (1.0, 0.05)]


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


def leaf_mid(length, wid, droop, fold, twist, shape=LEAF_W):
    """叶片中面：中脊折痕（边缘低于中脊）+ 叶尖下垂 + 沿长度的渐进扭转。"""
    def f(u, v):
        half = wid * keyed(shape, u)
        z = -droop * length * (u ** 1.7) - fold * abs(v) * half + twist * u * (v * half)
        return (length * u, v * half, z)
    return f


def leaf_thick(thick):
    """叶片厚度：主脉处更厚（(1-|v|)³ 项），向边缘和叶尖收薄。"""
    return lambda u, v: thick * ((1.0 - abs(v) ** 1.5) + 0.55 * (1.0 - abs(v)) ** 3) * (1.0 - 0.25 * u)


# ---------------------------------------------------------------- 参数小工具
def node_profile(nodes, neck=0.88, bulge=1.10, base=1.30, top=0.42, half=0.016):
    """分节剖面（竹竿 / 树杈）：节点处半径鼓一下、节间略收。返回 (profile, rings)。"""
    prof = [(0.0, base)]
    for n in nodes:
        prof += [(n - half, neck), (n, bulge), (n + half, neck)]
    prof.append((1.0, top))
    return prof, [t for t, _ in prof]


def culm(h, r, segs, nodes, **kw):
    """一竿分节竹/茎的 stem 配置（主干用）。"""
    prof, rings = node_profile(nodes, **kw)
    return dict(h=h, r=r, segs=segs, profile=prof, rings=rings)


def limb(length, r, segs, elev, az, x=0.0, y=0.0, z=0.0, bend=0.0,
         nodes=(), base=1.0, top=0.38, **kw):
    """一根侧枝 / 竹竿 / 树杈（stem.branches 的一项）：从 (x,y,z) 出发朝 (az, elev) 生长。"""
    prof, rings = node_profile(list(nodes), base=base, top=top, **kw)
    return dict(len=length, r=r, segs=segs, profile=prof, rings=rings, elev=elev,
                az=az, x=x, y=y, z=z, bend=bend)


def on_sphere(radius, cz, theta_deg, phi_deg, scale=1.0):
    """球面附着点（绣球小花）：θ 从顶点算起、φ 方位角；返回 heads 用的一项。"""
    t, p = math.radians(theta_deg), math.radians(phi_deg)
    return dict(x=radius * math.sin(t) * math.cos(p),
                y=radius * math.sin(t) * math.sin(p),
                dz=cz + radius * math.cos(t),
                elev=theta_deg, az=phi_deg, scale=scale,
                core=0.0)   # 小花只出花瓣，不继承花球的花心


def along(br, t):
    """limb() 轴线上参数 t 处的点（t=1 = 枝梢）——把叶/花/果挂在枝干上用。"""
    a, e = math.radians(br["az"]), math.radians(br["elev"])
    L = br["len"] * t
    b = br.get("bend", 0.0) * (t ** 1.7)
    return (br.get("x", 0.0) + (L * math.sin(e) + b * math.cos(e)) * math.cos(a),
            br.get("y", 0.0) + (L * math.sin(e) + b * math.cos(e)) * math.sin(a),
            br.get("z", 0.0) + L * math.cos(e) - b * math.sin(e))


def foliage_on(branches, picks, **cfg):
    """把叶片挂到枝干上：picks = [(枝号, t, 方位偏移°, 上抬角°, 缩放), ...]。"""
    pos, az, tilt, sc = [], [], [], []
    for bi, t, az_off, ti, s in picks:
        br = branches[bi]
        pos.append(along(br, t))
        az.append(br["az"] + az_off)
        tilt.append(ti)
        sc.append(s)
    cfg.update(count=len(picks), pos=pos, az=az, tilt=tilt, scale=sc)
    return cfg


def heads_on(branches, attach, picks, **cfg):
    """把花头挂到枝干上：picks = [(枝号, t, 仰角偏移°, 缩放), ...]。"""
    heads = []
    for bi, t, elev_off, s in picks:
        br = branches[bi]
        p = along(br, t)
        heads.append(dict(x=p[0], y=p[1], dz=p[2] - attach,
                          elev=max(5.0, br["elev"] + elev_off), az=br["az"], scale=s))
    cfg.update(heads=heads)
    return cfg


# ---------------------------------------------------------------- 构件
def build_stem(cfg):
    """茎：主干 + 可选侧枝（`branches`）。主干沿 z 扫掠，半径按 profile 关键帧变化。

    bend 让主干向 +x 弧弯（风铃草的软茎）；branches 是 limb() 的列表（树杈 / 竹竿）。
    """
    color = mat("stem_m", cfg["color"])
    h, r = cfg["h"], cfg["r"]
    segs = cfg.get("segs", 14)
    ts = cfg.get("rings", [0.0, 0.03, 0.12, 0.30, 0.55, 0.80, 1.0])
    profile = [(t * h, r * keyed(cfg["profile"], t)) for t in ts]
    objs = [tube_mesh("stem", color, segs, profile)]
    bend = cfg.get("bend", 0.0)
    if bend:
        for v in objs[0].data.vertices:
            v.co.x += bend * ((v.co.z / h) ** 1.7)
    for i, br in enumerate(cfg.get("branches", [])):
        L = br["len"]
        bsegs = br.get("segs", max(6, segs - 4))
        bts = br.get("rings", [0.0, 0.35, 0.70, 1.0])
        bprof = [(t * L, br["r"] * keyed(br.get("profile", [(0.0, 1.0), (1.0, 0.38)]), t))
                 for t in bts]
        ob = tube_mesh("branch_%d" % i, color, bsegs, bprof)
        bbend = br.get("bend", 0.0)
        if bbend:
            for v in ob.data.vertices:
                v.co.x += bbend * ((v.co.z / L) ** 1.7)
        nod(ob, br.get("elev", 45.0), br.get("az", 0.0))
        ob.location = (br.get("x", 0.0), br.get("y", 0.0), br.get("z", h * 0.5))
        objs.append(ob)
    return objs


def build_foliage(cfg):
    """叶片：每片 = 细叶柄（管）+ 叶身（透镜壳），从茎轴 / 枝干向外斜上伸展。

    每片的 z/az/tilt/twist 都是独立数组，所以叶子是互生、朝向各异而不是复制粘贴；
    给了 pos（[(x,y,z)]）就长在枝干上而不是主茎上，scale 可逐片缩放。
    """
    color = mat("leaf_m", cfg["color"])
    shape = cfg.get("shape", LEAF_W)
    psegs = cfg.get("petiole_segs", 8)
    objs = []
    pos = cfg.get("pos")
    scales = cfg.get("scale")
    for i in range(cfg["count"]):
        pet = cfg.get("petiole", 0.07)
        pr = cfg.get("petiole_r", 0.0085)
        stalk = tube_mesh("petiole_%d" % i, color, psegs,
                          [(0.0, pr * 1.15), (pet * 0.55, pr * 0.95), (pet, pr * 0.82)],
                          axis="x")
        blade = lens_mesh("blade_%d" % i, color, cfg.get("nu", 7), cfg.get("nv", 4),
                          leaf_mid(cfg["blade"], cfg["wid"], cfg.get("droop", 0.16),
                                   cfg.get("fold", 0.30), cfg.get("twist", 0.35), shape),
                          leaf_thick(cfg.get("thick", 0.014)))
        for v in blade.data.vertices:
            v.co.x += pet
        obj = join_group("leaf_%d" % i, [stalk, blade])
        if pos:
            obj.location = tuple(pos[i])
        else:
            obj.location = (0.0, 0.0, cfg["z"][i])
        if scales:
            s = scales[i]
            obj.scale = (s, s, s)
        obj.rotation_euler = (0.0, -math.radians(cfg["tilt"][i]), math.radians(cfg["az"][i]))
        objs.append(obj)
    return objs


def build_head(cfg, origin_z=0.0, tag=""):
    """单个花头：花心（core>0 时）+ 花托 + 若干圈花瓣，几何建在局部 (0,0,origin_z) 之上。

    返回未合并的对象列表。core ≤ 0 时只出花瓣（绣球小花 / 梅花 / 桂花簇这类点状小花）。
    """
    core_r = cfg["core"]
    core_h = cfg.get("core_h", 0.030)
    segs = cfg.get("core_segs", 12)
    objs = []
    if core_r > 1e-6:
        prof = cfg.get("core_profile")
        if prof is None:
            prof = [(0.0, origin_z + core_h), (0.62, origin_z + core_h * 0.95),
                    (1.0, origin_z)]
        else:
            prof = [(rho, origin_z + hh) for rho, hh in prof]
        objs.append(dome_mesh(tag + "core", mat("core_m", cfg["core_color"]), segs,
                              prof, radius=core_r,
                              scallop=cfg.get("core_scallop", 0.010),
                              close_bottom=True))
        # 花头背面：从花心边缘收向着生点的绿色花托（浅锥，不能太深否则读成酒杯）
        bprof = cfg.get("back_profile")
        if bprof is None:
            bprof = [(0.0, origin_z - core_r * 0.30), (0.55, origin_z - core_r * 0.22),
                     (1.0, origin_z)]
        else:
            bprof = [(rho, origin_z + hh) for rho, hh in bprof]
        objs.append(dome_mesh(tag + "back", mat("back_m", cfg.get("back_color", cfg["core_color"])),
                              segs, bprof, radius=core_r, close_bottom=False))
    petal_mat = mat("petal_m", cfg["petal_color"])
    jitter = cfg.get("jitter", 0.5)
    base_z = origin_z + cfg.get("base_z", 0.002)
    for ri, ring in enumerate(cfg.get("rings", [])):
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
            p = lens_mesh(tag + "petal_%d_%d" % (ri, i), petal_mat,
                          ring.get("nu", 6), ring.get("nv", 4),
                          petal_mid(length, wid, ring.get("curl", 0.030), ring.get("cup", 0.011)),
                          petal_thick(ring.get("thick", 0.013)))
            # 基部落在 (base_r, base_z)，Ry(-tilt) 把 +x 端抬起，Rx(roll) 先自转，再绕 z 排方位
            p.location = (base_r * math.cos(ai), base_r * math.sin(ai), base_z)
            p.rotation_euler = (roll, -math.radians(ti), ai)
            objs.append(p)
    return objs


def build_flower(cfg, attach):
    """花头：单头（默认，几何直接建在着生高度 attach 之上）或 `heads` 多头。

    heads 里每项可以覆盖 core/core_h/rings/petal_color/core_color/back_color，
    并带自己的 x/y/dz/elev/az/scale——梅树的花团、绣球的小花、风铃草的垂铃都用它。
    """
    heads = cfg.get("heads")
    if not heads:
        return build_head(cfg, attach)
    objs = []
    for hi, hd in enumerate(heads):
        sub_cfg = dict(cfg)
        for k in ("core", "core_h", "core_segs", "core_scallop", "core_profile",
                  "back_profile", "rings", "petal_color", "core_color", "back_color"):
            if k in hd:
                sub_cfg[k] = hd[k]
        grp = join_group("head_%d" % hi, build_head(sub_cfg, 0.0, tag="h%d_" % hi))
        grp.location = (hd.get("x", 0.0), hd.get("y", 0.0), attach + hd.get("dz", 0.0))
        grp.rotation_euler = (math.radians(hd.get("roll", 0.0)),
                              math.radians(hd.get("elev", 0.0)),
                              math.radians(hd.get("az", 0.0)))
        s = hd.get("scale", 1.0)
        grp.scale = (s, s, s)
        objs.append(grp)
    return objs


def build_fruit(cfg, attach):
    """果实：默认是带扇贝边的深棕种子盘 + 绿色花托（向日葵）；给了 `berries` 则散生小球果。"""
    segs = cfg.get("segs", 16)
    berries = cfg.get("berries")
    if berries:
        color = mat("fruit_m", cfg["color"])
        objs = []
        for i, b in enumerate(berries):
            r = b["r"]
            objs.append(dome_mesh("berry_%d" % i, color, cfg.get("berry_segs", 8),
                                  [(0.0, r), (0.38, r * 0.93), (0.72, r * 0.68),
                                   (0.92, r * 0.36), (1.0, 0.0)],
                                  radius=r, close_bottom=True))
            objs[-1].location = (b["x"], b["y"], attach + b.get("dz", 0.0))
            s = b.get("scale", 1.0)
            objs[-1].scale = (s, s, s)
        return objs
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


# 梅树 / 桂花树的枝杈：叶、花、果都用 along()/foliage_on()/heads_on() 挂上去
# 主干高度单独提出来，果实的 dz 要减掉它（着生高度 = 茎顶）
_PLUM_H = 0.95
_OSM_H = 0.95
_PLUM_BRANCHES = [
    limb(length=0.48, r=0.011, segs=8, elev=44.0, az=22.0, z=0.55, bend=0.055),
    limb(length=0.42, r=0.010, segs=8, elev=54.0, az=112.0, z=0.63, bend=0.045),
    limb(length=0.44, r=0.010, segs=8, elev=40.0, az=198.0, z=0.57, bend=0.055),
    limb(length=0.38, r=0.009, segs=8, elev=60.0, az=292.0, z=0.68, bend=0.045),
    limb(length=0.34, r=0.008, segs=7, elev=32.0, az=338.0, z=0.72, bend=0.045),
]
_OSM_BRANCHES = [
    limb(length=0.42, r=0.008, segs=7, elev=42.0, az=18.0, z=0.54, bend=0.045),
    limb(length=0.38, r=0.008, segs=7, elev=50.0, az=98.0, z=0.62, bend=0.045),
    limb(length=0.40, r=0.008, segs=7, elev=38.0, az=188.0, z=0.56, bend=0.050),
    limb(length=0.34, r=0.007, segs=7, elev=56.0, az=282.0, z=0.68, bend=0.040),
    limb(length=0.30, r=0.007, segs=6, elev=30.0, az=342.0, z=0.72, bend=0.040),
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

    # ------------------------------------------------ 竹子：三竿分节细竹 + 窄披针叶
    "bamboo": {
        # 三竿：主竿 1.16m 分 6 节，另两竿从地面斜出（elev 3~5°）——竹丛的轮廓
        "stem": dict(color=(0.46, 0.60, 0.32), bend=0.020,
                     **culm(h=1.16, r=0.020, segs=8,
                            nodes=[0.15, 0.30, 0.45, 0.60, 0.75, 0.90]),
                     branches=[
                         # z=0.003：斜竿绕根部旋转后底圈不会沉到地面以下
                         limb(length=0.98, r=0.016, segs=7, elev=3.0, az=205.0,
                              x=0.055, y=-0.030, z=0.003, bend=0.045,
                              nodes=[0.20, 0.40, 0.60, 0.80], bulge=1.08),
                         limb(length=0.82, r=0.014, segs=6, elev=4.5, az=65.0,
                              x=-0.050, y=0.042, z=0.003, bend=0.040,
                              nodes=[0.25, 0.50, 0.75], bulge=1.08),
                     ]),
        # 叶：15 片窄披针形，成 5 簇挂在三竿的中上部，叶尖明显下垂（竹叶的标志）
        "foliage": dict(count=15, color=(0.34, 0.55, 0.27), shape=NARROW_W,
                        blade=0.155, wid=0.023, petiole=0.020, petiole_r=0.0035,
                        petiole_segs=5, droop=0.60, fold=0.18, twist=0.60,
                        thick=0.005, nu=5, nv=4,
                        pos=[(0.022, -0.008, 1.06), (0.022, -0.008, 1.06),
                             (0.022, -0.008, 1.06), (0.022, -0.008, 1.06),
                             (0.020, -0.006, 0.94), (0.020, -0.006, 0.94),
                             (0.020, -0.006, 0.94), (0.020, -0.006, 0.94),
                             (0.100, -0.058, 0.86), (0.100, -0.058, 0.86),
                             (0.100, -0.058, 0.86), (-0.092, 0.080, 0.74),
                             (-0.092, 0.080, 0.74), (-0.092, 0.080, 0.62),
                             (-0.092, 0.080, 0.62)],
                        az=[20.0, 95.0, 170.0, 245.0, 215.0, 290.0, 350.0, 60.0,
                            195.0, 265.0, 330.0, 50.0, 120.0, 185.0, 300.0],
                        tilt=[18.0, 26.0, 12.0, 22.0, 16.0, 28.0, 8.0, 24.0,
                              20.0, 10.0, 30.0, 24.0, 14.0, 20.0, 28.0],
                        scale=[1.05, 0.98, 0.92, 0.88, 1.0, 0.94, 0.86, 0.90,
                               0.96, 0.88, 0.82, 0.92, 0.86, 0.88, 0.80]),
        # 花：细小穗状——3 个小穗（4 片淡黄绿小瓣 + 小米粒花心）
        "flower": dict(core=0.007, core_h=0.016, core_segs=5,
                       core_color=(0.78, 0.78, 0.50), back_color=(0.62, 0.68, 0.40),
                       petal_color=(0.86, 0.86, 0.62), jitter=0.6,
                       heads=[dict(x=0.024, y=0.004, dz=-0.03, elev=8.0, az=25.0),
                              dict(x=0.098, y=-0.052, dz=-0.24, elev=14.0, az=210.0,
                                   scale=0.9),
                              dict(x=-0.090, y=0.078, dz=-0.38, elev=10.0, az=60.0,
                                   scale=0.8)],
                       rings=[dict(count=4, length=0.015, tilt=28.0, wid=0.0038,
                                   thick=0.002, curl=0.004, cup=0.002,
                                   phase=0.0, base_r=0.0035, nu=3, nv=3)]),
        # 果：3 粒极小颖果（米粒状）
        "fruit": dict(color=(0.72, 0.66, 0.42), berry_segs=6,
                      berries=[dict(x=0.024, y=0.004, dz=-0.03, r=0.008),
                               dict(x=0.098, y=-0.052, dz=-0.24, r=0.007),
                               dict(x=-0.090, y=0.078, dz=-0.38, r=0.006)]),
    },

    # ------------------------------------------------ 风铃草：细软茎 + 垂挂钟形花
    "bluebell": {
        # 茎：细软、向 +x 微微弧弯（0.02m），上端渐细
        "stem": dict(h=0.56, r=0.005, segs=7, color=(0.36, 0.52, 0.30), bend=0.020,
                     profile=[(0.0, 1.25), (0.30, 1.05), (0.65, 0.88), (1.0, 0.62)],
                     rings=[0.0, 0.15, 0.30, 0.45, 0.65, 0.82, 1.0]),
        # 叶：3 片基生窄叶，低低地向外拱起再垂下去
        "foliage": dict(count=3, color=(0.36, 0.56, 0.30), shape=NARROW_W,
                        blade=0.155, wid=0.030, petiole=0.048, petiole_r=0.0040,
                        petiole_segs=6, droop=0.40, fold=0.30, twist=0.30,
                        thick=0.007, nu=6, nv=4,
                        z=[0.05, 0.09, 0.13], az=[15.0, 135.0, 255.0],
                        tilt=[52.0, 60.0, 46.0]),
        # 花：5 个钟形花垂挂在上半段——6 片花瓣 tilt=-76° 向下张开、尖端外翻成铃口
        "flower": dict(core=0.009, core_h=0.010, core_segs=6,
                       core_color=(0.40, 0.44, 0.72), back_color=(0.40, 0.52, 0.32),
                       petal_color=(0.50, 0.54, 0.90), jitter=0.5,
                       heads=[dict(x=0.030, y=0.004, dz=-0.02, elev=16.0, az=20.0),
                              dict(x=0.010, y=0.024, dz=-0.09, elev=22.0, az=140.0,
                                   scale=0.95),
                              dict(x=0.030, y=-0.016, dz=-0.16, elev=10.0, az=290.0,
                                   scale=0.88),
                              dict(x=-0.002, y=-0.022, dz=-0.225, elev=24.0, az=210.0,
                                   scale=0.78),
                              dict(x=0.020, y=0.010, dz=-0.285, elev=30.0, az=70.0,
                                   scale=0.68)],
                       rings=[dict(count=6, length=0.046, tilt=-76.0, wid=0.016,
                                   thick=0.005, curl=0.021, cup=0.008,
                                   phase=0.0, base_r=0.005, nu=4, nv=3)]),
        # 果：3 枚小蒴果挂在同样的位置
        "fruit": dict(color=(0.52, 0.60, 0.34), berry_segs=7,
                      berries=[dict(x=0.030, y=0.004, dz=-0.04, r=0.010),
                               dict(x=0.010, y=0.024, dz=-0.11, r=0.009),
                               dict(x=0.030, y=-0.016, dz=-0.18, r=0.008)]),
    },

    # ------------------------------------------------ 郁金香：单朵杯状花 + 两片宽叶
    "tulip": {
        "stem": dict(h=0.45, r=0.007, segs=8, color=(0.38, 0.56, 0.30),
                     profile=[(0.0, 1.25), (0.35, 1.05), (0.70, 0.90), (1.0, 0.72)],
                     rings=[0.0, 0.35, 0.70, 1.0]),
        # 叶：2 片宽长叶，一低一高，向外拱起（郁金香的叶量感）
        "foliage": dict(count=2, color=(0.40, 0.60, 0.32),
                        blade=0.240, wid=0.072, petiole=0.055, petiole_r=0.0070,
                        petiole_segs=7, droop=0.28, fold=0.24, twist=0.30,
                        thick=0.011, nu=8, nv=5,
                        z=[0.10, 0.22], az=[205.0, 25.0], tilt=[42.0, 34.0]),
        # 花：杯状——外圈 6 片近乎竖直（72°）围成杯壁、内圈 3 片错开半格（79°）填缝，
        # 花心是杯底那点深色（子房），花托绿色
        "flower": dict(core=0.015, core_h=0.019, core_segs=8,
                       core_color=(0.24, 0.17, 0.10), back_color=(0.38, 0.55, 0.28),
                       petal_color=(0.95, 0.40, 0.26), jitter=0.35,
                       head_tilt=6.0, head_az=285.0,
                       rings=[dict(count=6, length=0.105, tilt=72.0, wid=0.036,
                                   thick=0.009, curl=0.015, cup=0.014,
                                   phase=0.0, base_r=0.016, nu=5, nv=4),
                              dict(count=3, length=0.082, tilt=79.0, wid=0.032,
                                   thick=0.008, curl=0.012, cup=0.011,
                                   phase=0.5 / 3.0, base_r=0.009, nu=4, nv=4)]),
        # 果：茎顶一枚小蒴果（三棱状圆顶）
        "fruit": dict(r=0.014, h=0.036, segs=10, scallop=0.010,
                      color=(0.48, 0.62, 0.30), back_color=(0.42, 0.55, 0.26),
                      head_tilt=6.0, head_az=285.0),
    },

    # ------------------------------------------------ 梅树：小乔木 + 五瓣花团 + 梅子
    "plum": {
        # 木质主干 0.85m + 5 根外张的枝杈（先端下垂）
        "stem": dict(h=_PLUM_H, r=0.016, segs=10, color=(0.38, 0.31, 0.25),
                     profile=[(0.0, 1.20), (0.22, 1.00), (0.50, 0.82),
                              (0.78, 0.62), (1.0, 0.44)],
                     rings=[0.0, 0.22, 0.50, 0.78, 1.0],
                     branches=_PLUM_BRANCHES),
        # 叶：10 片小卵形叶长在枝的中段（先花后叶，叶量刻意少）
        "foliage": foliage_on(_PLUM_BRANCHES, [
            (0, 0.35, 60.0, 30.0, 1.00), (0, 0.62, -50.0, 24.0, 0.92),
            (1, 0.40, 55.0, 34.0, 0.96), (1, 0.70, -60.0, 26.0, 0.88),
            (2, 0.42, 65.0, 28.0, 1.00), (2, 0.68, -55.0, 32.0, 0.90),
            (3, 0.50, 60.0, 22.0, 0.94), (3, 0.78, -45.0, 30.0, 0.88),
            (4, 0.55, -50.0, 36.0, 0.86), (4, 0.85, 45.0, 26.0, 0.82)],
            color=(0.36, 0.56, 0.30), blade=0.075, wid=0.030,
            petiole=0.028, petiole_r=0.0040, petiole_segs=5,
            droop=0.30, fold=0.28, twist=0.40, thick=0.007, nu=5, nv=4),
        # 花：14 团五瓣花（无花心，五片粉花瓣从一点张开 = 梅花），沿枝梢散布、
        # 朝上张开（elev 比枝干更立，正对 40° 俯角的游戏相机）
        "flower": heads_on(_PLUM_BRANCHES, _PLUM_H, [
            (0, 0.55, -22.0, 1.40), (0, 0.86, -14.0, 1.25),
            (1, 0.50, -20.0, 1.30), (1, 0.78, -12.0, 1.40), (1, 1.00, -24.0, 1.15),
            (2, 0.58, -22.0, 1.35), (2, 0.88, -16.0, 1.20),
            (3, 0.52, -18.0, 1.25), (3, 0.84, -12.0, 1.35),
            (4, 0.60, -20.0, 1.30), (4, 0.95, -14.0, 1.20),
            (4, 0.35, -28.0, 1.10), (0, 0.30, -26.0, 1.10), (2, 0.32, -26.0, 1.10)],
            core=0.0, petal_color=(0.98, 0.72, 0.84), jitter=0.6,
            rings=[dict(count=5, length=0.045, tilt=14.0, wid=0.020,
                        thick=0.005, curl=0.009, cup=0.007,
                        phase=0.0, base_r=0.0024, nu=3, nv=3)]),
        # 果：5 枚青梅散在枝梢
        "fruit": dict(color=(0.60, 0.72, 0.36), berry_segs=8,
                      berries=[dict(x=along(_PLUM_BRANCHES[0], 0.80)[0],
                                    y=along(_PLUM_BRANCHES[0], 0.80)[1],
                                    dz=along(_PLUM_BRANCHES[0], 0.80)[2] - _PLUM_H, r=0.016),
                               dict(x=along(_PLUM_BRANCHES[1], 0.72)[0],
                                    y=along(_PLUM_BRANCHES[1], 0.72)[1],
                                    dz=along(_PLUM_BRANCHES[1], 0.72)[2] - _PLUM_H, r=0.015),
                               dict(x=along(_PLUM_BRANCHES[2], 0.75)[0],
                                    y=along(_PLUM_BRANCHES[2], 0.75)[1],
                                    dz=along(_PLUM_BRANCHES[2], 0.75)[2] - _PLUM_H, r=0.015),
                               dict(x=along(_PLUM_BRANCHES[3], 0.70)[0],
                                    y=along(_PLUM_BRANCHES[3], 0.70)[1],
                                    dz=along(_PLUM_BRANCHES[3], 0.70)[2] - _PLUM_H, r=0.014),
                               dict(x=along(_PLUM_BRANCHES[4], 0.75)[0],
                                    y=along(_PLUM_BRANCHES[4], 0.75)[1],
                                    dz=along(_PLUM_BRANCHES[4], 0.75)[2] - _PLUM_H, r=0.014)]),
    },

    # ------------------------------------------------ 绣球：球形花序（许多小花）+ 宽大叶
    "hydrangea": {
        "stem": dict(h=0.60, r=0.009, segs=8, color=(0.40, 0.56, 0.32),
                     profile=[(0.0, 1.30), (0.30, 1.05), (1.0, 0.78)],
                     rings=[0.0, 0.30, 0.65, 1.0]),
        # 叶：3 片宽大卵形叶（绣球的对生大叶），长在花球下方
        "foliage": dict(count=3, color=(0.36, 0.56, 0.30),
                        blade=0.170, wid=0.110, petiole=0.065, petiole_r=0.0080,
                        petiole_segs=7, droop=0.30, fold=0.26, twist=0.25,
                        thick=0.010, nu=8, nv=5,
                        z=[0.10, 0.20, 0.31], az=[10.0, 140.0, 265.0],
                        tilt=[48.0, 40.0, 55.0]),
        # 花：一个 r=0.07 的完整花球（浅蓝，上下两个半球）+ 13 朵四瓣小花贴在球面上
        "flower": dict(core=0.070, core_h=0.070, core_segs=14, core_scallop=0.010,
                       core_profile=[(0.0, 0.070), (0.42, 0.064), (0.71, 0.050),
                                     (0.91, 0.029), (1.0, 0.0)],
                       back_profile=[(0.0, -0.070), (0.42, -0.064), (0.71, -0.050),
                                     (0.91, -0.029), (1.0, 0.0)],
                       core_color=(0.60, 0.70, 0.90), back_color=(0.54, 0.64, 0.86),
                       petal_color=(0.74, 0.80, 0.95), jitter=0.7,
                       rings=[dict(count=4, length=0.026, tilt=22.0, wid=0.012,
                                   thick=0.0035, curl=0.006, cup=0.005,
                                   phase=0.0, base_r=0.003, nu=3, nv=3)],
                       heads=[dict(x=0.0, y=0.0, dz=0.0, core=0.070, rings=[]),
                              on_sphere(0.070, 0.002, 14.0, 20.0, 1.05),
                              on_sphere(0.070, 0.002, 14.0, 200.0, 1.05),
                              on_sphere(0.070, 0.002, 30.0, 90.0),
                              on_sphere(0.070, 0.002, 30.0, 270.0),
                              on_sphere(0.070, 0.002, 46.0, 340.0),
                              on_sphere(0.070, 0.002, 46.0, 120.0),
                              on_sphere(0.070, 0.002, 46.0, 230.0),
                              on_sphere(0.070, 0.002, 62.0, 30.0, 0.95),
                              on_sphere(0.070, 0.002, 62.0, 150.0, 0.95),
                              on_sphere(0.070, 0.002, 62.0, 265.0, 0.95),
                              on_sphere(0.070, 0.002, 78.0, 60.0, 0.9),
                              on_sphere(0.070, 0.002, 78.0, 200.0, 0.9),
                              on_sphere(0.070, 0.002, 104.0, 40.0, 0.9),
                              on_sphere(0.070, 0.002, 104.0, 190.0, 0.9)]),
        # 果：花球位置缩成一枚小蒴果
        "fruit": dict(color=(0.56, 0.64, 0.40), berry_segs=8,
                      berries=[dict(x=0.0, y=0.0, dz=0.010, r=0.016)]),
    },

    # ------------------------------------------------ 桂花树：小乔木 + 密生小叶 + 碎黄簇
    "osmanthus": {
        "stem": dict(h=_OSM_H, r=0.015, segs=10, color=(0.40, 0.33, 0.26),
                     profile=[(0.0, 1.20), (0.25, 1.00), (0.55, 0.80), (1.0, 0.50)],
                     rings=[0.0, 0.25, 0.55, 1.0],
                     branches=_OSM_BRANCHES),
        # 叶：16 片革质小椭圆叶（桂花叶小而密），沿枝干均匀铺开
        "foliage": foliage_on(_OSM_BRANCHES, [
            (0, 0.30, 55.0, 26.0, 1.00), (0, 0.55, -50.0, 32.0, 0.95),
            (0, 0.78, 45.0, 20.0, 0.88), (1, 0.35, 60.0, 22.0, 0.98),
            (1, 0.60, -55.0, 30.0, 0.92), (1, 0.82, 50.0, 24.0, 0.86),
            (2, 0.32, 65.0, 24.0, 1.00), (2, 0.58, -50.0, 34.0, 0.94),
            (2, 0.80, 45.0, 22.0, 0.86), (3, 0.42, 60.0, 20.0, 0.96),
            (3, 0.68, -55.0, 28.0, 0.88), (3, 0.88, 50.0, 26.0, 0.82),
            (4, 0.45, 50.0, 32.0, 0.92), (4, 0.72, -50.0, 24.0, 0.85),
            (4, 0.92, 55.0, 30.0, 0.80), (1, 0.90, -45.0, 26.0, 0.80)],
            color=(0.28, 0.46, 0.26), blade=0.082, wid=0.030,
            petiole=0.022, petiole_r=0.0032, petiole_segs=5,
            droop=0.24, fold=0.26, twist=0.35, thick=0.006, nu=4, nv=4),
        # 花：9 簇细碎黄花（小米粒圆顶 + 4 片小瓣），长在枝梢的叶腋处
        "flower": heads_on(_OSM_BRANCHES, _OSM_H, [
            (0, 0.88, 4.0, 1.15), (1, 0.90, -4.0, 1.05),
            (2, 0.86, 6.0, 1.10), (3, 0.92, -2.0, 1.00),
            (4, 0.88, 4.0, 0.95), (0, 0.60, 14.0, 0.90),
            (2, 0.55, 12.0, 0.90), (1, 0.70, 10.0, 0.85),
            (3, 0.70, 8.0, 0.85)],
            core=0.022, core_h=0.016, core_segs=5,
            core_color=(0.95, 0.78, 0.30), back_color=(0.72, 0.66, 0.28),
            petal_color=(0.99, 0.88, 0.45), jitter=0.7,
            rings=[dict(count=4, length=0.013, tilt=26.0, wid=0.006,
                        thick=0.002, curl=0.003, cup=0.002,
                        phase=0.0, base_r=0.010, nu=3, nv=3)]),
        # 果：5 粒紫黑色小核果
        "fruit": dict(color=(0.30, 0.22, 0.34), berry_segs=7,
                      berries=[dict(x=along(_OSM_BRANCHES[0], 0.80)[0],
                                    y=along(_OSM_BRANCHES[0], 0.80)[1],
                                    dz=along(_OSM_BRANCHES[0], 0.80)[2] - _OSM_H, r=0.011),
                               dict(x=along(_OSM_BRANCHES[1], 0.82)[0],
                                    y=along(_OSM_BRANCHES[1], 0.82)[1],
                                    dz=along(_OSM_BRANCHES[1], 0.82)[2] - _OSM_H, r=0.010),
                               dict(x=along(_OSM_BRANCHES[2], 0.78)[0],
                                    y=along(_OSM_BRANCHES[2], 0.78)[1],
                                    dz=along(_OSM_BRANCHES[2], 0.78)[2] - _OSM_H, r=0.010),
                               dict(x=along(_OSM_BRANCHES[3], 0.85)[0],
                                    y=along(_OSM_BRANCHES[3], 0.85)[1],
                                    dz=along(_OSM_BRANCHES[3], 0.85)[2] - _OSM_H, r=0.009),
                               dict(x=along(_OSM_BRANCHES[4], 0.80)[0],
                                    y=along(_OSM_BRANCHES[4], 0.80)[1],
                                    dz=along(_OSM_BRANCHES[4], 0.80)[2] - _OSM_H, r=0.009)]),
    },

    # ------------------------------------------------ 雏菊：低矮 + 白色细花瓣 + 黄花心
    "daisy": {
        "stem": dict(h=0.42, r=0.005, segs=7, color=(0.38, 0.56, 0.30),
                     profile=[(0.0, 1.25), (0.35, 1.05), (1.0, 0.72)],
                     rings=[0.0, 0.35, 0.70, 1.0]),
        # 叶：3 片小匙形基生叶，低低地铺开
        "foliage": dict(count=3, color=(0.38, 0.58, 0.30),
                        blade=0.085, wid=0.034, petiole=0.028, petiole_r=0.0032,
                        petiole_segs=5, droop=0.35, fold=0.30, twist=0.30,
                        thick=0.006, nu=5, nv=4,
                        z=[0.045, 0.075, 0.110], az=[0.0, 125.0, 245.0],
                        tilt=[58.0, 52.0, 62.0]),
        # 花：14 片细白花瓣 + 8 片错开半格的内圈，黄色扁花心（占头宽约 36%）
        "flower": dict(core=0.026, core_h=0.015, core_segs=10, core_scallop=0.008,
                       core_color=(0.96, 0.79, 0.20), back_color=(0.55, 0.66, 0.34),
                       petal_color=(0.98, 0.98, 0.95), jitter=0.55,
                       head_tilt=8.0, head_az=300.0,
                       rings=[dict(count=14, length=0.046, tilt=7.0, wid=0.0085,
                                   thick=0.004, curl=0.006, cup=0.003,
                                   phase=0.0, base_r=0.024, nu=5, nv=4),
                              dict(count=8, length=0.032, tilt=15.0, wid=0.0080,
                                   thick=0.0035, curl=0.005, cup=0.003,
                                   phase=0.5 / 8.0, base_r=0.020, nu=4, nv=4)]),
        # 果：小花头缩成一枚小圆盘
        "fruit": dict(r=0.014, h=0.010, segs=10, scallop=0.015,
                      color=(0.62, 0.52, 0.30), back_color=(0.50, 0.62, 0.32),
                      head_tilt=8.0, head_az=300.0),
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
