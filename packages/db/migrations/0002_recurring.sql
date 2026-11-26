CREATE TABLE "recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"description" text NOT NULL,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"auto_post" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"generated_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_amount_check" CHECK ("recurring_rules"."amount_cents" > 0),
	CONSTRAINT "recurring_interval_check" CHECK ("recurring_rules"."interval" between 1 and 12),
	CONSTRAINT "recurring_day_check" CHECK ("recurring_rules"."day_of_month" between 1 and 31),
	CONSTRAINT "recurring_frequency_check" CHECK ("recurring_rules"."frequency" in ('monthly','weekly','yearly')),
	CONSTRAINT "recurring_transfer_check" CHECK (("recurring_rules"."kind" = 'transfer') = ("recurring_rules"."to_account_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rules_user_id_index" ON "recurring_rules" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_rule_date_uq" ON "transactions" USING btree ("recurring_rule_id","date") WHERE "transactions"."recurring_rule_id" is not null;