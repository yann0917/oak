import { redirect } from "next/navigation";

/** 旧「学费记录」路径：重定向到账单页 */
export default function FeesPage() {
  redirect("/bills");
}
