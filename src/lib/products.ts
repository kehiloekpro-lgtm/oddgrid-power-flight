import productsData from "@/data/products.json";

import heroImg from "@/assets/hero-solar-cooling.jpg";
import catPowerImg from "@/assets/cat-backup-power.jpg";
import catRefrigerationImg from "@/assets/cat-refrigeration.jpg";
import catSolarHvacImg from "@/assets/cat-solar-hvac.jpg";
import inverterImg from "@/assets/p-inverter.jpg";

export const imageMap: Record<string, string> = {
  hero: heroImg,
  "hero-solar-cooling": heroImg,
  "cat-power": catPowerImg,
  "cat-backup-power": catPowerImg,
  "cat-refrigeration": catRefrigerationImg,
  "cat-solar-hvac": catSolarHvacImg,
  "p-inverter": inverterImg,
};

export type ProductCategory = "sub-zero" | "solar-hvac" | "back-up-power" | "hybrid-inverters";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  subcategory: string;
  price: number;
  quoteOnly?: boolean;
  sku: string;
  stock: number;
  images: string[];
  description: string;
  specifications: Record<string, string>;
  features: string[];
}

export const products = productsData as unknown as Product[];

export const resolveImage = (key: string) => imageMap[key] ?? heroImg;

export const productImages = (product: Product) => product.images.map(resolveImage);

export const getProduct = (id: string) => products.find((p) => p.id === id);

export const byCategory = (category: ProductCategory) =>
  products.filter((p) => p.category === category);

export const relatedProducts = (product: Product, limit = 3) =>
  products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, limit);

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);

export const stockLabel = (stock: number) =>
  stock === 0
    ? { label: "Out of stock", tone: "out" as const }
    : stock <= 5
      ? { label: `Low stock · ${stock} left`, tone: "low" as const }
      : { label: "In stock", tone: "in" as const };

export const subZeroCategories = [
  "Solar Refrigerators",
  "Solar Freezers",
  "Portable Solar Coolers",
];

export const solarHvacCategories = ["Portable Solar Air-Cons"];

export const backupPowerCategories = ["Portable Power Stations"];

export const hybridInverterCategories = ["Hybrid Inverters"];

export const WHATSAPP_URL = "https://wa.me/10000000000";
