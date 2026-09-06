/**
 * queryRecipes 工具冒烟测试（临时脚本，可随时删除）。
 * 运行：npx tsx scripts/recipes-tool-smoke.ts
 */
import { buildAgentTools } from "@/lib/ai-agent/tools";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : "");
  }
}

async function main() {
  const { tools } = buildAgentTools(1);
  const anyTool = tools as any;

  // 1. 关键词搜索：返回完整做法，菜名命中排前
  const kw = (await anyTool.queryRecipes.execute({ keyword: "蛋炒饭" })) as any;
  check("关键词搜索有结果", Array.isArray(kw?.rows) && kw.rows.length > 0, kw);
  check("结果含完整做法（content）", kw.rows[0]?.content?.includes("配料") || kw.rows[0]?.content?.includes("步骤"), kw.rows[0]?.content?.slice(0, 80));
  const firstIsNameHit = kw.rows[0]?.name?.includes("蛋炒饭");
  check("菜名命中排在首位", firstIsNameHit === true, kw.rows.map((r: any) => r.name));

  // 2. 分类浏览：只给菜名清单 + 提示语
  const browse = (await anyTool.queryRecipes.execute({ category: "汤" })) as any;
  check("分类浏览有结果", Array.isArray(browse?.rows) && browse.rows.length > 0, browse);
  check("分类浏览不含正文", browse.rows.every((r: any) => r.content === undefined), browse.rows[0]);
  check("分类浏览带清单提示", typeof browse?.note === "string" && browse.note.includes("keyword"), browse?.note);

  // 3. 空结果：返回可用分类提示
  const empty = (await anyTool.queryRecipes.execute({ keyword: "不存在的菜xyz", category: "汤" })) as any;
  check("空结果带分类提示", empty?.rows?.length === 0 && String(empty?.note).includes("现有分类"), empty);

  // 4. HowToCook 源：回锅肉（荤菜）整篇返回，来源字段正确
  const htc = (await anyTool.queryRecipes.execute({ keyword: "回锅肉", source: "howtocook" })) as any;
  check("HowToCook 源有结果", Array.isArray(htc?.rows) && htc.rows.length > 0, htc);
  check("HowToCook 来源字段=howtocook", htc.rows.every((r: any) => r.source === "howtocook"), htc.rows[0]);
  check("HowToCook 分类映射为中文", htc.rows.some((r: any) => r.category === "荤菜"), htc.rows.map((r: any) => r.category));
  check("HowToCook 图片已本地化", htc.rows.some((r: any) => r.content?.includes("/uploads/recipes/howtocook/")), htc.rows[0]?.content?.slice(0, 100));

  // 5. 来源过滤：cooklikehoc 下搜可乐不应混入 HowToCook
  const mixed = (await anyTool.queryRecipes.execute({ keyword: "肉", source: "cooklikehoc" })) as any;
  check("按来源过滤生效", mixed?.rows?.length > 0 && mixed.rows.every((r: any) => r.source === "cooklikehoc"), mixed?.rows?.length);

  // 6. 工具描述注册
  check("工具描述已注册", typeof anyTool.queryRecipes?.description === "string" && anyTool.queryRecipes.description.includes("食谱"), anyTool.queryRecipes?.description);
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(() => {
    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
