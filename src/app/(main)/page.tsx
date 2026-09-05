"use client";

import { useEffect, useState } from "react";
import { Tabs } from "animal-island-ui";
import { api } from "@/lib/api";
import QuickNoteInput from "@/components/QuickNoteInput";
import QuickNoteFeed from "@/components/QuickNoteFeed";
import InsightPanel from "@/components/InsightPanel";
import ActivityHeatmap from "@/components/ActivityHeatmap";

export default function DashboardPage() {
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    api("/api/quick-notes?limit=20")
      .then(setNotes)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <ActivityHeatmap />

      <QuickNoteInput childId={null} onSaved={(n) => setNotes((prev) => [n, ...prev])} />

      <Tabs
        items={[
          {
            key: "records",
            label: "最近的记录",
            children: (
              <QuickNoteFeed
                notes={notes}
                onUpdated={(n) => setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)))}
                onDeleted={(id) => setNotes((prev) => prev.filter((x) => x.id !== id))}
              />
            ),
          },
          {
            key: "insights",
            label: "家庭洞察",
            children: <InsightPanel />,
          },
        ]}
      />
    </div>
  );
}
