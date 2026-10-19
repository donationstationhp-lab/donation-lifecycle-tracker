/**
 * Provisions a staff account for Donation Station sign-in, or resets the
 * password on an existing one. There is no public signup and no
 * self-service "forgot password" flow — this script is the only way to
 * set a staff password.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-staff-user -- \
 *     --email jane@example.org --name "Jane Doe" --password "correct horse battery staple" \
 *     [--role supervisor]
 *
 *   # Reset the password on an account that already exists:
 *   pnpm --filter @workspace/scripts run create-staff-user -- \
 *     --email jane@example.org --password "new correct horse battery staple" --reset-password
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, staffUsersTable, hashPassword } from "@workspace/db";

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main() {
  const args = process.argv.slice(2);
  const email = readFlag(args, "--email")?.trim().toLowerCase();
  const name = readFlag(args, "--name")?.trim();
  const password = readFlag(args, "--password");
  const role = readFlag(args, "--role")?.trim() ?? "staff";
  const resetPassword = hasFlag(args, "--reset-password");

  if (!email || !password || (!resetPassword && !name)) {
    console.error(
      "Usage: create-staff-user -- --email <email> --name <name> --password <password> [--role supervisor]\n" +
        "   or: create-staff-user -- --email <email> --password <password> --reset-password",
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  if (role !== "staff" && role !== "supervisor") {
    console.error(`Invalid role "${role}". Must be "staff" or "supervisor".`);
    process.exitCode = 1;
    return;
  }

  const [existing] = await db
    .select({ id: staffUsersTable.id, name: staffUsersTable.name, role: staffUsersTable.role })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.email, email))
    .limit(1);

  if (resetPassword) {
    if (!existing) {
      console.error(`No staff account with email "${email}" exists. Create it first (without --reset-password).`);
      process.exitCode = 1;
      return;
    }

    await db
      .update(staffUsersTable)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(staffUsersTable.email, email));

    console.log(`Reset password for ${existing.name} <${email}> (role: ${existing.role}).`);
    return;
  }

  if (existing) {
    console.error(
      `A staff account with email "${email}" already exists. Pass --reset-password to change its password.`,
    );
    process.exitCode = 1;
    return;
  }

  await db.insert(staffUsersTable).values({
    id: randomUUID(),
    email,
    name: name!,
    passwordHash: hashPassword(password),
    role,
  });

  console.log(`Created staff account for ${name} <${email}> (role: ${role}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
