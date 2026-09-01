"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Card, Input, Tabs, Title } from "animal-island-ui";
import { Notification } from "@/lib/toast";
import { api } from "@/lib/api";
import AiSettingsCard from "@/components/AiSettingsCard";

export default function SettingsPage() {
  const [tab, setTab] = useState("profile");

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    api<{ username: string; displayName: string }>("/api/auth/me")
      .then((u) => {
        setUsername(u.username);
        setDisplayName(u.displayName ?? "");
      })
      .catch(() => {});
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await api("/api/auth/me", { method: "PUT", body: JSON.stringify({ displayName }) });
      Notification.success("个人信息已保存");
    } catch (err: any) {
      Notification.error(err.message || "保存失败");
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      Notification.warning("两次输入的新密码不一致");
      return;
    }
    setPwdSaving(true);
    try {
      await api("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      Notification.success("密码修改成功");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      Notification.error(err.message || "修改失败");
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div>
      <Title size="middle" color="app-teal">
        设置
      </Title>
      <p className="text-sm mt-3 mb-5" style={{ color: "var(--animal-text-color-secondary)" }}>
        管理账号信息与大模型配置
      </p>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "profile",
            label: "个人信息",
            children: (
              <div className="space-y-6">
                <Card>
                  <h3 className="font-bold mb-4">昵称</h3>
                  <form onSubmit={saveProfile} className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        用户名（不可修改）
                      </label>
                      <Input value={username} disabled />
                    </div>
                    <div>
                      <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        昵称
                      </label>
                      <Input
                        placeholder="如：爸爸 / 妈妈"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        allowClear
                      />
                    </div>
                    <Button type="primary" htmlType="submit" loading={profileSaving}>
                      保存
                    </Button>
                  </form>
                </Card>

                <Card>
                  <h3 className="font-bold mb-4">修改密码</h3>
                  <form onSubmit={savePassword} className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        原密码
                      </label>
                      <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        新密码（至少 6 位）
                      </label>
                      <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                        确认新密码
                      </label>
                      <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                    <Button type="primary" htmlType="submit" loading={pwdSaving}>
                      修改密码
                    </Button>
                  </form>
                </Card>
              </div>
            ),
          },
          {
            key: "ai",
            label: "AI 大模型",
            children: <AiSettingsCard />,
          },
        ]}
      />
    </div>
  );
}
