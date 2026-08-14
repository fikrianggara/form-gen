import FormRenderer from "@/components/forms/FormRenderer";

export default function FillPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { invite?: string };
}) {
  return <FormRenderer slug={params.slug} invite={searchParams?.invite} />;
}
