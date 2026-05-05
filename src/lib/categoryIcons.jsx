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
  car: "자동차",
  entertainment: "오락",
  subscription: "구독",
  hobby: "취미",
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
