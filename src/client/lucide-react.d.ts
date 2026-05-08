declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  export const Link2: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Shield: LucideIcon;
  export const Ticket: LucideIcon;
  export const UploadCloud: LucideIcon;
}
