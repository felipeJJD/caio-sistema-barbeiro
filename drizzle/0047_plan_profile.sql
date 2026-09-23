ALTER TABLE organizations ADD COLUMN estimated_monthly_clients integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN estimated_monthly_whatsapp_contacts integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN estimated_professionals integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN service_mode text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN automation_goal text NOT NULL DEFAULT '';
