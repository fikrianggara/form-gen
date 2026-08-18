import type { Metadata } from "next";
import { ApiAccessRequestForm } from "@/components/portal/ApiAccessRequestForm";

export const metadata: Metadata = {
  title: "Request API Access — FormGen",
  description: "Request a public API key for the FormGen questionnaire service.",
};

/** Public self-serve portal: request API access (TKT-035). */
export default function PortalPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto mb-8 max-w-xl text-center">
        <h1 className="text-2xl font-bold text-gray-900">FormGen Public API</h1>
        <p className="mt-2 text-sm text-gray-600">
          Integrate questionnaire data into your systems. Submit a request and
          an administrator will approve your API key.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Need the docs? See the developer guide after approval.
        </p>
      </div>
      <ApiAccessRequestForm />
    </main>
  );
}
