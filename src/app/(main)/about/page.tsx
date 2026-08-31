"use client";

import { Card, Tag, Title } from "animal-island-ui";
import type { TagColor } from "animal-island-ui";

/** DIKW 金字塔四层（默认倒序排列于页面：智慧在上，数据在下） */
const DIKW_LAYERS: { key: string; en: string; desc: string; color: TagColor; width: number }[] = [
  { key: "智慧", en: "Wisdom", desc: "内化为直觉与决策力：规律沉淀于心，无需翻记录也能做出正确选择", color: "app-red", width: 40 },
  { key: "知识", en: "Knowledge", desc: "提炼规律与 SOP：从多次记录中发现因果，形成指导行动的方法论", color: "app-orange", width: 60 },
  { key: "信息", en: "Information", desc: "建立关联与上下文：AI 识图归类，写入账单/健康/卡证/提醒等模块", color: "app-blue", width: 80 },
  { key: "数据", en: "Data", desc: "原始资产：一句话、一张照片，零压力地随手记，一个字都不要憋着", color: "app-green", width: 100 },
];

const FEATURES = [
  "一句话快记",
  "AI 识图归类",
  "账单",
  "卡证档案",
  "健康档案",
  "成长记录",
  "时光相册",
  "提醒中心",
  "错题本/笔记",
  "学习园地",
  "课程表",
  "政策动态",
  "家庭待办",
  "多成员档案",
];

export default function AboutPage() {
  return (
    <div className="space-y-6">
      <Card color="app-teal" pattern="app-blue">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">🌳</div>
          <h1 className="text-3xl font-black">Oak · 我记</h1>
          <p className="mt-2 text-sm opacity-90">
            记录与我有关的一切，让琐事流水，长成参天智慧
          </p>
        </div>
      </Card>

      <Card>
        <Title size="small" color="app-teal">
          Oak 是什么
        </Title>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Oak，英文意为橡树——一颗橡果落进土里，先扎根，再发芽，历经数年长成荫蔽大树。项目取名 Oak，正是这个隐喻：
            <b>每一句快记、每一张凭证照片，都是埋下的橡果；整理、沉淀与思考，让它发芽；最终长成全家人的知识之树</b>。
          </p>
          <p>
            Oak 的中文名是「我记」——<b>记录与我有关的一切</b>。它不止是孩子的成长档案，也是家庭的账单、健康、证件、提醒与方法沉淀：
            家庭成员的一切琐事与重要凭证，都在这里安静地生长。
          </p>
          <p>
            我们的信念很简单：<b>凡事有记录</b>。不追求记“漂亮”，只追求记“全”——记录的门槛越低，越容易坚持；而坚持的记录，终将复利。
          </p>
        </div>
      </Card>

      <Card>
        <Title size="small" color="app-yellow">
          理念：DIKW 模型
        </Title>
        <p className="text-sm mt-2 mb-5" style={{ color: "var(--animal-text-color-secondary)" }}>
          DIKW（Data-Information-Knowledge-Wisdom）是信息管理学的基石模型。Oak 的整个产品结构都围绕它设计：
          底层无压力地收集数据，上层层层提炼，直到内化为智慧。
        </p>
        <div className="flex flex-col items-center gap-2">
          {DIKW_LAYERS.map((l, i) => (
            <div
              key={l.key}
              className="rounded-2xl px-4 py-3 text-center border-2"
              style={{
                width: `${l.width}%`,
                borderColor: "var(--animal-border-color-light)",
                background: "var(--animal-bg-color)",
              }}
            >
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="font-black">{l.key}</span>
                <Tag size="small" variant="soft" color={l.color}>
                  {l.en}
                </Tag>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--animal-text-color-secondary)" }}>
                {l.desc}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-sm space-y-2 leading-relaxed">
          <p>
            <b>数据（Data）→</b> 首页的「一句话快记」：写一句、传张图，先忠实入库，不做任何负担。
          </p>
          <p>
            <b>信息（Information）→</b> AI 识图归类：自动拆解成健康/账单/成长/时光/卡证/提醒等结构化记录，让杂乱的流水有了前因后果。
          </p>
          <p>
            <b>知识（Knowledge）→</b> 周期复盘与家庭洞察（路线图中）：数据量的积累将带来规律——比如“夏季空调费是大头”，提炼成你的家庭 SOP。
          </p>
          <p>
            <b>智慧（Wisdom）→</b> 主动决策副驾驶（愿景中）：结合政策与关键节点，在你需要之前提醒你，把经验内化为直觉。
          </p>
        </div>
      </Card>

      <Card>
        <Title size="small" color="app-green">
          功能一角
        </Title>
        <div className="flex flex-wrap gap-2 mt-3">
          {FEATURES.map((f) => (
            <Tag key={f} variant="soft" color="app-teal">
              {f}
            </Tag>
          ))}
        </div>
      </Card>

      <Card>
        <Title size="small" color="app-blue">
          数据与隐私
        </Title>
        <div className="mt-3 text-sm space-y-2 leading-relaxed" style={{ color: "var(--animal-text-color-secondary)" }}>
          <p>所有数据保存在你自己的 SQLite 数据库（data/ 目录）与上传目录（uploads/）中，不依赖云服务。</p>
          <p>
            大模型（AI 归类）完全可选：启用后由你配置任意 OpenAI 兼容服务（DeepSeek 等），
            图片与文字只发送给你所配置的服务商，密钥保存在本地数据库中。
          </p>
          <p>不想要 AI 也没关系——每条记录都会作为原始流水原样保存，静待整理。</p>
        </div>
      </Card>
    </div>
  );
}
