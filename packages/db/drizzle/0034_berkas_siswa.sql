CREATE TABLE "player_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ssb_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"file_key" text NOT NULL,
	"mime" text NOT NULL,
	"original_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_document_ssb_id" UNIQUE("ssb_id","id"),
	CONSTRAINT "player_document_kind" CHECK ("player_document"."kind" in ('kartu_keluarga', 'akta_kelahiran', 'nisn', 'raport')),
	CONSTRAINT "player_document_mime" CHECK ("player_document"."mime" in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "player_document_size" CHECK ("player_document"."size_bytes" between 1 and 5242880),
	CONSTRAINT "player_document_label" CHECK ("player_document"."label" is null or char_length("player_document"."label") <= 60),
	CONSTRAINT "player_document_raport_label" CHECK ("player_document"."kind" <> 'raport' or "player_document"."label" is not null)
);
--> statement-breakpoint
ALTER TABLE "player_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "player_document" ADD CONSTRAINT "player_document_ssb_id_ssb_id_fk" FOREIGN KEY ("ssb_id") REFERENCES "public"."ssb"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_document" ADD CONSTRAINT "player_document_player_fk" FOREIGN KEY ("ssb_id","player_id") REFERENCES "public"."player"("ssb_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_document" ADD CONSTRAINT "player_document_uploaded_by_fk" FOREIGN KEY ("ssb_id","uploaded_by") REFERENCES "public"."app_user"("ssb_id","id") ON DELETE SET NULL ("uploaded_by") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_document_one_per_kind" ON "player_document" USING btree ("ssb_id","player_id","kind") WHERE "player_document"."kind" <> 'raport';--> statement-breakpoint
CREATE INDEX "player_document_player" ON "player_document" USING btree ("ssb_id","player_id","created_at");--> statement-breakpoint
CREATE POLICY "player_document_tenant" ON "player_document" AS PERMISSIVE FOR ALL TO "ssb_app" USING (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid) WITH CHECK (ssb_id = nullif(current_setting('app.ssb_id', true), '')::uuid);