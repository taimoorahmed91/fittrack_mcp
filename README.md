# FitTrack MCP

A minimal, public, read-only MCP server built with XMCP and HTTP transport.

## Tool

`get-fittrack-info` returns a fixed payload containing the app name, service
status, and sample tracking categories. It does not require authentication and
does not read or write external data.

## Requirements

- Node.js 20 or newer
- npm

## Local development

```bash
npm install
npm run dev
```

The MCP endpoint is available at `http://localhost:3001/mcp`.

## Supabase connectivity safety test

Copy `.env.example` to `.env.local` and provide the project URL and an
`sb_publishable_...` key. Never use a secret or service-role key.

```bash
npm run test:db-read
```

The test performs an anonymous, read-only request against
`public.fittrack_weight` without returning row data. It passes only when RLS
hides every row from the anonymous role. No database-backed MCP tool is exposed
until user authentication is implemented.

## Build

```bash
npm run build
npm start
```

## Deploy to Vercel

Import this Git repository into Vercel or run:

```bash
vercel deploy
```

After deployment, the public endpoint is `https://<deployment>.vercel.app/mcp`.
