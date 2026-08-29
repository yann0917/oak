"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Divider, Cursor, Footer, Input } from "animal-island-ui";
import item444 from "animal-island-ui/items/item-444.png";
import { api } from "@/lib/api";
import LoginBackground from "@/components/LoginBackground";
import { LoginHamster, HamsterMode } from "@/components/LoginHamster";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hamster, setHamster] = useState<HamsterMode>("idle");
  const dizzyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dizzyTimer.current) clearTimeout(dizzyTimer.current);
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        },
        { redirectOn401: false }
      );
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      setHamster("dizzy");
      if (dizzyTimer.current) clearTimeout(dizzyTimer.current);
      dizzyTimer.current = setTimeout(() => setHamster("idle"), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Cursor>
      <div
        className="min-h-screen flex flex-col relative overflow-hidden"
        style={{ background: "var(--animal-bg-color)" }}
      >
      <LoginBackground />
      <div className="flex-1 flex items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item444.src ?? item444} alt="" width={88} height={88} className="mx-auto" />
            <p className="mt-3 text-sm" style={{ color: "var(--animal-text-color-secondary)" }}>
              记录孩子的每一个成长瞬间
            </p>
          </div>
          <Card>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  用户名
                </label>
                <Input
                  placeholder="默认账号：admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  allowClear
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ color: "var(--animal-text-color-secondary)" }}>
                  密码
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="默认密码：admin123"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setHamster("cover")}
                    onBlur={() => setHamster((m) => (m === "dizzy" ? m : "idle"))}
                    style={{ paddingRight: 64 }}
                  />
                  <div
                    className="absolute pointer-events-none"
                    style={{ right: 2, top: -28, zIndex: 1 }}
                  >
                    <LoginHamster mode={hamster} />
                  </div>
                </div>
              </div>
              {error && (
                <p className="text-sm" style={{ color: "var(--animal-error-color)" }}>
                  {error}
                </p>
              )}
              <Divider type="dashed-teal" />
              <Button type="primary" block htmlType="submit" loading={loading}>
                登录
              </Button>
            </form>
          </Card>
        </div>
      </div>
      <Footer type="sea" />
      </div>
    </Cursor>
  );
}
