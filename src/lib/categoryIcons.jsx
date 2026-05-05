import {
  IconBook,
  IconBolt,
  IconBus,
  IconCash,
  IconGift,
  IconHome,
  IconPigMoney,
  IconPlane,
  IconShoppingCart,
  IconSparkles,
  IconStethoscope,
  IconToolsKitchen2,
  IconWallet,
} from "@tabler/icons-react";

export const CATEGORY_ICON_KEYS = [
  "spark",
  "house",
  "food",
  "cart",
  "bus",
  "hospital",
  "utility",
  "travel",
  "wallet",
  "salary",
  "gift",
  "savings",
  "study",
];

export const CATEGORY_ICON_LABELS = {
  spark: "기본",
  house: "주거",
  food: "식비",
  cart: "쇼핑",
  bus: "교통",
  hospital: "의료",
  utility: "공과금",
  travel: "여행",
  wallet: "지갑",
  salary: "급여",
  gift: "선물",
  savings: "저축",
  study: "교육",
};

const CATEGORY_ICON_COMPONENTS = {
  spark: IconSparkles,
  house: IconHome,
  food: IconToolsKitchen2,
  cart: IconShoppingCart,
  bus: IconBus,
  hospital: IconStethoscope,
  utility: IconBolt,
  travel: IconPlane,
  wallet: IconWallet,
  salary: IconCash,
  gift: IconGift,
  savings: IconPigMoney,
  study: IconBook,
};

export function getCategoryIconComponent(key) {
  return CATEGORY_ICON_COMPONENTS[key] || IconSparkles;
}

export function CategoryIcon({ category, size = 18, stroke = 1.8 }) {
  const Cmp = getCategoryIconComponent(category?.icon);
  return <Cmp size={size} stroke={stroke} />;
}
