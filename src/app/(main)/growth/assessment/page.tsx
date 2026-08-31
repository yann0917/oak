"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Title, Input, Button, Tag, DatePicker } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import {
  STANDARD_DATA,
  diffMonths,
  fmtAge,
  interp,
  pctLevel,
  sdLevel,
  bandDesc,
  sdBandDesc,
  toPx,
  chartImage,
} from "@/lib/growthStandard";

interface Assessment {
  chartKey: string;
  title: string;
  value: string;
  unit: string;
  level: { lv: string; warn: boolean };
  band: string;
  x: number;
  y: number;
  xNote: string;
  table: string;
  note?: string;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const IMG_W = 1600;
const IMG_H = 1200;
const PLOT = { left: 136, right: 1536, top: 120, bottom: 1098 };

export default function GrowthAssessmentPage() {
  const { currentChild } = useChildren();
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [mdate, setMdate] = useState(todayStr());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [hc, setHc] = useState("");
  const [saving, setSaving] = useState(false);

  // 进入页面时用当前成员档案 + 最近一条身高体重记录预填
  useEffect(() => {
    if (!currentChild) return;
    if (currentChild.birthday) setBirth(currentChild.birthday);
    setGender(currentChild.gender === "male" ? "male" : "female");
    api<any[]>(`/api/growth-records?childId=${currentChild.id}`)
      .then((recs) => {
        const latest = [...recs]
          .filter((r) => r.height != null || r.weight != null)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (latest) {
          setMdate(latest.date);
          if (latest.height != null) setHeight(String(latest.height));
          if (latest.weight != null) setWeight(String(latest.weight));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChild?.id]);

  if (!currentChild) {
    return (
      <p className="text-center py-20 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
        请先在「成员管理」中添加成员
      </p>
    );
  }

  const render = () => {
    if (!birth) {
      return { ageText: "请先填写出生日期", results: [] as Assessment[], notes: [] as string[] };
    }
    const birthDate = new Date(birth + "T00:00:00");
    // 测量日期被清空时按今天处理
    const measDate = mdate ? new Date(mdate + "T00:00:00") : new Date();
    if (measDate < birthDate) {
      return { ageText: "测量日期早于出生日期，请检查", results: [] as Assessment[], notes: [] as string[] };
    }
    const mo = diffMonths(birthDate, measDate);
    const years = mo / 12;
    const h = parseFloat(height);
    const w = parseFloat(weight);
    const hcVal = parseFloat(hc);
    const g = gender;
    const results: Assessment[] = [];
    const notes: string[] = [];

    if (mo <= 84) {
      const defs = [
        { key: "hfa", title: "身高 / 身长", unit: "cm", val: h, xname: "月龄" },
        { key: "wfa", title: "体重", unit: "kg", val: w, xname: "月龄" },
        {
          key: "bfa",
          title: "BMI",
          unit: "",
          val: h > 0 && w > 0 ? w / (h / 100) ** 2 : NaN,
          xname: "月龄",
        },
        { key: "hca", title: "头围", unit: "cm", val: mo <= 36 ? hcVal : NaN, xname: "月龄" },
      ];
      for (const d of defs) {
        if (!isFinite(d.val) || d.val <= 0) continue;
        const table = (STANDARD_DATA as any)[`${d.key}_${g}`];
        const all = interp(table, "age", mo, ["P3", "P10", "P25", "P50", "P75", "P90", "P97"]);
        const level = pctLevel(d.val, all);
        const band = bandDesc(d.val, all);
        results.push({
          chartKey: `${d.key}_${g}`,
          title: d.title,
          value: d.val.toFixed(1),
          unit: d.unit,
          level,
          band,
          x: mo,
          y: d.val,
          xNote: `${d.xname} ${mo.toFixed(1)}`,
          table: `${table.name} · ${table.table}（WS/T 423—2022）`,
          note: mo > 81 ? "月龄接近标准上限，按末档插值" : undefined,
        });
      }
      if (hcVal > 0 && mo > 36) notes.push("头围标准仅覆盖 0~36 月龄，已跳过头围图");
    } else {
      notes.push("WS/T 423 百分位曲线覆盖 0~7 岁，超过 7 岁仅展示身高发育等级图（WS/T 612）");
    }

    if (years >= 6.5 && years <= 18.5 && isFinite(h) && h > 0) {
      const table = (STANDARD_DATA as any)[`height_7_18_${g}`];
      const all = interp(table, "age_year", years, ["-2SD", "-1SD", "+1SD", "+2SD"]);
      const level = sdLevel(h, all);
      const band = sdBandDesc(h, all);
      results.push({
        chartKey: `height_7_18_${g}`,
        title: "身高发育等级（7-18岁）",
        value: h.toFixed(1),
        unit: "cm",
        level,
        band,
        x: years,
        y: h,
        xNote: `年龄 ${years.toFixed(1)} 岁`,
        table: `${table.name} · ${table.table.replace("WS/T 612-2018 ", "")}（WS/T 612—2018）`,
      });
    } else if (mo > 84 && years > 18.5) {
      notes.push("年龄超过 18 岁，超出两份标准覆盖范围");
    }

    return { ageText: `测量时月龄 ${mo.toFixed(1)} 个月（${fmtAge(mo)}）`, results, notes };
  };

  const { ageText, results, notes } = render();

  /** 把所有测评图纵向合成一张完整长图（含孩子信息与评价汇总头） */
  const saveCombined = async () => {
    if (!results.length) return;
    setSaving(true);
    try {
      const imgs = await Promise.all(
        results.map(
          (r) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const im = new Image();
              im.onload = () => resolve(im);
              im.onerror = reject;
              im.src = chartImage(r.chartKey);
            })
        )
      );

      const pad = 48;
      const headerH = 148 + results.length * 38;
      const footerH = 56;
      const c = document.createElement("canvas");
      c.width = IMG_W;
      c.height = headerH + IMG_H * results.length + footerH;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      const accent =
        getComputedStyle(document.body).getPropertyValue("--animal-primary-color").trim() || "#37b3a9";
      const okColor = getComputedStyle(document.body).getPropertyValue("--animal-success-color").trim() || "#5ba946";
      const warnColor = getComputedStyle(document.body).getPropertyValue("--animal-error-color").trim() || "#e05d5d";

      // 暖色底 + 信息头
      ctx.fillStyle = "#f8f8f0";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#794f27";
      ctx.font = "700 42px -apple-system, PingFang SC, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("儿童生长标准测评", pad, 66);
      ctx.font = "400 24px -apple-system, PingFang SC, sans-serif";
      ctx.fillStyle = "#a18b6f";
      const info = `${currentChild.name} · ${gender === "male" ? "男" : "女"} · 出生 ${birth} · 测量 ${mdate || todayStr()} · ${ageText}`;
      ctx.fillText(info, pad, 106);
      results.forEach((r, i) => {
        const y = 148 + i * 38;
        ctx.fillStyle = r.level.warn ? warnColor : okColor;
        ctx.beginPath();
        ctx.arc(pad + 8, y - 8, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#794f27";
        ctx.font = "500 24px -apple-system, PingFang SC, sans-serif";
        const unit = r.unit ? ` ${r.unit}` : "";
        const bandLabel = r.band.startsWith("P") || r.band.startsWith("低于") || r.band.startsWith("≥")
          ? `百分位 ${r.band}`
          : `SD 区间 ${r.band}`;
        ctx.fillText(`${r.title} ${r.value}${unit} — ${r.level.lv}（${bandLabel}）`, pad + 28, y);
      });

      // 逐张绘制参考图 + 准线 + 定位点 + 标签
      imgs.forEach((img, i) => {
        const r = results[i];
        const top = headerH + i * IMG_H;
        // 参考图为白底，用 multiply 混合让其融入暖色画布：白色像素变为底色，曲线颜色基本不变
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.drawImage(img, 0, top, IMG_W, IMG_H);
        ctx.restore();
        const pos = toPx(r.chartKey, r.x, r.y);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pos.px, top + PLOT.top);
        ctx.lineTo(pos.px, top + PLOT.bottom);
        ctx.moveTo(PLOT.left, top + pos.py);
        ctx.lineTo(PLOT.right, top + pos.py);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pos.px, top + pos.py, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        const label = `${r.title} ${r.value}${r.unit ? " " + r.unit : ""} ${r.level.lv}`;
        ctx.font = "600 26px -apple-system, PingFang SC, sans-serif";
        const tw = ctx.measureText(label).width;
        const bx = Math.min(Math.max(pos.px + 18, PLOT.left), PLOT.right - tw - 28);
        const by = top + Math.max(pos.py - 44, PLOT.top + 6);
        ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bx, by, tw + 24, 38, 8);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, tw + 24, 38);
        }
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + 12, by + 20);
        ctx.textBaseline = "alphabetic";
      });

      // 页脚
      ctx.fillStyle = "#a18b6f";
      ctx.font = "400 22px -apple-system, PingFang SC, sans-serif";
      ctx.fillText(
        "标准来源：WS/T 423—2022《7 岁以下儿童生长标准》 · WS/T 612—2018《7 岁～18岁儿童青少年身高发育等级评价》",
        pad,
        c.height - 22
      );

      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `生长测评_${currentChild.name}_${mdate}.png`;
      a.click();
    } catch {
      alert("图片加载失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Title size="middle" color="lime-green">
            儿童生长标准测评
          </Title>
          <p className="text-sm mt-3" style={{ color: "var(--animal-text-color-secondary)" }}>
            {currentChild.name} · 输入出生日期与测量值，自动在国标参考图上定位并给出等级评价
          </p>
        </div>
        <Link href="/growth">
          <Button type="default" size="small">
            返回成长记录
          </Button>
        </Link>
      </div>

      <Card>
        <p className="text-sm font-bold mb-4">孩子信息与测量值</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              出生日期
            </span>
            <DatePicker
              value={birth || null}
              onChange={(v) => setBirth(typeof v === "string" ? v : "")}
              placeholder="选择出生日期"
              allowClear
              disabledDate={(d) => d > new Date()}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              性别
            </span>
            <div className="flex gap-2">
              <Button
                type={gender === "male" ? "primary" : "default"}
                size="small"
                onClick={() => setGender("male")}
              >
                男
              </Button>
              <Button
                type={gender === "female" ? "primary" : "default"}
                size="small"
                onClick={() => setGender("female")}
              >
                女
              </Button>
            </div>
          </div>
          <div>
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              测量日期
            </span>
            <DatePicker
              value={mdate || null}
              onChange={(v) => setMdate(typeof v === "string" ? v : "")}
              placeholder="选择测量日期"
              allowClear
              disabledDate={(d) => d > new Date()}
              style={{ width: "100%" }}
            />
          </div>
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              身高 / 身长 (cm)
            </span>
            <Input
              type="number"
              step="0.1"
              min="1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="如 93"
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              体重 (kg)
            </span>
            <Input
              type="number"
              step="0.1"
              min="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="如 13.5"
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={{ color: "var(--animal-text-color-secondary)" }}>
              头围 (cm，选填)
            </span>
            <Input
              type="number"
              step="0.1"
              min="1"
              value={hc}
              onChange={(e) => setHc(e.target.value)}
              placeholder="0~3 岁可选"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Tag color="app-teal" variant="soft">
            {ageText}
          </Tag>
        </div>
      </Card>

      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <p className="text-sm font-bold">等级评价汇总</p>
            <Button type="primary" size="small" loading={saving} onClick={saveCombined}>
              保存为图片
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {results.map((r) => (
              <Card key={r.chartKey}>
                <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {r.title}
                </p>
                <p className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="text-xl font-extrabold">
                    {r.value}
                    {r.unit && <span className="text-xs font-medium"> {r.unit}</span>}
                  </span>
                  <Tag color={r.level.warn ? "app-red" : "app-green"} size="small">
                    {r.level.lv}
                  </Tag>
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {r.band.startsWith("P") || r.band.startsWith("低于") || r.band.startsWith("≥")
                    ? `百分位 ${r.band}`
                    : `SD 区间 ${r.band}`}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {results.map((r) => (
          <ChartCard key={r.chartKey} r={r} />
        ))}
        {results.length === 0 && (
          <Card type="dashed">
            <p className="text-sm py-6 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
              请填写出生日期，并至少填写一项测量值（身高 / 体重）
            </p>
          </Card>
        )}
        {notes.map((n) => (
          <Card key={n} type="dashed">
            <p className="text-sm py-6 text-center" style={{ color: "var(--animal-text-color-secondary)" }}>
              {n}
            </p>
          </Card>
        ))}
      </div>

      <p className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
        标准来源：WS/T 423—2022《7 岁以下儿童生长标准》 · WS/T 612—2018《7 岁～18岁儿童青少年身高发育等级评价》。评价按
        WS/T 423 表 1（P3/P25/P75/P97 五级）或 WS/T 612（±1SD/±2SD 五级）执行。
      </p>
    </div>
  );
}

function ChartCard({ r }: { r: Assessment }) {
  const pos = toPx(r.chartKey, r.x, r.y);

  return (
    <Card>
      <div className="mb-3">
        <p className="text-sm font-bold">
          {r.title} · {r.value} {r.unit}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
          评价：<b style={{ color: r.level.warn ? "var(--animal-error-color)" : "var(--animal-success-color)" }}>{r.level.lv}</b>
          {r.band ? ` · 区间 ${r.band}` : ""} · {r.table}
          {r.note ? ` · ${r.note}` : ""}
        </p>
      </div>
      <div className="relative select-none">
        <img
          src={chartImage(r.chartKey)}
          alt={`${r.title}参考图`}
          className="w-full h-auto rounded-2xl block"
          draggable={false}
        />
        <div
          className="g-cross-v"
          style={{ left: `${pos.leftPct}%`, top: `${pos.vLine.top}%`, height: `${pos.vLine.height}%` }}
        />
        <div
          className="g-cross-h"
          style={{ top: `${pos.topPct}%`, left: `${pos.hLine.left}%`, width: `${pos.hLine.width}%` }}
        />
        <div className="g-marker" style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }} />
      </div>
    </Card>
  );
}
