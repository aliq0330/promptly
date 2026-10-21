import { Suspense } from "react";
import { CategoryView } from "@/features/categories/category-view";

export default function CategoryLocalPage() {
  return (
    <Suspense fallback={null}>
      <CategoryView />
    </Suspense>
  );
}
