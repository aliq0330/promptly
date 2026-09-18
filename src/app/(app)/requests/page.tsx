import { RequestList } from "@/features/requests/request-list";
import { mockRequests } from "@/mocks/requests";

export default function RequestsPage() {
  const requests = [...mockRequests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Prompt İstekleri</h1>
      <RequestList requests={requests} />
    </div>
  );
}
