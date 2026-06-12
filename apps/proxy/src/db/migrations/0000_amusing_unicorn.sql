CREATE TYPE "public"."alert_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('backend_down', 'backend_recovered', 'morning_report');--> statement-breakpoint
CREATE TYPE "public"."backend_status" AS ENUM('up', 'down', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."db_role" AS ENUM('primary', 'replica');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'max');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" "alert_type" NOT NULL,
	"channel" "alert_channel" NOT NULL,
	"payload" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backends" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"provider_hint" text,
	"active" boolean DEFAULT true NOT NULL,
	"failure_streak" integer DEFAULT 0 NOT NULL,
	"circuit_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"week_start" timestamp with time zone,
	"amount" real NOT NULL,
	"razorpay_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "db_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"connection_string" text NOT NULL,
	"role" "db_role" DEFAULT 'primary' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"backend_id" text NOT NULL,
	"status" "backend_status" NOT NULL,
	"response_ms" integer,
	"status_code" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"proxy_slug" text NOT NULL,
	"maintenance_html" text,
	"shield_enabled" boolean DEFAULT false NOT NULL,
	"shield_rate_limit" integer DEFAULT 60 NOT NULL,
	"shield_daily_cap" real,
	"health_check_interval" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_proxy_slug_unique" UNIQUE("proxy_slug")
);
--> statement-breakpoint
CREATE TABLE "shield_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"requests_blocked" integer DEFAULT 0 NOT NULL,
	"hours_charged" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"first_week_free" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backends" ADD CONSTRAINT "backends_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "db_connections" ADD CONSTRAINT "db_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_logs" ADD CONSTRAINT "health_logs_backend_id_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."backends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_sessions" ADD CONSTRAINT "shield_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;