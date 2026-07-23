import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env.local.",
  );
  process.exit(1);
}

if (!publishableKey.startsWith("sb_publishable_")) {
  console.error(
    "Safety stop: only an sb_publishable_ key is accepted. Do not use a secret or service-role key.",
  );
  process.exit(1);
}

const supabase = createClient(url, publishableKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const { count, error } = await supabase
  .from("fittrack_weight")
  .select("id", { count: "exact", head: true });

if (error) {
  console.error(`Read-only connection test failed: ${error.message}`);
  process.exit(1);
}

if (count !== 0) {
  console.error(
    "Safety stop: the anonymous publishable-key request can see weight rows. No data was returned, but the MCP integration must not proceed until this is reviewed.",
  );
  process.exit(2);
}

console.log(
  "Connection successful. The anonymous read returned zero visible rows, as expected from RLS.",
);
