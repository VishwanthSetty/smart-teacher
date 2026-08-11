import {
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Library,
  ListTree,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { Role } from '@smart-teacher/shared-types';

export interface NavItem {
  label: string;
  // Some routes read differently per role while retaining one canonical href entry.
  labelByRole?: Partial<Record<Role, string>>;
  href: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

// A student's home is their subject grid, not the stat dashboard — see dashboard/page.tsx.
// Kept beside NAV_ITEMS so the redirect target and the nav link cannot drift apart.
export const STUDENT_HOME = '/dashboard/videos';

// Presentation only — this decides what a role is *shown*, never what it may *do*.
// Each page re-checks the actor's role, and the API is the real authorization boundary;
// hiding a link here would be worthless on its own.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: [Role.SUPER_ADMIN, Role.SCHOOL_ADMIN, Role.TEACHER],
  },
  { label: 'Schools', href: '/dashboard/schools', icon: Building2, roles: [Role.SUPER_ADMIN] },
  {
    label: 'Content Library',
    href: '/dashboard/content-library',
    icon: Library,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'Grade Levels & Subjects',
    href: '/dashboard/taxonomy',
    icon: Layers,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'Curriculum',
    href: '/dashboard/curriculum',
    icon: ListTree,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'School Entitlements',
    href: '/dashboard/entitlements',
    icon: ShieldCheck,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'Platform Settings',
    href: '/dashboard/platform-settings',
    icon: SlidersHorizontal,
    roles: [Role.SUPER_ADMIN],
  },
  {
    label: 'Students',
    href: '/dashboard/students',
    icon: GraduationCap,
    roles: [Role.SCHOOL_ADMIN, Role.TEACHER],
  },
  { label: 'Teachers', href: '/dashboard/teachers', icon: Users, roles: [Role.SCHOOL_ADMIN] },
  {
    label: 'Classes & Sections',
    href: '/dashboard/classes',
    icon: BookOpen,
    roles: [Role.SCHOOL_ADMIN, Role.TEACHER],
  },
  {
    label: 'Timetable',
    href: '/dashboard/timetable',
    icon: CalendarDays,
    roles: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT],
  },
  {
    label: 'My Subjects',
    labelByRole: {
      [Role.SCHOOL_ADMIN]: 'Library',
      [Role.TEACHER]: 'Library',
    },
    href: STUDENT_HOME,
    icon: Video,
    roles: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT],
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    roles: [Role.SCHOOL_ADMIN],
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
    const roleLabel = item.labelByRole?.[role];
    return roleLabel ? { ...item, label: roleLabel } : item;
  });
}

// Single source of truth for the per-route role gate, so a stub page's redirect can
// never drift from the nav item that links to it.
export function canRoleAccess(role: Role, href: string): boolean {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  return item ? item.roles.includes(role) : false;
}
