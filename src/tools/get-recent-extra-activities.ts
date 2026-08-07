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
      "Extra-activity month (YYYY-MM) or exact date (YYYY-MM-DD). When omitted, activities are not filtered by date.",
    ),
  activity: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Case-insensitive activity-name fragment, such as Tennis, Running, or Cycling.",
    ),
};

export const metadata: ToolMetadata = {
  name: "get-recent-extra-activities",
  description:
    "Get up to ten of the authenticated user's latest FitTrack extra activities, optionally filtered by month, exact date, or partial activity name. Returns intensity, duration, notes, time, and calories.",
  annotations: {
    title: "Get recent extra activities",
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

export default async function getRecentExtraActivities(
  { date, activity }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve extra activities.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your extra activities.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  let query = supabase
    .from("fittrack_extra_activities")
    .select(
      "date,activity,intensity,duration_minutes,notes,time,calories,created_at,updated_at",
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

  if (activity !== undefined) {
    query = query.ilike("activity", `%${escapeLikeFragment(activity)}%`);
  }

  const { data, error } = await query;

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated extra-activity query was rejected.",
        },
      ],
    };
  }

  const filters = {
    ...(date ? { date } : {}),
    ...(activity !== undefined ? { activityContains: activity } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No extra activities matched ${JSON.stringify(filters)} for the authenticated user.`
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
