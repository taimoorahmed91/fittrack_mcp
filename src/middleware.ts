import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types";
import type { Middleware } from "xmcp";

import {
  createBearerChallenge,
  getMcpResourceUrl,
  getOAuthScopes,
  getSupabaseIssuerUrl,
} from "./lib/oauth";
import { createSupabaseClient } from "./lib/supabase";

type AuthenticatedRequest = Request & {
  auth?: AuthInfo;
};

type VerifiedClaims = {
  aud?: unknown;
  client_id?: unknown;
  email?: unknown;
  exp?: unknown;
  iss?: unknown;
  role?: unknown;
  scope?: unknown;
  sub?: unknown;
};

function getBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  return authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
}

function hasExpectedAudience(audience: unknown): boolean {
  if (typeof audience === "string") {
    return audience === "authenticated";
  }

  return (
    Array.isArray(audience) &&
    audience.some((value) => value === "authenticated")
  );
}

function getScopes(scope: unknown): string[] {
  if (typeof scope !== "string") {
    return getOAuthScopes();
  }

  const scopes = scope.split(/\s+/).filter(Boolean);
  return scopes.length > 0 ? scopes : getOAuthScopes();
}

function rejectUnauthorized(res: Response, description: string): void {
  res
    .status(401)
    .set("WWW-Authenticate", createBearerChallenge("invalid_token", description))
    .json({
      error: "invalid_token",
      error_description: description,
    });
}

async function verifyBearerToken(token: string): Promise<AuthInfo | undefined> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims) {
    return undefined;
  }

  const claims = data.claims as VerifiedClaims;
  const clientId =
    typeof claims.client_id === "string" ? claims.client_id : undefined;
  const subject = typeof claims.sub === "string" ? claims.sub : undefined;

  if (
    !clientId ||
    !subject ||
    claims.iss !== getSupabaseIssuerUrl() ||
    claims.role !== "authenticated" ||
    !hasExpectedAudience(claims.aud)
  ) {
    return undefined;
  }

  return {
    token,
    clientId,
    scopes: getScopes(claims.scope),
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: {
      userId: subject,
      ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    },
  };
}

const oauthRouter = Router();

oauthRouter.options(
  [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ],
  (_req, res) => {
    res
      .status(204)
      .set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      })
      .send();
  },
);

oauthRouter.get(
  [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ],
  (_req, res) => {
    res
      .status(200)
      .set({
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json",
      })
      .json({
        resource: getMcpResourceUrl(),
        authorization_servers: [getSupabaseIssuerUrl()],
        bearer_methods_supported: ["header"],
        scopes_supported: getOAuthScopes(),
        resource_documentation: "https://fittrack.taimoorahmed.com",
      });
  },
);

const bearerAuthMiddleware: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/mcp")) {
    next();
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization) {
    next();
    return;
  }

  const token = getBearerToken(authorization);
  if (!token) {
    rejectUnauthorized(res, "The bearer authorization header is malformed.");
    return;
  }

  try {
    const authInfo = await verifyBearerToken(token);
    if (!authInfo) {
      rejectUnauthorized(res, "The supplied access token is invalid.");
      return;
    }

    (req as AuthenticatedRequest).auth = authInfo;
    next();
  } catch {
    rejectUnauthorized(res, "The supplied access token could not be verified.");
  }
};

const middleware: Middleware[] = [
  {
    router: oauthRouter,
    middleware: bearerAuthMiddleware,
  },
];

export default middleware;
