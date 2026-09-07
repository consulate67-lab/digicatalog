CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "catalog_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"custom_price" numeric(12, 2),
	"custom_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_catalog_product_unique" UNIQUE("catalog_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_customers_unique" UNIQUE("catalog_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_field_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "catalog_field_config_unique" UNIQUE("catalog_id","field_name")
);
--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_customers" ADD CONSTRAINT "catalog_customers_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_customers" ADD CONSTRAINT "catalog_customers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_field_config" ADD CONSTRAINT "catalog_field_config_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogs_tenant_idx" ON "catalogs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "catalogs_status_idx" ON "catalogs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "catalog_items_catalog_idx" ON "catalog_items" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "catalog_items_product_idx" ON "catalog_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "catalog_customers_catalog_idx" ON "catalog_customers" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "catalog_customers_customer_idx" ON "catalog_customers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "catalog_field_config_catalog_idx" ON "catalog_field_config" USING btree ("catalog_id");