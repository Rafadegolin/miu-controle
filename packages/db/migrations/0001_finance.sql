CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"initial_balance_cents" bigint DEFAULT 0 NOT NULL,
	"color" text NOT NULL,
	"credit_limit_cents" bigint,
	"closing_day" integer,
	"due_day" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('checking','savings','cash','investment','credit_card')),
	CONSTRAINT "accounts_card_fields_check" CHECK (("accounts"."kind" = 'credit_card') = ("accounts"."closing_day" is not null and "accounts"."due_day" is not null)),
	CONSTRAINT "accounts_days_check" CHECK ("accounts"."closing_day" between 1 and 28 and "accounts"."due_day" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"statement_month" date,
	"installment_group_id" text,
	"installment_no" integer,
	"installment_total" integer,
	"recurring_rule_id" text,
	"import_batch_id" text,
	"import_fitid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount_cents" > 0),
	CONSTRAINT "transactions_kind_check" CHECK ("transactions"."kind" in ('income','expense','transfer')),
	CONSTRAINT "transactions_status_check" CHECK ("transactions"."status" in ('posted','planned')),
	CONSTRAINT "transactions_transfer_check" CHECK (("transactions"."kind" = 'transfer') = ("transactions"."to_account_id" is not null) and ("transactions"."to_account_id" is null or "transactions"."to_account_id" <> "transactions"."account_id")),
	CONSTRAINT "transactions_transfer_category_check" CHECK ("transactions"."kind" <> 'transfer' or "transactions"."category_id" is null)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_id_index" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_to_account_idx" ON "transactions" USING btree ("to_account_id") WHERE "transactions"."to_account_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("user_id","category_id","date");