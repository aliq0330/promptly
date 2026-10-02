import { supabase } from "./client";
import { isContentTypeId, type TaxonomyDbCategory, type TaxonomyDbSubcategory } from "@/lib/content-taxonomy";

interface CategoryRow {
  id: string;
  content_type: string;
  slug: string;
  name_en: string;
  name_tr: string;
  icon: string | null;
  description_en: string | null;
  description_tr: string | null;
  sort_order: number;
  is_active: boolean;
}
interface SubcategoryRow {
  category_id: string;
  slug: string;
  name_en: string;
  name_tr: string;
  description_en: string | null;
  description_tr: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * The live content taxonomy (`taxonomy_categories` / `taxonomy_subcategories`,
 * public read). Returns `null` when the tables are missing/unreachable so the
 * caller keeps the bundled seed — never an error the user sees.
 */
export async function fetchTaxonomy(): Promise<{ categories: TaxonomyDbCategory[]; subcategories: TaxonomyDbSubcategory[] } | null> {
  try {
    const [cats, subs] = await Promise.all([
      supabase
        .from("taxonomy_categories")
        .select("id, content_type, slug, name_en, name_tr, icon, description_en, description_tr, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .limit(500),
      supabase
        .from("taxonomy_subcategories")
        .select("category_id, slug, name_en, name_tr, description_en, description_tr, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .limit(5000),
    ]);
    if (cats.error || subs.error || !cats.data || cats.data.length === 0) return null;
    const categories = (cats.data as CategoryRow[])
      .filter((row) => isContentTypeId(row.content_type))
      .map(
        (row): TaxonomyDbCategory => ({
          dbId: row.id,
          contentType: row.content_type as TaxonomyDbCategory["contentType"],
          slug: row.slug,
          nameEn: row.name_en,
          nameTr: row.name_tr,
          icon: row.icon,
          descriptionEn: row.description_en,
          descriptionTr: row.description_tr,
          sortOrder: row.sort_order,
          isActive: row.is_active,
        }),
      );
    const subcategories = ((subs.data ?? []) as SubcategoryRow[]).map(
      (row): TaxonomyDbSubcategory => ({
        categoryDbId: row.category_id,
        slug: row.slug,
        nameEn: row.name_en,
        nameTr: row.name_tr,
        descriptionEn: row.description_en,
        descriptionTr: row.description_tr,
        sortOrder: row.sort_order,
        isActive: row.is_active,
      }),
    );
    return { categories, subcategories };
  } catch {
    return null;
  }
}
