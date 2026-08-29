"use client";

import { Button, Modal } from "animal-island-ui";

export function ConfirmDialog({
  open,
  title,
  content,
  confirmText = "确认",
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  content: string;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      typewriter={false}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" danger={danger} loading={loading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      {content}
    </Modal>
  );
}
