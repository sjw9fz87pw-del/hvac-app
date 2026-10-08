/**
 * Plain-English names for the system's internal vocabulary.
 *
 * Action keys like `tag.assigned` and enum values like `NEEDS_ATTENTION` are
 * identifiers for code and for the audit log. They are never what a person
 * should read, so every screen goes through these instead of printing them.
 */

const AUDIT: Record<string, string> = {
  "asset.created": "Unit added",
  "asset.updated": "Details updated",
  "asset.archived": "Archived",
  "asset.verified": "Details verified",
  "asset.deleted": "Unit deleted",
  "asset.replaced": "Replaced",
  "asset.frequency_changed": "Schedule changed",
  "tag.minted": "Tag prepared",
  "tag.assigned": "Tag paired",
  "tag.replaced": "Tag replaced",
  "tag.unpaired": "Tag removed",
  "tag.reassigned": "Tag moved",
  "tag.revoked": "Tag revoked",
  "tag.verified": "Tag verified",
  "tag.locked": "Tag locked",
  "tag.lock_failed": "Tag lock failed",
  "service.completed": "Service completed",
  "service.edited": "Service record edited",
  "issue.created": "Issue reported",
  "issue.assigned": "Issue assigned",
  "issue.resolved": "Issue resolved",
  "visit.created": "Visit scheduled",
  "visit.updated": "Visit updated",
  "visit.completed": "Visit completed",
  "location.created": "Restaurant added",
  "location.updated": "Restaurant updated",
  "location.deleted": "Restaurant deleted",
  "area.created": "Area added",
  "org.created": "Group created",
  "org.updated": "Group updated",
  "org.deleted": "Group deleted",
  "user.invited": "Invitation sent",
  "user.role_changed": "Role changed",
  "user.reset_requested": "Password reset sent",
  "user.activated": "Account activated",
  "user.deactivated": "Account deactivated",
  "user.password_set": "Password set",
  "user.deleted": "Account deleted",
  "serviceType.updated": "Service settings changed",
  "serviceType.created": "Job added",
  "serviceType.removed": "Job removed",
  "serviceType.retired": "Job removed (history kept)",
  "schedule.added": "Job added to unit",
  "schedule.removed": "Job removed from unit",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_failed": "Sign-in failed",
};

const TAG_EVENT: Record<string, string> = {
  MINTED: "Prepared",
  WRITTEN: "Written",
  WRITE_FAILED: "Write failed",
  VERIFIED: "Verified",
  VERIFY_FAILED: "Verification failed",
  PAIRED: "Paired",
  UNPAIRED: "Removed from unit",
  REASSIGNED: "Moved to another unit",
  REPLACED: "Replaced",
  REVOKED: "Revoked",
  READ: "Scanned",
  READ_DENIED: "Scan refused",
  TESTED: "Tested",
  LOCKED: "Locked",
  LOCK_FAILED: "Lock failed",
};

/** Any SCREAMING_SNAKE value, as words: `NEEDS_ATTENTION` → "Needs attention". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[_.]/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function auditLabel(action: string): string {
  return AUDIT[action] ?? humanize(action);
}

export function tagEventLabel(type: string): string {
  return TAG_EVENT[type] ?? humanize(type);
}
