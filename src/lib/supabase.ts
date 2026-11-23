import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** When the Supabase keys aren't set yet, the app runs in demo mode with made-up students. */
export const DEMO = !url || !key;
export const supabase: SupabaseClient | null = DEMO ? null : createClient(url!, key!);
