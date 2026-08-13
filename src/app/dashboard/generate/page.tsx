import { embeddingConfigured } from "@/services/embedding.provider";
import GenerateForm from "@/components/dashboard/GenerateForm";

export const dynamic = "force-dynamic";

export default function GeneratePage() {
  return <GenerateForm hybridActive={embeddingConfigured()} />;
}
