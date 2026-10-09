import { notFound } from "next/navigation";
import { FormFieldsEditor } from "@/components/admin/form-fields-editor";
import { requireAdmin } from "@/lib/session";
import { getEventById } from "@/server/events";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Registration form" };

export default async function FormFieldsPage({ params }: PageProps<"/admin/events/[id]/form">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();
  return <FormFieldsEditor eventId={event.id} fields={event.formFields} />;
}
