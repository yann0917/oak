"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { MemberFilter, useMemberSelect } from "@/components/MemberFilter";
import { speak, useVoiceMuted } from "@/lib/garden/speech";
import { ExhibitRenderer } from "@/lib/exhibit3d/renderer";
import { buildKindergartenScene } from "@/lib/exhibit3d/scene";

interface School {
  id: number;
  name: string;
  type: string;
  address: string;
  phone: string;
  intro: string;
}

interface Enrollment {
  id: number;
  childId: number;
  schoolId: number;
  stage: string;
  className: string;
  studentNo: string;
  startDate: string;
  endDate: string;
}

interface Teacher {
  id: number;
  name: string;
  subject: string;
  avatar: string;
  schoolId: number | null;
}

/** 点击部位 → 讲解词。用的是库里真实字段，不是写死的文案。 */
function spotSpeech(
  id: string,
  school: School,
  enrollment: Enrollment | null
): string {
  const cls = enrollment?.className ? `${enrollment.className}` : "孩子的班";
  switch (id) {
    case "building":
      return `这是${school.name}的教学楼，${cls}的教室就在这里。`;
    case "wing":
      return "这是多功能厅，下雨天的时候，小朋友们就在这里做游戏、听故事。";
    case "playground":
      return "这是操场，滑梯、秋千和沙坑都在这一片。";
    case "flag":
      return "这是升旗台，每周一早上，大家在这里升国旗。";
    case "gate":
      return school.address
        ? `这是${school.name}的大门，地址在${school.address}。`
        : `这是${school.name}的大门。`;
    default:
      return school.intro || `${school.name}`;
  }
}

export default function ExhibitHall() {
  const { children: kids, member, memberId, setMemberId } = useMemberSelect();
  const [schools, setSchools] = useState<School[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [spot, setSpot] = useState<string>("building");
  const [muted, setMuted] = useVoiceMuted();
  const [glError, setGlError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ExhibitRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ active: boolean; moved: number; x: number; y: number }>({
    active: false,
    moved: 0,
    x: 0,
    y: 0,
  });

  // ---- 拉真实数据：学校 / 就读经历 / 老师 ----
  useEffect(() => {
    if (memberId == null) return;
    let alive = true;
    Promise.all([
      api<School[]>("/api/schools"),
      api<Enrollment[]>(`/api/enrollments?childId=${memberId}`),
      api<Teacher[]>("/api/teachers"),
    ])
      .then(([sc, en, te]) => {
        if (!alive) return;
        setSchools(sc);
        setEnrollments(en);
        setTeachers(te);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [memberId]);

  // 取最近一段就读经历（startDate 最新），它决定展台上放哪所学校、哪个班
  const enrollment = useMemo(() => {
    if (enrollments.length === 0) return null;
    return [...enrollments].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  }, [enrollments]);

  const school = useMemo(() => {
    if (enrollment) {
      const hit = schools.find((s) => s.id === enrollment.schoolId);
      if (hit) return hit;
    }
    return schools[0] ?? null;
  }, [enrollment, schools]);

  const schoolTeachers = useMemo(() => {
    if (!school) return [];
    const linked = teachers.filter((t) => t.schoolId === school.id);
    if (linked.length > 0) return linked;
    // 老数据里老师常常没填「所属学校」（school_id 为 NULL）。这时退回到未归属的老师，
    // 否则用户明明录了老师、展台上却一位都不显示。
    return teachers.filter((t) => t.schoolId == null);
  }, [school, teachers]);

  // ---- 建场景 + 起渲染循环 ----
  useEffect(() => {
    if (!school || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let renderer: ExhibitRenderer | null = null;
    try {
      const built = buildKindergartenScene({
        schoolName: school.name,
        address: school.address,
        className: enrollment?.className,
        stage: enrollment?.stage,
      });
      renderer = new ExhibitRenderer(canvas, built.atlas.canvas);
      renderer.load(built.scene);
      rendererRef.current = renderer;
      setGlError("");
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "无法初始化 3D 展厅");
      return;
    }

    const start = performance.now();
    const loop = () => {
      const r = rendererRef.current;
      if (r) r.render((performance.now() - start) / 1000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, [school, enrollment]);

  // ---- 交互：拖拽环绕、滚轮缩放、点击抬升讲解 ----
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, moved: 0, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    rendererRef.current?.orbit(dx, dy);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = dragRef.current;
      d.active = false;
      // 拖动超过阈值就算环绕，不算点击
      if (d.moved > 6) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = rendererRef.current?.pick(e.clientX, e.clientY, rect);
      if (hit) {
        setSpot(hit);
        if (school) void speak(spotSpeech(hit, school, enrollment), "xiaoxiao");
      }
    },
    [school, enrollment]
  );

  const resetView = useCallback(() => rendererRef.current?.resetView(), []);

  // 滚轮缩放要 preventDefault 拦住页面滚动。React 的 onWheel 是**被动监听**，
  // 在里面调用 preventDefault 会报 "Unable to preventDefault inside passive event listener"，
  // 而且拦不住——结果是滚轮缩放的同时整页也跟着滚。只能手动挂非被动监听。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rendererRef.current?.zoom(e.deltaY > 0 ? 1.08 : 0.925);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (kids.length === 0) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  const speech = school ? spotSpeech(spot, school, enrollment) : "";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Title size="middle" color="app-teal">
          模型展厅
        </Title>
        <MemberFilter value={memberId} onChange={setMemberId} allowAll={false} className="w-44" />
      </div>
      <p className="text-sm mt-3 mb-4" style={{ color: "var(--animal-text-color-secondary)" }}>
        把{member?.name ?? ""}生活里的地方做成可以转着看的小模型——拖动旋转、滚轮缩放、点模型上的部位听讲解
      </p>

      <div className="space-y-3">
        {/* ---------- 3D 展台：模型是这一页的主角，给它整行宽度 ---------- */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-full rounded-3xl touch-none cursor-grab active:cursor-grabbing block"
            style={{ height: "min(66vh, 680px)", background: "#e6e6e0" }}
          />
          {glError && (
            <div
              className="absolute inset-0 rounded-3xl flex items-center justify-center text-center px-8 text-sm"
              style={{ background: "var(--animal-bg-color-secondary)", color: "var(--animal-text-color-secondary)" }}
            >
              {glError}
              <br />
              换用支持 WebGL 2 的浏览器（并开启硬件加速）就能看到立体展品
            </div>
          )}
          {!glError && (
            <>
              <div className="absolute left-3 bottom-3 flex gap-2">
                <Button size="small" onClick={resetView}>
                  复位视角
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    if (muted) {
                      setMuted(false);
                      return;
                    }
                    void speak(speech, "xiaoxiao");
                  }}
                >
                  {muted ? "已静音 · 点此开启" : "听讲解"}
                </Button>
              </div>
              <div
                className="absolute right-3 bottom-3 text-xs px-3 py-1.5 rounded-full hidden sm:block"
                style={{ background: "rgba(255,255,255,0.72)", color: "var(--animal-text-color-secondary)" }}
              >
                拖动旋转 · 滚轮缩放 · 点模型上的部位听讲解
              </div>
            </>
          )}
          {loading && (
            <div
              className="absolute right-3 top-3 text-xs px-2 py-1 rounded-full"
              style={{ background: "var(--animal-bg-color-secondary)", color: "var(--animal-text-color-secondary)" }}
            >
              读取中…
            </div>
          )}
        </div>

        {/* ---------- 说明牌：跟在展台下方，宽屏时分栏 ---------- */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!school ? (
            <Card type="dashed">
              <div
                className="text-center py-10 text-sm md:col-span-2 xl:col-span-3"
                style={{ color: "var(--animal-text-color-secondary)" }}
              >
                还没有学校记录。去「教育经历」里添加一所学校，这里就会长出它的模型。
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="font-black text-base" style={{ color: "var(--animal-text-color)" }}>
                      {school.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {school.type && (
                        <Tag size="small" variant="soft" color="app-teal">
                          {school.type}
                        </Tag>
                      )}
                      {/* 学校类型和就读阶段常常是同一个词（幼儿园/幼儿园），重复就不显示 */}
                      {enrollment?.stage && enrollment.stage !== school.type && (
                        <Tag size="small" variant="soft" color="app-green">
                          {enrollment.stage}
                        </Tag>
                      )}
                      {enrollment?.className && (
                        <Tag size="small" variant="soft" color="app-yellow">
                          {enrollment.className}
                        </Tag>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {school.address && <div>地址：{school.address}</div>}
                  {school.phone && <div>电话：{school.phone}</div>}
                  {enrollment?.studentNo && <div>学号：{enrollment.studentNo}</div>}
                  {enrollment?.startDate && (
                    <div>
                      入园：{enrollment.startDate}
                      {enrollment.endDate ? ` — ${enrollment.endDate}` : " 至今"}
                    </div>
                  )}
                  {school.intro && <div className="pt-1">简介：{school.intro}</div>}
                </div>
              </Card>

              {schoolTeachers.length > 0 && (
                <Card>
                  <div className="font-bold text-sm mb-2" style={{ color: "var(--animal-text-color)" }}>
                    老师
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {schoolTeachers.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        {t.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.avatar}
                            alt={t.name}
                            className="w-9 h-9 rounded-full object-cover"
                            style={{ border: "2px solid var(--animal-border-color-light)" }}
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                            style={{ background: "var(--animal-bg-color-secondary)" }}
                          >
                            {t.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: "var(--animal-text-color)" }}>
                            {t.name}
                          </div>
                          {t.subject && (
                            <div className="text-xs truncate" style={{ color: "var(--animal-text-color-secondary)" }}>
                              {t.subject}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <div className="font-bold text-sm mb-2" style={{ color: "var(--animal-text-color)" }}>
                  讲解
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {speech}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[
                    ["building", "教学楼"],
                    ["wing", "多功能厅"],
                    ["playground", "操场"],
                    ["flag", "升旗台"],
                    ["gate", "大门"],
                  ].map(([id, label]) => (
                    <Tag
                      key={id}
                      size="small"
                      onClick={() => {
                        setSpot(id);
                        if (school) void speak(spotSpeech(id, school, enrollment), "xiaoxiao");
                      }}
                      color={spot === id ? "app-teal" : "default"}
                      variant={spot === id ? "solid" : "soft"}
                    >
                      {label}
                    </Tag>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
