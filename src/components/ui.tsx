'use client';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BriefcaseBusiness,
  Car,
  Coffee,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  House,
  Plane,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Users,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Category } from '@/lib/schema';
import type { ReactNode } from 'react';
import { ZodError } from 'zod';

export const cn = (...values: ClassValue[]) => {
  return twMerge(clsx(values));
};
export const icons: Record<Category['icon'], LucideIcon> = {
  utensils: Utensils,
  shopping: ShoppingBag,
  home: House,
  car: Car,
  plane: Plane,
  heart: Heart,
  users: Users,
  repeat: Repeat2,
  wallet: Wallet,
  briefcase: BriefcaseBusiness,
  gift: Gift,
  coffee: Coffee,
  fuel: Fuel,
  graduation: GraduationCap,
  sparkles: Sparkles,
};
export const CategoryIcon = ({
  category,
  small = false,
}: {
  category?: Category;
  small?: boolean;
}) => {
  const Icon = icons[category?.icon || 'wallet'];
  return (
    <span
      className={cn('category-icon', small && 'small')}
      style={{
        color: category?.color || '#a9aaa8',
        backgroundColor: `${category?.color || '#a9aaa8'}15`,
      }}
    >
      <Icon size={small ? 16 : 20} strokeWidth={1.6} />
    </span>
  );
};
export const Modal = ({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) => {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={cn('modal-content', wide && 'wide')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold tracking-tight">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'mt-2 text-sm text-muted' : 'sr-only'}>
                {description || title}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => {
  return (
    <div className="empty-state">
      <Wallet size={30} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
};
export const ErrorNotice = ({ error }: { error: unknown }) => {
  if (!error) return null;
  return (
    <div className="error-notice" role="alert">
      {error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
        : error instanceof Error
          ? error.message
          : String(error)}
    </div>
  );
};
