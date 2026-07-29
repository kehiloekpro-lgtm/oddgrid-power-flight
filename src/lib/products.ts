import productsData from "@/data/products.json";

import heroImg from "@/assets/hero.jpg";
import catPowerImg from "@/assets/cat-power.jpg";
import catDronesImg from "@/assets/cat-drones.jpg";
import solarImg from "@/assets/p-solar.jpg";
import inverterImg from "@/assets/p-inverter.jpg";
import fishingDroneImg from "@/assets/p-fishing-drone.jpg";
import miniDroneImg from "@/assets/p-mini-drone.jpg";

export const imageMap: Record<string, string> = {
  hero: heroImg,
  "cat-power": catPowerImg,
  "cat-drones": catDronesImg,
  "p-solar": solarImg,
  "p-inverter": inverterImg,
  "p-fishing-drone": fishingDroneImg,
  "p-mini-drone": miniDroneImg,
};

export type ProductCategory = "power" | "drones";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  subcategory: string;
  price: number;
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

export const powerCategories = [
  "Portable Power Stations",
  "Solar Panels",
  "Inverters",
  "Battery Systems",
  "Solar Kits",
  "Charge Controllers",
  "UPS Systems",
];

export const droneCategories = [
  "Camera Drones",
  "Waterproof Drones",
  "Mapping Drones",
  "Agricultural Drones",
  "Fishing Drones",
  "Drone Accessories",
  "Batteries",
  "Propellers",
];

export const WHATSAPP_URL = "https://wa.me/10000000000";
