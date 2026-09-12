import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireCapability } from "@/lib/auth/session";
import { organizationScope } from "@/lib/auth/scope";
import { ok, route } from "@/lib/api/respond";

/**
 * Internal global search: restaurant, customer, equipment name, model, serial,
 * asset id, or tag id - one box, because a technician on site knows one of those
 * and should not have to guess which filter it belongs in.
 */
export const GET = route(async (request: NextRequest) => {
  const actor = await requireCapability("search.global");
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return ok({ results: [] });

  const scope = organizationScope(actor);
  const orgFilter = scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {};
  const contains = { contains: q, mode: "insensitive" as const };

  const [equipment, locations, organizations, tags] = await Promise.all([
    prisma.equipment.findMany({
      where: {
        ...orgFilter,
        OR: [
          { name: contains }, { model: contains }, { serialNumber: contains },
          { internalAssetId: contains }, { manufacturer: contains }, { equipmentType: contains },
        ],
      },
      include: { location: { select: { name: true } }, area: { select: { name: true } } },
      take: 12,
    }),
    prisma.restaurantLocation.findMany({
      where: { ...orgFilter, name: contains },
      include: { organization: { select: { name: true } } },
      take: 6,
    }),
    scope
      ? prisma.customerOrganization.findMany({ where: { id: { in: scope }, name: contains }, take: 6 })
      : prisma.customerOrganization.findMany({ where: { name: contains }, take: 6 }),
    prisma.tag.findMany({
      where: { ...(scope ? { organizationId: { in: scope.length ? scope : ["__none__"] } } : {}), OR: [{ tokenId: contains }, { label: contains }] },
      include: { assignments: { where: { unassignedAt: null }, include: { equipment: { select: { id: true, name: true } } } } },
      take: 6,
    }),
  ]);

  return ok({
    results: [
      ...equipment.map((e) => ({
        type: "equipment" as const, id: e.id, title: e.name,
        subtitle: [e.location.name, e.area?.name, e.model, e.internalAssetId].filter(Boolean).join(" · "),
        href: `/admin/equipment/${e.id}`,
      })),
      ...locations.map((l) => ({
        type: "location" as const, id: l.id, title: l.name,
        subtitle: l.organization.name, href: `/admin/locations/${l.id}`,
      })),
      ...organizations.map((o) => ({
        type: "customer" as const, id: o.id, title: o.name, subtitle: "Customer", href: `/admin/customers/${o.id}`,
      })),
      ...tags.map((t) => ({
        type: "tag" as const, id: t.id, title: t.label ?? t.tokenId.slice(0, 12),
        subtitle: `${t.state}${t.assignments[0] ? ` · ${t.assignments[0].equipment.name}` : ""}`,
        href: `/admin/nfc/${t.id}`,
      })),
    ],
  });
});
