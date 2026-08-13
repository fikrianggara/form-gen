import FormRenderer from "@/components/forms/FormRenderer";

export default function FillPage({ params }: { params: { slug: string } }) {
  return <FormRenderer slug={params.slug} />;
}
