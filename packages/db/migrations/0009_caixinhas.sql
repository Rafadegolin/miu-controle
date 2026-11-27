CREATE TABLE "cdi_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"rate_percent" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"month" text NOT NULL,
	"transaction_id" text,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "cdi_percent" integer;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "yield_postings" ADD CONSTRAINT "yield_postings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_postings" ADD CONSTRAINT "yield_postings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_postings" ADD CONSTRAINT "yield_postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "yield_postings_account_id_month_index" ON "yield_postings" USING btree ("account_id","month");--> statement-breakpoint
CREATE INDEX "yield_postings_user_id_index" ON "yield_postings" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_cdi_check" CHECK ("accounts"."cdi_percent" is null or ("accounts"."kind" in ('savings', 'investment') and "accounts"."cdi_percent" between 1 and 50000));