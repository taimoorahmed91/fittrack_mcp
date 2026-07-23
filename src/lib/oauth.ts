const DEFAULT_MCP_RESOURCE_URL = "https://fittrackmcp.vercel.app/mcp";
const OAUTH_SCOPES = ["email"] as const;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getMcpResourceUrl(): string {
  return normalizeUrl(
    process.env.MCP_RESOURCE_URL ?? DEFAULT_MCP_RESOURCE_URL,
  );
}

export function getResourceMetadataUrl(): string {
  return `${new URL(getMcpResourceUrl()).origin}/.well-known/oauth-protected-resource`;
}

export function getSupabaseIssuerUrl(): string {
  return `${normalizeUrl(requireEnvironmentVariable("SUPABASE_URL"))}/auth/v1`;
}

export function getOAuthScopes(): string[] {
  return [...OAUTH_SCOPES];
}

export function getOAuthSecuritySchemes() {
  return [
    {
      type: "oauth2" as const,
      scopes: getOAuthScopes(),
    },
  ];
}

export function getNoAuthSecuritySchemes() {
  return [{ type: "noauth" as const }];
}

export function createBearerChallenge(
  error: "invalid_token" | "insufficient_scope" = "invalid_token",
  errorDescription = "Authentication is required to continue.",
): string {
  const escapedDescription = errorDescription.replace(/["\\]/g, "\\$&");

  return `Bearer ${[
    `resource_metadata="${getResourceMetadataUrl()}"`,
    `scope="${getOAuthScopes().join(" ")}"`,
    `error="${error}"`,
    `error_description="${escapedDescription}"`,
  ].join(", ")}`;
}
