import {
  IconBook,
  IconBolt,
  IconBrush,
  IconBus,
  IconCar,
  IconCash,
  IconGift,
  IconHome,
  IconMovie,
  IconPigMoney,
  IconPlane,
  IconRepeat,
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
  "car",
  "entertainment",
  "subscription",
  "hobby",
];

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
  car: IconCar,
  entertainment: IconMovie,
  subscription: IconRepeat,
  hobby: IconBrush,
};

export function getCategoryIconComponent(key) {
  return CATEGORY_ICON_COMPONENTS[key] || IconSparkles;
}

export function CategoryIcon({ category, size = 18, stroke = 1.8 }) {
  const Cmp = getCategoryIconComponent(category?.icon);
  return <Cmp size={size} stroke={stroke} />;
}
