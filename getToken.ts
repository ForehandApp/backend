import { createClient } from "@supabase/supabase-js";

// Initialize with your standard Anon key
// (You do not need the Service Role key just to log in)
const supabaseUrl = Bun.env.SUPABASE_URL || "YOUR_SUPABASE_URL";
const supabaseKey = Bun.env.SUPABASE_SECRET_API_KEY || "YOUR_ANON_KEY";

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAuthToken(email: string, password: string) {
  console.log(`Authenticating ${email}...`);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("❌ Authentication failed:", error.message);
    process.exit(1);
  }

  console.log("✅ Success! Add this to your Authorization header:\n");
  console.log(`Bearer ${data.session.access_token}`);
  console.log("\n⚠️ Note: This token expires in 1 hour.");
}

// Replace with your test user's credentials
const TARGET_EMAIL = "forehandplayer2@gmail.com";
const TARGET_PASSWORD = "testplayer2";

fetchAuthToken(TARGET_EMAIL, TARGET_PASSWORD);
