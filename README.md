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
