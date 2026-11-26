ALTER TABLE "accounts" ADD COLUMN "institution" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "card_brand" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_card_brand_check" CHECK ("accounts"."card_brand" is null or "accounts"."kind" = 'credit_card');