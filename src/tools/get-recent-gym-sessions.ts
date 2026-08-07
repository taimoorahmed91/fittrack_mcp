import { z } from "zod";
import {
  type InferSchema,
  type ToolExtraArguments,
  type ToolMetadata,
} from "xmcp";

import {
  createBearerChallenge,
  getOAuthSecuritySchemes,
} from "../lib/oauth";
import { createSupabaseClient } from "../lib/supabase";

export const schema = {
  date: z
    .string()
    .regex(
      /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/,
      "Date must use YYYY-MM or YYYY-MM-DD format",
    )
    .optional()
    .describe(
      "Gym-session month (YYYY-MM) or exact date (YYYY-MM-DD). When omitted, sessions are not filtered by date.",
    ),
  exercise: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Case-insensitive exercise or session-name fragment, such as Push Day or Pull Day.",
    ),
};

export const metadata: ToolMetadata = {
  name: "get-recent-gym-sessions",
  description:
    "Get up to ten of the authenticated user's latest FitTrack gym sessions, optionally filtered by month, exact date, or partial exercise/session name. Returns duration, detailed workout notes, and start and end times.",
  annotations: {
    title: "Get recent gym sessions",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

function escapeLikeFragment(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export default async function getRecentGymSessions(
  { date, exercise }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve gym sessions.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your gym sessions.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  let query = supabase
    .from("fittrack_gym_sessions")
    .select(
      "exercise,duration,date,notes,start_time,end_time,created_at,updated_at",
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (date?.length === 7) {
    const [year, month] = date.split("-").map(Number);
    const nextMonth =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    query = query.gte("date", `${date}-01`).lt("date", nextMonth);
  } else if (date) {
    query = query.eq("date", date);
  }

  if (exercise !== undefined) {
    query = query.ilike("exercise", `%${escapeLikeFragment(exercise)}%`);
  }

  const { data, error } = await query;

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated gym-session query was rejected.",
        },
      ],
    };
  }

  const filters = {
    ...(date ? { date } : {}),
    ...(exercise !== undefined ? { exerciseContains: exercise } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No gym sessions matched ${JSON.stringify(filters)} for the authenticated user.`
            : JSON.stringify(
                {
                  filters,
                  entries: data,
                },
                null,
                2,
              ),
      },
    ],
    structuredContent: {
      filters,
      entries: data,
    },
  };
}
