import { prisma } from "@/lib/db/client";
import { DEFAULT_TIMEZONE } from "./zone";

/** The time zone "today" is measured in for a service company. */
export async function companyTimezone(serviceCompanyId: string): Promise<string> {
  const company = await prisma.serviceCompany.findUnique({
    where: { id: serviceCompanyId },
    select: { timezone: true },
  });
  return company?.timezone ?? DEFAULT_TIMEZONE;
}
