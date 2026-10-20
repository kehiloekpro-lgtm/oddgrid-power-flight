import {
  listPublishedProducts,
  listPublicCategories,
  getPublicProductDetails,
  resolvePublicProductImage,
  displaySellingPrice,
  type PublicCategory,
  type PublicSupabaseProduct,
} from "./supabase-products";

export interface FeaturedProduct {
  product: PublicSupabaseProduct;
  categoryName: string;
  image: string | null;
  imageAlt: string;
  price: string;
}

export function selectFeaturedProducts(
  products: PublicSupabaseProduct[],
  categories: PublicCategory[],
  slug: string,
) {
  const root = categories.find((category) => category.is_active && category.slug === slug);
  const ids = new Set(root ? [root.id] : []);
  let previousSize = -1;
  while (previousSize !== ids.size) {
    previousSize = ids.size;
    for (const category of categories) {
      if (category.is_active && category.parent_id && ids.has(category.parent_id))
        ids.add(category.id);
    }
  }
  return products
    .filter(
      (product) =>
        product.status === "active" &&
        product.availability !== "discontinued" &&
        product.category_id &&
        ids.has(product.category_id),
    )
    .slice(0, 4);
}

export async function loadFeaturedProducts() {
  const [products, categories] = await Promise.all([
    listPublishedProducts(),
    listPublicCategories(),
  ]);
  async function section(slug: string): Promise<FeaturedProduct[]> {
    return Promise.all(
      selectFeaturedProducts(products, categories, slug).map(async (product) => {
        let image: string | null = null;
        let imageAlt = product.name;
        try {
          const details = await getPublicProductDetails(product.id);
          const photo = [...details.images]
            .sort(
              (a, b) =>
                Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order,
            )
            .find((candidate) => resolvePublicProductImage(candidate));
          if (photo) {
            image = resolvePublicProductImage(photo);
            imageAlt = photo.alt_text || product.name;
          }
        } catch {
          /* Optional photography must not hide a published product. */
        }
        return {
          product,
          image,
          imageAlt,
          categoryName:
            categories.find((category) => category.id === product.category_id)?.name ?? "",
          price:
            product.sale_type === "rfq"
              ? "Price on request"
              : (displaySellingPrice(product) ?? "Price on request"),
        };
      }),
    );
  }
  const [cooling, power] = await Promise.all([section("sub-zero"), section("back-up-power")]);
  return { cooling, power };
}
