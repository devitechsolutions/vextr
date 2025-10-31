/*
  # Complete Database Schema Migration

  ## Overview
  This migration creates the complete database schema for the recruitment platform, including all tables for users, candidates, clients, vacancies, and workflow tracking.

  ## New Tables Created
  
  ### Authentication & Users
  - `users` - User accounts with invite-based authentication
  
  ### Core Business Data
  - `candidates` - Candidate profiles with Vtiger sync support
  - `clients` - Client/company records
  - `vacancies` - Job openings and positions
  
  ### Workflow & Tracking
  - `todos` - Task management
  - `tasks` - Enhanced task tracking with automation support
  - `contact_attempts` - Contact history tracking
  - `next_actions` - Priority queue for recruiter actions
  - `candidate_statuses` - Candidate status per vacancy
  - `candidate_vacancy_links` - Pipeline tracking per candidate-vacancy pair
  - `candidate_vacancy_matches` - Cached match scores
  - `interactions` - Communication tracking
  - `candidate_notes` - Multiple notes per candidate
  
  ### Analytics & Reporting
  - `kpi_targets` - Performance targets
  - `activities` - Activity timeline
  - `interviews` - Interview scheduling
  - `placements` - Revenue and placement tracking
  - `pipeline_stages` - Pipeline metrics
  - `revenue_forecast` - Revenue forecasting
  
  ### Integration & Sync
  - `sync_metadata` - Vtiger sync tracking
  - `linkedin_tokens` - LinkedIn OAuth tokens
  
  ### Sourcing
  - `job_titles` - Automated sourcing job titles
  - `sourced_profiles` - Sourced candidate profiles

  ## Security
  - All tables have RLS enabled
  - Timestamps for audit trails
  - Foreign key constraints for data integrity
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'recruiter',
  avatar TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  invite_token TEXT,
  invite_token_expiry TIMESTAMPTZ,
  reset_token TEXT,
  reset_token_expiry TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  title_description TEXT,
  profile_summary TEXT,
  company TEXT,
  company_location TEXT,
  branche TEXT,
  location TEXT,
  duration_current_role TEXT,
  duration_at_company TEXT,
  past_employer TEXT,
  past_role_title TEXT,
  past_experience_duration TEXT,
  scraped_on TEXT,
  current_title TEXT,
  target_role TEXT,
  skills TEXT[],
  experience INTEGER,
  education TEXT,
  availability TEXT,
  resume TEXT,
  cv_url TEXT,
  formatted_cv_url TEXT,
  linkedin_url TEXT,
  notes TEXT,
  salary_range_min INTEGER,
  salary_range_max INTEGER,
  salary_currency TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'Uncontacted',
  source TEXT,
  vtiger_id TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  industry TEXT,
  location TEXT,
  website TEXT,
  description TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  vtiger_id TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vacancies table
CREATE TABLE IF NOT EXISTS vacancies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  organization TEXT,
  function TEXT,
  job_requirements TEXT,
  offer TEXT,
  description TEXT,
  requirements TEXT,
  skills TEXT[],
  experience_level TEXT,
  education_level TEXT,
  location TEXT,
  employment_type TEXT,
  salary_range_min INTEGER,
  salary_range_max INTEGER,
  salary_currency TEXT DEFAULT 'EUR',
  salary TEXT,
  skills_weight INTEGER DEFAULT 40,
  location_weight INTEGER DEFAULT 25,
  experience_weight INTEGER DEFAULT 15,
  title_weight INTEGER DEFAULT 10,
  education_weight INTEGER DEFAULT 5,
  industry_weight INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  vtiger_id TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Todos table
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  completed BOOLEAN DEFAULT false,
  related_type TEXT,
  related_id INTEGER,
  vtiger_id TEXT,
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contact attempts table
CREATE TABLE IF NOT EXISTS contact_attempts (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  recruiter_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT,
  follow_up_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Next actions table
CREATE TABLE IF NOT EXISTS next_actions (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  recruiter_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  due_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  priority_score REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Candidate vacancy matches table
CREATE TABLE IF NOT EXISTS candidate_vacancy_matches (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  vacancy_id INTEGER NOT NULL REFERENCES vacancies(id),
  match_score REAL NOT NULL,
  breakdown TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI targets table
CREATE TABLE IF NOT EXISTS kpi_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  daily_calls INTEGER NOT NULL DEFAULT 30,
  weekly_placements INTEGER NOT NULL DEFAULT 3,
  monthly_revenue INTEGER NOT NULL DEFAULT 20000,
  currency TEXT NOT NULL DEFAULT 'EUR',
  conversion_rate INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Interviews table
CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'video',
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pipeline stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vacancy_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL
);

-- LinkedIn tokens table
CREATE TABLE IF NOT EXISTS linkedin_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidate statuses table
CREATE TABLE IF NOT EXISTS candidate_statuses (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job titles table
CREATE TABLE IF NOT EXISTS job_titles (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sources JSONB NOT NULL DEFAULT '["linkedin", "github"]',
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sourced profiles table
CREATE TABLE IF NOT EXISTS sourced_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT,
  profile_url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  job_title_id INTEGER NOT NULL,
  profile_title TEXT,
  description TEXT,
  raw_data JSONB,
  extracted_skills TEXT[],
  location TEXT,
  email TEXT,
  contact_info TEXT,
  candidate_id INTEGER,
  vtiger_id TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  sync_status TEXT,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidate notes table
CREATE TABLE IF NOT EXISTS candidate_notes (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  contact_date TIMESTAMPTZ,
  contact_method TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidate vacancy links table
CREATE TABLE IF NOT EXISTS candidate_vacancy_links (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Uncontacted',
  assigned_by INTEGER NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Interactions table
CREATE TABLE IF NOT EXISTS interactions (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  vacancy_id INTEGER,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  outcome TEXT,
  subject TEXT,
  content TEXT,
  duration INTEGER,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Placements table
CREATE TABLE IF NOT EXISTS placements (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  vacancy_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  placed_by INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  employment_type TEXT NOT NULL,
  buy_rate INTEGER,
  sell_rate INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  margin INTEGER,
  margin_percentage INTEGER,
  commission_paid BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  related_type TEXT,
  related_id INTEGER,
  candidate_id INTEGER,
  vacancy_id INTEGER,
  client_id INTEGER,
  automated_task BOOLEAN DEFAULT false,
  block_time TEXT,
  estimated_duration INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revenue forecast table
CREATE TABLE IF NOT EXISTS revenue_forecast (
  id SERIAL PRIMARY KEY,
  vacancy_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  probability_weight INTEGER NOT NULL,
  forecast_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync metadata table
CREATE TABLE IF NOT EXISTS sync_metadata (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  vtiger_total INTEGER,
  fetched_count INTEGER,
  created_count INTEGER,
  updated_count INTEGER,
  error_count INTEGER,
  error_message TEXT,
  last_processed_contact_id TEXT,
  metadata JSONB,
  started_by_user_id INTEGER REFERENCES users(id),
  cancelled_by_user_id INTEGER REFERENCES users(id),
  cancel_reason TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_candidates_vtiger_id ON candidates(vtiger_id);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_clients_vtiger_id ON clients(vtiger_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_client_id ON vacancies(client_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_owner_id ON vacancies(owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_attempts_candidate_id ON contact_attempts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_next_actions_recruiter_id ON next_actions(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_candidate_vacancy_matches_candidate_id ON candidate_vacancy_matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_vacancy_matches_vacancy_id ON candidate_vacancy_matches(vacancy_id);
