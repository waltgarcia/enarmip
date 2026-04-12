-- ============================================================
-- ENARM•AI — Initial Database Schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- ─────────────────────────────────────────
-- PROFILES
-- Extends auth.users with app-specific data.
-- A trigger auto-inserts a row on every signup.
-- ─────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text default 'student' check (role in ('student','admin','institution')),
  institution text,
  created_at timestamptz default now()
);

-- Auto-create profile row on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, institution, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'institution',
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- GUIDELINES  (uploaded GPC PDFs)
-- ─────────────────────────────────────────
create table if not exists guidelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  file_path text,
  uploaded_by uuid references profiles(id),
  is_public boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- QUESTION BANK
-- ─────────────────────────────────────────
create table if not exists question_bank (
  id uuid primary key default gen_random_uuid(),
  guideline_id uuid references guidelines(id),
  vignette text not null,
  question text not null,
  options jsonb not null,
  correct_index integer not null,
  explanation text,
  source text,
  source_type text default 'library' check (source_type in ('gpc_pdf','library','conflict')),
  conflict_note text,
  specialty text,
  area_enarm text,
  difficulty integer default 2 check (difficulty between 1 and 3),
  topic text,
  session_type text check (session_type in ('standalone','chained')),
  case_id text,
  case_position integer,
  patient_intro text,
  clinical_update text,
  approved boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- EXAM SESSIONS
-- ─────────────────────────────────────────
create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  mode text check (mode in ('standard','simulation','thematic')),
  specialty text,
  area_enarm text,
  topic text,
  total_questions integer,
  correct_answers integer,
  duration_seconds integer,
  completed boolean default false,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- EXAM ANSWERS
-- ─────────────────────────────────────────
create table if not exists exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references exam_sessions(id) on delete cascade,
  question_id uuid references question_bank(id),
  selected_index integer,
  is_correct boolean,
  time_spent_seconds integer,
  flagged boolean default false,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table profiles enable row level security;
alter table guidelines enable row level security;
alter table question_bank enable row level security;
alter table exam_sessions enable row level security;
alter table exam_answers enable row level security;

-- profiles
create policy "Users read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

-- guidelines
create policy "Anyone reads public guidelines"
  on guidelines for select using (is_public = true);

create policy "Auth users insert guidelines"
  on guidelines for insert with check (auth.uid() = uploaded_by);

create policy "Owners delete guidelines"
  on guidelines for delete using (auth.uid() = uploaded_by);

-- question_bank
create policy "Anyone reads approved questions"
  on question_bank for select using (approved = true);

create policy "Auth users insert questions"
  on question_bank for insert with check (auth.uid() = created_by);

create policy "Admins update questions"
  on question_bank for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- exam_sessions
create policy "Users read own sessions"
  on exam_sessions for select using (auth.uid() = user_id);

create policy "Users insert own sessions"
  on exam_sessions for insert with check (auth.uid() = user_id);

create policy "Users update own sessions"
  on exam_sessions for update using (auth.uid() = user_id);

-- exam_answers
create policy "Users read own answers"
  on exam_answers for select using (
    exists (select 1 from exam_sessions where id = session_id and user_id = auth.uid())
  );

create policy "Users insert own answers"
  on exam_answers for insert with check (
    exists (select 1 from exam_sessions where id = session_id and user_id = auth.uid())
  );

-- ─────────────────────────────────────────
-- STORAGE BUCKET: guidelines-pdfs
--
-- Create the bucket via the Supabase Dashboard:
--   Storage → New Bucket
--   Name: guidelines-pdfs
--   Public: false
--   Max file size: 20 MB
--   Allowed MIME types: application/pdf
--
-- Then run the storage policies below in the SQL editor.
-- ─────────────────────────────────────────

create policy "Authenticated users can upload guidelines"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'guidelines-pdfs');

create policy "Owners can delete their guidelines"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'guidelines-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Authenticated users can read guidelines"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'guidelines-pdfs');
