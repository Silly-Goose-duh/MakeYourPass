# CampusPass 🎫

**Marian Engineering College's Official Event Platform.** Create custom forms, manage registrations, and track analytics — all for college clubs and departments.

## Live Demo
- [https://mec-campuspass.vercel.app](https://mec-campuspass.vercel.app)
- Alias: [https://makeyourpass.vercel.app](https://makeyourpass.vercel.app)

## Master Control Panel
[https://mec-campuspass.vercel.app/mc](https://mec-campuspass.vercel.app/mc)
- Superadmin: `gooseisback4u@gmail.com`

## Demo Data
- **Organization**: FOSS Club @ MEC
- **Event**: AI Workshop: Build with Opencode (published, Saturday this week)

## Tech Stack
- React + TypeScript + Vite
- Tailwind CSS + Framer Motion (animations throughout)
- Supabase (auth, database, storage, RLS)
- EmailJS (contact/notification emails)
- Vercel (deployment)

## Design System
UI runs on the **v3 "Aurora"** design system (premium dark, violet→fuchsia,
Luma/Partiful-inspired). All tokens live in `src/index.css` (`@theme` block);
retuning a token restyles the whole app. See **[DESIGN.md](./DESIGN.md)** for the
full design language, token map, utility classes, and extension conventions.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://isvylfovcwtlemjpkdqp.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_RAZORPAY_KEY_ID=your-razorpay-key
VITE_EMAILJS_SERVICE_ID=your-service-id
VITE_EMAILJS_TEMPLATE_ID=your-template-id
VITE_EMAILJS_PUBLIC_KEY=your-public-key
```

## Project Structure

```
src/
  components/
    ui/          Reusable UI (Button, Card, Input, Tabs, etc.)
    forms/       FormBuilder for Google Forms-style questions
    layout/      Navbar, Footer, Layout
    auth/        RouteGuards (ProtectedRoute, SuperAdminRoute)
  pages/         Page-level components
  hooks/         Custom React hooks
  lib/           Supabase client & helpers
  types/         TypeScript type definitions
```

## Features

- **Public Event Discovery** — Browse events, filter by organization, search
- **Google Forms-style Builder** — Create custom forms with 6 question types
- **Organization Registration** — Clubs/departments apply, superadmin approves
- **Superadmin MC Panel** — Full control over orgs, events, and requests
- **Shareable Form Links** — Each event gets a public registration link
- **Event Analytics** — Response breakdowns, CSV export, per-question stats
- **Role-based Access** — RLS policies on every table

## Database Setup

### Step 1 — Initial migration
Run the SQL migration in `supabase/migration.sql` via Supabase SQL Editor:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/isvylfovcwtlemjpkdqp/sql/new)
2. Paste the contents of `supabase/migration.sql`
3. Run it (creates the schema with tables, RLS, and functions)

### Step 2 — RLS recursion fix (REQUIRED)

⚠️ **This is critical.** The current `organization_members` SELECT policy causes infinite recursion because it self-references the table. Run `supabase/rls-fix-v2.sql` in the Supabase SQL Editor:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/isvylfovcwtlemjpkdqp/sql/new)
2. Paste the contents of `supabase/rls-fix-v2.sql`
3. Run it

This creates an `is_org_admin(UUID)` SECURITY DEFINER function and rewrites ALL policies to use it instead of direct `organization_members` subqueries, eliminating the recursion.

After applying, the app's event features will work fully:
- Event browsing (public and org views)
- Event creation and management
- Analytics and responses

## Deployment

Deployed on [Vercel](https://vercel.com). Push to `master` triggers auto-deploy.

To manually deploy:
```bash
vercel --prod
```
