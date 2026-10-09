/**
 * How far the company is through getting set up.
 *
 * Every step is read from what exists, not ticked by hand, so the list can't
 * claim something is done that isn't — and it disappears by itself once the
 * last step is.
 */
import { prisma } from "@/lib/db/client";
import { emailConfigured } from "@/lib/email/send";
import type { Actor } from "@/lib/auth/session";

export interface SetupStep {
  key: string;
  title: string;
  /** What to do, or how far along it is. */
  detail: string;
  href: string;
  done: boolean;
}

export async function setupProgress(actor: Actor): Promise<SetupStep[]> {
  const company = { organization: { serviceCompanyId: actor.serviceCompanyId } };
  const live = { archivedAt: null, ...company };

  const [firstRestaurant, units, unitsWithWork, tagged, visits, teammates] = await Promise.all([
    prisma.restaurantLocation.findFirst({ where: company, orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.equipment.count({ where: live }),
    prisma.equipment.count({
      where: { ...live, schedules: { some: { paused: false, serviceType: { active: true } } } },
    }),
    prisma.equipment.count({ where: { ...live, tagAssignments: { some: { unassignedAt: null } } } }),
    prisma.visit.count({ where: { ...company, status: { not: "CANCELLED" } } }),
    // Invited people count from the moment they are invited.
    prisma.user.count({ where: { serviceCompanyId: actor.serviceCompanyId, id: { not: actor.userId } } }),
  ]);

  const restaurant = firstRestaurant ? `/admin/locations/${firstRestaurant.id}` : "/admin/locations/new";

  return [
    {
      key: "restaurant",
      title: "Add a restaurant",
      detail: firstRestaurant ? "Added" : "Name it and set its time zone.",
      href: "/admin/locations/new",
      done: Boolean(firstRestaurant),
    },
    {
      key: "units",
      title: "Add its equipment",
      detail: units > 0 ? `${units} unit${units === 1 ? "" : "s"} added` : "Add each unit, or walk the kitchen with Rapid inventory.",
      href: firstRestaurant ? `/admin/locations/${firstRestaurant.id}/units/new` : restaurant,
      done: units > 0,
    },
    {
      key: "work",
      title: "Choose the work and how often",
      detail: units === 0
        ? "Pick the jobs each unit gets, and how often."
        : `${unitsWithWork} of ${units} units have work set`,
      href: restaurant,
      done: units > 0 && unitsWithWork === units,
    },
    {
      key: "tags",
      title: "Pair NFC tags",
      detail: units === 0
        ? "One tag per unit proves the technician was there."
        : `${tagged} of ${units} units tagged`,
      href: "/admin/nfc?filter=untagged",
      done: units > 0 && tagged === units,
    },
    {
      key: "visit",
      title: "Book the first visit",
      detail: visits > 0 ? "Booked" : "Pick a day and a technician on the restaurant's page.",
      href: restaurant,
      done: visits > 0,
    },
    {
      key: "team",
      title: "Invite your team",
      detail: teammates > 0 ? `${teammates} invited` : "Technicians, office staff and restaurant managers.",
      href: "/admin/people/new",
      done: teammates > 0,
    },
    {
      key: "email",
      title: "Turn on email",
      detail: emailConfigured() ? "On" : "So invitations and password resets arrive by themselves.",
      href: "/admin/settings",
      done: emailConfigured(),
    },
  ];
}
