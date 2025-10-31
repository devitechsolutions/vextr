// Direct test of field mapping to identify the exact issue
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema.js";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

async function testFieldMapping() {
  console.log("🔍 Testing direct field mapping...");
  
  // Query specific candidates with known data
  const result = await db.select().from(schema.candidates).where(
    eq(schema.candidates.id, 52)
  );
  
  if (result.length > 0) {
    const candidate = result[0];
    console.log("✅ Drizzle query result:");
    console.log("- ID:", candidate.id);
    console.log("- Name:", candidate.firstName, candidate.lastName);
    console.log("- titleDescription:", candidate.titleDescription);
    console.log("- profileSummary:", candidate.profileSummary);
    console.log("- linkedinUrl:", candidate.linkedinUrl);
    console.log("All fields:", Object.keys(candidate));
  } else {
    console.log("❌ No candidate found with ID 52");
  }
}

testFieldMapping().catch(console.error);