CREATE TABLE "article_classifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" varchar NOT NULL,
	"category" varchar(20) NOT NULL,
	"confidence" integer NOT NULL,
	"classified_at" timestamp DEFAULT now() NOT NULL,
	"classifier_version" varchar(20),
	"reasoning" text,
	"keywords" text[]
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"author" text,
	"published_at" timestamp NOT NULL,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"category" varchar(20),
	"confidence" integer,
	"word_count" integer,
	"term_frequencies" text,
	"content_hash" varchar(64),
	"min_hash" text,
	"relevance_score" integer,
	"is_processed" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "articles_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE TABLE "bm25_indexes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"total_documents" integer DEFAULT 0 NOT NULL,
	"avg_doc_length" integer DEFAULT 0 NOT NULL,
	"k1" varchar(10) DEFAULT '1.5' NOT NULL,
	"b" varchar(10) DEFAULT '0.75' NOT NULL,
	"last_rebuilt_at" timestamp,
	"rebuild_in_progress" boolean DEFAULT false NOT NULL,
	"avg_query_time_ms" integer,
	"total_queries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"rss_url" text,
	"base_url" text,
	"selector_config" text,
	"total_articles" integer DEFAULT 0 NOT NULL,
	"relevant_articles" integer DEFAULT 0 NOT NULL,
	"duplicate_articles" integer DEFAULT 0 NOT NULL,
	"reliability_score" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp,
	"last_error_at" timestamp,
	"error_message" text,
	"requests_per_minute" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "article_classifications" ADD CONSTRAINT "article_classifications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bm25_indexes" ADD CONSTRAINT "bm25_indexes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classifications_article_id_idx" ON "article_classifications" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "articles_team_id_idx" ON "articles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "articles_source_url_idx" ON "articles" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "articles_content_hash_idx" ON "articles" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "bm25_indexes_team_id_idx" ON "bm25_indexes" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "news_sources_name_idx" ON "news_sources" USING btree ("name");