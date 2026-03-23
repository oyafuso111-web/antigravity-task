-- ==========================================
-- Supabase Setup Script: RLS & Auto-Cleanup
-- ==========================================

-- 1. Enable Row Level Security (RLS) on all user data tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- 2. Create Policies for `tasks` table
-- This allows users to ONLY select, insert, update, and delete rows where user_id matches their own auth.uid()
CREATE POLICY "Users can manage their own tasks" 
ON tasks FOR ALL USING (auth.uid() = user_id);

-- 3. Create Policies for `projects` table
CREATE POLICY "Users can manage their own projects" 
ON projects FOR ALL USING (auth.uid() = user_id);

-- 4. Create Policies for `tags` table
CREATE POLICY "Users can manage their own tags" 
ON tags FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 365-Day Auto Cleanup Logic (pg_cron)
-- ==========================================
-- Note: You MUST enable the "pg_cron" extension in your Supabase dashboard first:
-- (Database -> Extensions -> search for "pg_cron" -> enable)

-- This schedules a daily deletion of tasks that have been completed AND were created over 365 days ago.
SELECT cron.schedule(
  'cleanup_old_tasks', -- Job name
  '0 0 * * *',         -- Run every day at midnight (UTC)
  $$
    DELETE FROM tasks 
    WHERE completed = true 
      AND created_at < now() - interval '365 days';
  $$
);
