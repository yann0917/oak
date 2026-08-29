"use client";

import { useState } from "react";
import { Button, Image } from "animal-island-ui";
import { uploadFiles } from "@/lib/api";

export function PhotoUploader({
  photos,
  onChange,
  multiple = true,
}: {
  photos: string[];
  onChange: (paths: string[]) => void;
  multiple?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const paths = await uploadFiles(files);
      onChange(multiple ? [...photos, ...paths] : paths.slice(0, 1));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-start">
        {photos.map((p) => (
          <div key={p} className="flex flex-col items-center gap-1">
            <Image src={p} alt="照片" width={88} height={88} preview={false} />
            <Button
              size="small"
              danger
              type="text"
              onClick={() => onChange(photos.filter((x) => x !== p))}
            >
              移除
            </Button>
          </div>
        ))}
        {/* 库没有 Upload 组件，用 token 样式化的 label 承载文件选择 */}
        <label
          className="inline-flex items-center justify-center cursor-pointer"
          style={{
            minWidth: 120,
            height: 88,
            borderRadius: 24,
            border: "2px dashed var(--animal-primary-color)",
            color: "var(--animal-primary-color)",
            background: "var(--animal-primary-color-bg)",
            fontWeight: 700,
            transition: "all var(--animal-motion-duration-base) var(--animal-motion-ease)",
          }}
        >
          {uploading ? "上传中…" : "上传照片"}
          <input
            type="file"
            accept="image/*"
            multiple={multiple}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>
    </div>
  );
}
