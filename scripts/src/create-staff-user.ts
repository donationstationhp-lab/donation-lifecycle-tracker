/**
 * Provisions a staff account for Donation Station sign-in.
 * There is no public signup — this is the only way to create one.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-staff-user -- \
 *     --email jane@example.org --name "Jane Doe" --password "correct horse battery staple"
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, staffUsersTable, hashPassword } from "@workspace/db";

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const email = readFlag(args, "--email")?.trim().toLowerCase();
  const name = readFlag(args, "--name")?.trim();
  const password = readFlag(args, "--password");

  if (!email || !name || !password) {
    console.error(
      "Usage: create-staff-user -- --email <email> --name <name> --password <password>",
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const [existing] = await db
    .select({ id: staffUsersTable.id })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.email, email))
    .limit(1);

  if (existing) {
    console.error(`A staff account with email "${email}" already exists.`);
    process.exitCode = 1;
    return;
  }

  await db.insert(staffUsersTable).values({
    id: randomUUID(),
    email,
    name,
    passwordHash: hashPassword(password),
  });

  console.log(`Created staff account for ${name} <${email}>.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
