"use client";

import { useEffect, useState } from "react";
import { Title } from "animal-island-ui";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Notification } from "@/lib/toast";
import { NoteForm, type NoteKind } from "@/components/NoteForm";

interface Notebook {
  id: number;
  name: string;
  icon: string;
}

export default function NewNotePage() {
  const sp = useSearchParams();
  const kind: NoteKind = sp.get("kind") === "article" ? "article" : "mistake";
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  useEffect(() => {
    api<Notebook[]>("/api/notebooks")
      .then(setNotebooks)
      .catch((e) => Notification.error(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <Title size="middle" color="app-orange">
        录入错题 / 笔记
      </Title>
      <NoteForm notebooks={notebooks} initial={{ kind }} />
    </div>
  );
}
