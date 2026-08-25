import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { orgTypesTable } from "./lookups";
import { createdAt, updatedAt } from "./common";
import { profileTable } from "./user";

export const organizationTable = pgTable.withRLS("organization_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgTypeId: integer("org_type_id")
    .notNull()
    .references(() => orgTypesTable.id),
  name: text("name").notNull(),
  description: text("description").notNull(),

  logoUrl: text("logo_url"),
  logoPath: text("logo_path"),

  establishedYear: integer("established_year").notNull(),
  website: text("website"),

  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),

  postalCode: text("postal_code").notNull(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),

  verified: boolean("verified").notNull().default(false),

  createdAt,
  updatedAt,
});

export const organizationMemberTable = pgTable.withRLS(
  "organization_member_table",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profileTable.id),

    isOwner: boolean("is_owner").notNull().default(false),

    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("organization_member_table_user_id_idx").on(table.userId),
  ],
);
