declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  export const BarChart3: LucideIcon;
  export const Bell: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const Copy: LucideIcon;
  export const DollarSign: LucideIcon;
  export const Download: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Globe: LucideIcon;
  export const Link2: LucideIcon;
  export const Menu: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Search: LucideIcon;
  export const Shield: LucideIcon;
  export const SlidersHorizontal: LucideIcon;
  export const ShoppingBag: LucideIcon;
  export const Star: LucideIcon;
  export const Tag: LucideIcon;
  export const Ticket: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const UploadCloud: LucideIcon;
  export const Users: LucideIcon;
  export const Wallet: LucideIcon;
  export const X: LucideIcon;
  export const Zap: LucideIcon;
}

declare module "*.png" {
  const src: string;
  export default src;
}
