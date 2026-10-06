import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export async function context(request: Request, write = false) {
  const user = await getChatGPTUser();
  if (!user) throw new Error("AUTH");
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new Error("ORIGIN");
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new Error("TYPE");
  }
  if (!env.DB) throw new Error("DB");
  return { db: env.DB, owner: user.userId };
}
export function failure(error: unknown) {
  const m = error instanceof Error ? error.message : "";
  const known: Record<string, [number, string]> = {
    AUTH: [401, "请登录后再读取或保存个人记录"],
    ORIGIN: [403, "请求来源无效"],
    TYPE: [415, "请求格式无效"],
    DB: [503, "账本暂时不可用，请稍后重试"],
    CONFLICT: [409, "记录已在其他窗口更新，请刷新后重试；未保存内容仍在表单中"],
  };
  if (known[m])
    return Response.json({ error: known[m][1] }, { status: known[m][0] });
  console.error("Request failed", m.slice(0, 160));
  return Response.json(
    { error: "操作未完成，请稍后重试；未保存内容已保留" },
    { status: 500 },
  );
}
