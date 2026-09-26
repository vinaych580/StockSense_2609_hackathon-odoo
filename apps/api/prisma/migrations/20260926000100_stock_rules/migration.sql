-- Rules Prisma's schema language can't express. Never edit once applied; add a new migration.

-- Stock can never be negative, even if a service has a bug. posting.ts checks first; this is the backstop.
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_quantity_nonneg" CHECK ("quantity" >= 0);

-- Every ledger row moves a positive quantity between two different locations.
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_quantity_pos" CHECK ("quantity" > 0);
ALTER TABLE "stock_move" ADD CONSTRAINT "stock_move_distinct_ends" CHECK ("from_location_id" <> "to_location_id");

-- Line quantities: which one a type needs is enforced in zod and the service (a CHECK can't read the operation's type).
ALTER TABLE "operation_line" ADD CONSTRAINT "operation_line_quantity_pos" CHECK ("quantity" IS NULL OR "quantity" > 0);
ALTER TABLE "operation_line" ADD CONSTRAINT "operation_line_counted_nonneg" CHECK ("counted_quantity" IS NULL OR "counted_quantity" >= 0);

ALTER TABLE "operation" ADD CONSTRAINT "operation_distinct_ends" CHECK ("source_location_id" <> "dest_location_id");
ALTER TABLE "operation" ADD CONSTRAINT "operation_version_nonneg" CHECK ("version" >= 0);

ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_min_nonneg" CHECK ("min_qty" >= 0);
ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_max_ge_min" CHECK ("max_qty" >= "min_qty");

ALTER TABLE "product" ADD CONSTRAINT "product_unit_cost_nonneg" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

-- Internal locations belong to a warehouse; virtual ones (Vendors, Customers, Inventory adjustment) don't.
ALTER TABLE "location" ADD CONSTRAINT "location_warehouse_matches_type"
  CHECK (("type" = 'INTERNAL') = ("warehouse_id" IS NOT NULL));

-- Exactly one location of each virtual type.
CREATE UNIQUE INDEX "location_one_per_virtual_type" ON "location" ("type") WHERE "type" <> 'INTERNAL';

-- The ledger is append-only: it is the audit trail. (TRUNCATE in tests and db:reset is statement-level and unaffected.)
CREATE FUNCTION "stock_move_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_move is append-only: % is not allowed', TG_OP USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "stock_move_no_update_delete"
  BEFORE UPDATE OR DELETE ON "stock_move"
  FOR EACH ROW EXECUTE FUNCTION "stock_move_append_only"();

-- System data: the three virtual locations, with the fixed ids from packages/shared (SYSTEM_LOCATION_IDS).
-- ensureSystemData() upserts the same rows after every truncate.
INSERT INTO "location" ("id", "warehouse_id", "code", "name", "type", "is_active", "updated_at") VALUES
  ('00000000-0000-4000-8000-000000000001', NULL, 'VENDORS', 'Vendors', 'VENDOR', true, now()),
  ('00000000-0000-4000-8000-000000000002', NULL, 'CUSTOMERS', 'Customers', 'CUSTOMER', true, now()),
  ('00000000-0000-4000-8000-000000000003', NULL, 'ADJUST', 'Inventory adjustment', 'ADJUSTMENT', true, now());
