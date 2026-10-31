import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { DEFAULT_TIMEZONE } from "./zone";

/** The time zone "today" is measured in for a service company. Looked up once per request. */
export const companyTimezone = cache(async (serviceCompanyId: string): Promise<string> => {
  const company = await prisma.serviceCompany.findUnique({
    where: { id: serviceCompanyId },
    select: { timezone: true },
  });
  return company?.timezone ?? DEFAULT_TIMEZONE;
});
