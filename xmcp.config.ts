import { type XmcpConfig } from "xmcp";

const config: XmcpConfig = {
  http: {
    cors: {
      exposedHeaders: [
        "Content-Type",
        "Authorization",
        "WWW-Authenticate",
        "mcp-session-id",
      ],
    },
  },
  paths: {
    tools: "src/tools",
    prompts: false,
    resources: false,
  },
};

export default config;
