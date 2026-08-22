import { getSession } from "@/lib/http";
import { availableCredits } from "@/services/credit.service";
import { embeddingConfigured } from "@/services/embedding.provider";
import GenerateForm from "@/components/dashboard/GenerateForm";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const session = await getSession();
  const creditsRemaining = session ? await availableCredits(session.sub) : null;
  return (
    <GenerateForm hybridActive={embeddingConfigured()} creditsRemaining={creditsRemaining} />
  );
}
