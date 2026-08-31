import { NextRequest, NextResponse } from "next/server";
import { authorize, requireUser } from "@/lib/auth";
import { chatCompletion } from "@/lib/ai/client";

/** 用表单当前参数（不必先保存）测试接口连通性：发一条最小问候 */
export async function POST(req: NextRequest) {
  const auth = requireUser(req);
  if ("response" in auth) return auth.response;
  const denied = await authorize(auth.user.username, auth.user.isAdmin, "api:ai-settings:create");
  if (denied) return denied;

  const body = await req.json();
  const cfg = {
    provider: typeof body.provider === "string" ? body.provider : "custom",
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl.trim() : "",
    apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : "",
    model: typeof body.model === "string" ? body.model.trim() : "",
  };
  try {
    const reply = await chatCompletion(cfg, {
      messages: [
        { role: "system", content: "你是连通性测试助手，必须只回复两个字：正常" },
        { role: "user", content: "你好" },
      ],
      temperature: 0,
      // deepseek v4 等带思考模式的模型会先消耗推理 token，设置足够上限避免被截断
      maxTokens: 300,
      timeoutMs: 20_000,
    });
    return NextResponse.json({ ok: true, reply });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "连接失败" }, { status: 400 });
  }
}
