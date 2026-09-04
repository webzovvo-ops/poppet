// ============================================================
// poppet. — Supabase config
//
// Only the PUBLISHABLE key goes here. It is safe to ship in
// client-side code (that's what it's for). NEVER put the
// secret key or a service_role key in frontend code — those
// belong only in a trusted server/edge function, never here.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://quvdlrprqcvoaewqqbwl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Wqryh5egoh0Mq1kFITCOAA_5BPJ_5Ci';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Storage bucket used for assignment/recap images
export const IMAGE_BUCKET = 'poppet-images';

// History auto-delete window, in days
export const HISTORY_RETENTION_DAYS = 3;