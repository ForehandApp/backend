import { db } from "@/services/db/client";
import {
  eventFormatsTable,
  inviteTypeTable,
  orgTypesTable,
  paymentModesTable,
  sportsOptionsTable,
  teamTypesTable,
} from "@/services/db/schema";
import { notInArray, sql } from "drizzle-orm";

const orgTypes = [
  { code: "sportsClub", label: "Sports Club / Community Club" },
  { code: "sportsAcademy", label: "Sports Academy / Training Center" },
  { code: "educationalInstitute", label: "Educational Institute/ College / University/ School (K-12)" },
  { code: "corporate", label: "Corporate / Company" },
  { code: "sportsVenue", label: "Sports Venue / Facility" },
  { code: "federation", label: "Federation / Governing Body (State/National)" },
  { code: "brandSponsor", label: "Brand / Sponsor" },
  { code: "vendorSeller", label: "Vendor / Sports Shop / Marketplace Seller" },
];

const sportsOptions = [{ code: "pickleBall", label: "Pickle Ball" }];

const teamTypes = [
  { code: "singles", label: "Singles" },
  { code: "doubles", label: "Doubles" },
];

const eventFormats = [
  { code: "singleKnockoutElimination", label: "Single Knockout Elimination" },
];

const paymentModes = [
  { code: "online", label: "Online" },
  { code: "atVenue", label: "At Venue" },
];

const inviteTypes = [
  { code: "organization", label: "Organization" },
  { code: "event", label: "Event" },
  { code: "tournament", label: "Tournament" },
];

async function seedTable({
  table,
  values,
}: {
  table:
    | typeof orgTypesTable
    | typeof sportsOptionsTable
    | typeof teamTypesTable
    | typeof eventFormatsTable
    | typeof paymentModesTable
    | typeof inviteTypeTable;
  values: { code: string; label: string }[];
}) {
  await db
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: table.code,
      set: { label: sql`excluded.label` },
    });

  await db.delete(table).where(
    notInArray(
      table.code,
      values.map((value) => value.code),
    ),
  );
}

export async function seed() {
  await seedTable({ table: orgTypesTable, values: orgTypes });
  await seedTable({ table: sportsOptionsTable, values: sportsOptions });
  await seedTable({ table: teamTypesTable, values: teamTypes });
  await seedTable({ table: eventFormatsTable, values: eventFormats });
  await seedTable({ table: paymentModesTable, values: paymentModes });
  await seedTable({ table: inviteTypeTable, values: inviteTypes });
}
