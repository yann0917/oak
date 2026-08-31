"use client";

import { useEffect, useState } from "react";
import { Card, Tag, Title } from "animal-island-ui";
import { api } from "@/lib/api";
import { useChildren } from "@/lib/childContext";
import { CrudSection, ItemActions, Chip, PhotoGrid, parseJsonArray } from "@/components/CrudSection";
import { CERT_CATEGORIES, CERT_CATEGORY_COLOR } from "@/lib/certs";

function daysTo(expire: string): number | null {
  if (!expire) return null;
  const t = new Date(`${expire}T00:00:00`).getTime();
  const now = new Date(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}T00:00:00`).getTime();
  return Math.round((t - now) / 86_400_000);
}

export default function CertsPage() {
  const { children } = useChildren();
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = () =>
      api(`/api/cert-archives?page=1&pageSize=200`)
        .then((d: any) => {
          setRecords(Array.isArray(d) ? d : d.list ?? []);
          setTotal(Array.isArray(d) ? 0 : d.total ?? 0);
        })
        .catch(() => {});
    load();
  }, []);

  const childName = (id: any) => {
    const c = children.find((x) => x.id === id);
    return c ? c.nickname || c.name : "";
  };

  const lateCount = records.filter((r) => {
    const d = daysTo(r.expireDate);
    return d != null && d >= 0 && d <= 30;
  }).length;
  const expiredCount = records.filter((r) => {
    const d = daysTo(r.expireDate);
    return d != null && d < 0;
  }).length;

  return (
    <div>
      <Title size="middle" color="yellow-green">
        卡证档案
      </Title>
      <p className="text-sm mt-3 mb-3" style={{ color: "var(--animal-text-color-secondary)" }}>
        集中保管证件、证明、病历、检测单/报告、协议证书等原件照片与关键信息
      </p>
      {records.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Tag size="small" variant="soft" color="app-blue">
            共 {total || records.length} 份
          </Tag>
          {lateCount > 0 && (
            <Tag size="small" variant="soft" color="app-orange">
              {lateCount} 份 30 天内到期
            </Tag>
          )}
          {expiredCount > 0 && (
            <Tag size="small" variant="soft" color="app-red">
              {expiredCount} 份已过期
            </Tag>
          )}
        </div>
      )}
      <CrudSection
        title="档案记录"
        endpoint="/api/cert-archives"
        onDataChange={() =>
          api("/api/cert-archives?page=1&pageSize=200")
            .then((d: any) => {
              setRecords(Array.isArray(d) ? d : d.list ?? []);
              setTotal(Array.isArray(d) ? 0 : d.total ?? 0);
            })
            .catch(() => {})
        }
        fields={[
          { name: "category", label: "分类", type: "select", options: CERT_CATEGORIES, defaultValue: "证件" },
          { name: "title", label: "名称", required: true, placeholder: "如：上海市居住证 / 疫苗接种证明" },
          { name: "number", label: "证号/编号" },
          { name: "issuer", label: "签发/出具单位" },
          { name: "issueDate", label: "签发日期", type: "date" },
          { name: "expireDate", label: "到期日期", type: "date" },
          { name: "content", label: "说明 / 识别原文", type: "textarea", placeholder: "图片识别出的关键信息可自动填入" },
          { name: "notes", label: "备注", type: "textarea" },
          { name: "attachments", label: "原件照片", type: "photos" },
        ]}
        renderItem={(item, actions) => {
          const d = daysTo(item.expireDate);
          return (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip color={CERT_CATEGORY_COLOR[item.category] ?? "default"}>{item.category}</Chip>
                <span className="font-bold">{item.title}</span>
                {item.number && (
                  <span className="text-xs" style={{ color: "var(--animal-text-color-secondary)" }}>
                    证号：{item.number}
                  </span>
                )}
                {childName(item.childId) && (
                  <Tag size="small" variant="soft" color="app-blue">
                    {childName(item.childId)}
                  </Tag>
                )}
                {item.expireDate && (
                  <>
                    {d == null ? null : d < 0 ? (
                      <Tag size="small" variant="soft" color="app-red">
                        已过期
                      </Tag>
                    ) : d <= 30 ? (
                      <Tag size="small" variant="soft" color="app-orange">
                        {d} 天后到期
                      </Tag>
                    ) : (
                      <Tag size="small" variant="soft" color="app-green">
                        {d} 天后到期
                      </Tag>
                    )}
                  </>
                )}
                <span className="text-xs ml-auto" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {[item.issuer ? `单位：${item.issuer}` : "", item.issueDate ? `签发 ${item.issueDate}` : "", item.expireDate ? `到期 ${item.expireDate}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <ItemActions {...actions} />
              </div>
              {(item.content || item.notes) && (
                <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "var(--animal-text-color-secondary)" }}>
                  {[item.content, item.notes].filter(Boolean).join("\n")}
                </p>
              )}
              <PhotoGrid photos={parseJsonArray(item.attachments)} />
            </div>
          );
        }}
      />
    </div>
  );
}
