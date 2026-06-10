# MakeYourPass 🎫

**The all-in-one event management OS.** Create jaw-dropping events, sell tickets, check-in guests, and track analytics — no code, no tech, no designer needed.

## Live Demo

`https://makeyourpass.vercel.app` *(deployed after Phase 17)*

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 8
- **Styling:** Tailwind CSS v4 + CSS Variables
- **Motion:** Framer Motion
- **3D:** React Three Fiber + Drei + Three.js
- **Routing:** React Router v6
- **Backend:** Supabase (Auth + Postgres + Realtime + Storage)
- **Payments:** Razorpay + Slice integration-ready
- **QR:** qrcode.react (generation) + html5-qrcode (scanning)
- **Charts:** Recharts (analytics dashboards)
- **Forms:** React Hook Form + Zod
- **Icons:** Lucide React
- **Fonts:** Syne (display) + Inter (body) via Fontsource

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Payment Gateway (Razorpay)
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
```

## Project Structure

```
src/
  components/
    ui/           Reusable UI components (Button, Card, Input, Modal, etc.)
    layout/       Layout components (Navbar, Footer, Layout)
    sections/     Large page sections (Hero, Features, HowItWorks, CTA)
    3d/           3D scene components (ThreeHero)
  pages/          Page-level components
  hooks/          Custom React hooks
  lib/            External service clients (supabase, utils)
  types/          TypeScript type definitions
```

## Features

- 🎪 **Smart Ticketing** — Custom ticket types, pricing, promo codes, group bookings
- 📱 **QR Check-In** — Fast, contactless entry with real-time validation
- 📊 **Live Analytics** — Track sales, check-ins, and revenue in real-time
- 💳 **Payment Processing** — Razorpay + Slice integration
- 🎨 **Event Branding** — Customizable event pages with your brand
- 📧 **Automated Notifications** — Email and WhatsApp reminders
- 🔒 **Fraud Protection** — Anti-scalping, duplicate detection, secure QR codes
- 🤝 **Attendee Management** — View, search, manage all attendees
- 👥 **Team Collaboration** — Role-based access for your team
- 🎯 **Multi-Event Support** — Manage recurring events and multi-day festivals

## Pages

| Page | Path | Description |
|------|------|-------------|
| **Landing** | `/` | 3D hero, features, how it works, CTA |
| **Login** | `/login` | Email/password + social auth |
| **Signup** | `/signup` | Create free account |
| **Event Public** | `/event/:slug` | Public event page with ticket purchase |
| **Dashboard** | `/dashboard` | Event overview, quick actions |
| **Events** | `/dashboard/events` | Manage all events |
| **Create Event** | `/dashboard/events/new` | 5-step event builder |
| **Tickets** | `/dashboard/tickets` | View and manage tickets |
| **Attendees** | `/dashboard/attendees` | Attendee list with check-in status |
| **Analytics** | `/dashboard/analytics` | Sales, check-ins, revenue reports |
| **Settings** | `/dashboard/settings` | Profile, org, payments, API keys, security |

## Deployment

Deployed on [Vercel](https://vercel.com). Push to `main` triggers auto-deploy.

## License

MIT
