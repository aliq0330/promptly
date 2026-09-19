import { notFound } from "next/navigation";
import { RequestDetailView } from "@/features/requests/request-detail-view";
import { getRequestById, mockRequests } from "@/mocks/requests";

export function generateStaticParams() {
  return mockRequests.map((request) => ({ id: request.id }));
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = getRequestById(id);
  if (!request) notFound();

  return <RequestDetailView request={request} />;
}
