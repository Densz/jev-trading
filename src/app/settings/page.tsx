import { AiSettings } from "@/components/ai-settings";
import { getAiSettings } from "@/server/ai-settings";
export const metadata = { title: "AI settings" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  return <AiSettings initial={await getAiSettings()} />;
}
