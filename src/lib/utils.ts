import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Json } from '@/lib/supabase/database.types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
