import { clerkClient } from "@clerk/express";

const GRANT_MARKER = "donationStationStaffEmailGrant";

type StaffAccount = {
  id: string;
  publicMetadata: Record<string, unknown>;
  privateMetadata: Record<string, unknown>;
  emailAddresses: Array<{ emailAddress: string; verification: { status: string } | null }>;
};

export interface StaffDirectory {
  find(email: string): Promise<StaffAccount[]>;
  create(email: string): Promise<void>;
  update(id: string, publicMetadata: Record<string, unknown>, privateMetadata: Record<string, unknown>): Promise<void>;
}

const directory: StaffDirectory = {
  async find(email) {
    return (await clerkClient.users.getUserList({ emailAddress: [email], limit: 100 })).data;
  },
  async create(email) {
    await clerkClient.users.createUser({
      emailAddress: [email],
      skipPasswordRequirement: true,
      publicMetadata: { role: "staff" },
      privateMetadata: { [GRANT_MARKER]: true },
    });
  },
  async update(id, publicMetadata, privateMetadata) {
    await clerkClient.users.updateUserMetadata(id, { publicMetadata, privateMetadata });
  },
};

export type StaffGrantStatus =
  | "created" | "granted" | "already_granted" | "revoked"
  | "unverified" | "ambiguous" | "failed";

/**
 * Owner-configured addresses only; each Clerk environment resolves its own users.
 * No passwords, unrelated account changes, or business database access.
 * The private marker prevents a later publish from restoring a revoked grant.
 */
export async function grantConfiguredStaffAccess(
  configuredEmails = process.env.STAFF_ACCESS_GRANT_EMAILS,
  users: StaffDirectory = directory,
): Promise<StaffGrantStatus[]> {
  const emails = [...new Set((configuredEmails ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const results: StaffGrantStatus[] = [];
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push("failed");
      continue;
    }
    try {
      const matches = (await users.find(email)).filter((user) =>
        user.emailAddresses.some((address) => address.emailAddress.toLowerCase() === email));
      if (matches.length > 1) { results.push("ambiguous"); continue; }
      if (matches.length === 0) {
        // No shared/default password; use the instance's normal sign-in/recovery.
        await users.create(email);
        results.push("created");
        continue;
      }
      const user = matches[0];
      if (!user.emailAddresses.some((address) =>
        address.emailAddress.toLowerCase() === email && address.verification?.status === "verified")) {
        results.push("unverified");
        continue;
      }
      const existingRole = user.publicMetadata.role;
      const alreadyPrivileged = existingRole === "staff" || existingRole === "supervisor";
      if (user.privateMetadata[GRANT_MARKER] === true) {
        results.push(alreadyPrivileged ? "already_granted" : "revoked");
        continue;
      }
      await users.update(user.id, {
        ...user.publicMetadata, role: alreadyPrivileged ? existingRole : "staff",
      }, { ...user.privateMetadata, [GRANT_MARKER]: true });
      results.push("granted");
    } catch {
      // Directory errors can contain identifiers or credentials; never log them.
      // A concurrent create can be safely resolved on the next run.
      results.push("failed");
    }
  }
  return results;
}
