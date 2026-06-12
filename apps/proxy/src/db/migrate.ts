import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import path from "path";
import { fileURLToPath } from "url";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
const db = drizzle(sql);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await migrate(db, {
  migrationsFolder: path.join(__dirname, "migrations"),
});

console.log("Migrations applied successfully");
