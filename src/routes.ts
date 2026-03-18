import { Home, ScrollText, Map, Users, type LucideIcon } from 'lucide-react';
import { type VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';

export interface RouteConfig {
  to: string;
  title: string;
  description: string | null;
  icon: LucideIcon;
  includeInMenu: boolean;
  linkProps?: {
    label: string;
    variant?: VariantProps<typeof buttonVariants>['variant'];
  };
}

export const routes: RouteConfig[] = [
  {
    to: '/',
    title: 'Home',
    description: null,
    icon: Home,
    includeInMenu: true,
  },
  {
    to: '/charter',
    title: 'Our Charter',
    description: 'Learn about our mission, governance, and activities for sustainable trail development',
    icon: ScrollText,
    includeInMenu: true,
    linkProps: {
      label: 'View Charter',
      variant: 'madrone-bark',
    },
  },
  {
    to: '/map',
    title: 'Trail Maps',
    description: 'Explore interactive maps of trails in the Ladysmith area with satellite and outdoor views',
    icon: Map,
    includeInMenu: true,
    linkProps: {
      label: 'Explore Maps',
      variant: 'forest-shadow',
    },
  },
  {
    to: '/contact',
    title: 'Contact Us',
    description: 'Contact us to volunteer, share ideas, or learn about upcoming trail projects',
    icon: Users,
    includeInMenu: true,
    linkProps: {
      label: 'Contact Us',
      variant: 'storm-slate',
    },
  },
];

/** Routes shown in the header navigation menu */
export const menuRoutes = routes.filter((r) => r.includeInMenu);

/** Narrowed type for routes that have linkProps */
export type CardRoute = RouteConfig & { linkProps: NonNullable<RouteConfig['linkProps']> };

/** Routes that appear as nav cards on the home page (must have linkProps) */
export const cardRoutes = routes.filter((r): r is CardRoute => r.linkProps != null);
