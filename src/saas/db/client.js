import { createClient } from "@supabase/supabase-js";
import { config } from "../../config.js";

let serviceClient = null;
let anonClient = null;

export function getServiceClient() {
  if (!config.saas.enabled) {
    throw new Error("Supabase client requested while SAAS_MODE is off");
  }
  if (!serviceClient) {
    serviceClient = createClient(
      config.saas.supabaseUrl,
      config.saas.supabaseServiceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return serviceClient;
}

export function getAnonClient() {
  if (!config.saas.enabled) {
    throw new Error("Supabase anon client requested while SAAS_MODE is off");
  }
  if (!anonClient) {
    anonClient = createClient(
      config.saas.supabaseUrl,
      config.saas.supabaseAnonKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return anonClient;
}
