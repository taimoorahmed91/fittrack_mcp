# FitTrack MCP

A read-only MCP server built with XMCP, Supabase Auth, and HTTP transport.

## Tool

`get-fittrack-info` returns a fixed payload containing the app name, service
status, and sample tracking categories. It does not require authentication and
does not read or write external data.

`get-recent-weight-entries` is a protected, read-only tool that selects the
authenticated user's records from `public.fittrack_weight` using a month, an
exact date, an exact weight in kilograms, or a combination of date and weight.
When both inputs are omitted, it defaults to the current UTC month. It refuses
requests without a verified Supabase OAuth bearer token and relies on Supabase
RLS to enforce `auth.uid() = user_id`.

Results can be sorted by `date` or `weight`, ascending or descending. Without
sorting inputs, the query defaults to `created_at` descending.

`get-recent-waist-entries` applies the same protected, read-only filtering and
sorting behavior to `public.fittrack_waist`. It accepts a month or exact date,
an exact waist measurement in centimeters, and optional sorting by `date` or
`waist`. Without sorting inputs, it defaults to `created_at` descending.

`get-recent-meal-entries` applies protected, read-only filtering and sorting to
`public.fittrack_meals`. It accepts a month or exact date, a case-insensitive
food-description fragment, exact calories, and optional sorting by `date`,
`calories`, `time`, or `food`. Without sorting inputs, it defaults to
`created_at` descending.

The server publishes OAuth Protected Resource Metadata at
`/.well-known/oauth-protected-resource`. Supabase Auth is the OAuth 2.1
authorization server, while the MCP server remains the resource server.

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

Copy `.env.example` to `.env.local` and provide the project URL, an
`sb_publishable_...` key, and the canonical MCP endpoint URL. Never use a
secret or service-role key.

```bash
npm run test:db-read
```

The test performs an anonymous, read-only request against
`public.fittrack_weight` without returning row data. It passes only when RLS
hides every row from the anonymous role.

## Authentication

Configure Supabase Auth with:

- OAuth 2.1 Server enabled
- Dynamic OAuth application registration enabled
- Site URL `https://fittrack.taimoorahmed.com`
- Authorization path `/oauth/consent`

The web application owns the consent page. The MCP server verifies supplied
access tokens through Supabase Auth before passing them to the read-only
database client. Only OAuth-issued tokens containing a `client_id` are accepted.

Set the production resource URL to the exact endpoint used by MCP clients:

```text
MCP_RESOURCE_URL=https://fittrackmcp.vercel.app/mcp
```

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
