import { type ToolExtraArguments, type ToolMetadata } from "xmcp";

import {
  createBearerChallenge,
  getOAuthSecuritySchemes,
} from "../lib/oauth";
import { createSupabaseClient } from "../lib/supabase";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get-todays-fittrack-summary",
  description:
    "Get all of the authenticated user's FitTrack records for today (UTC) in one call, including meals, gym sessions, extra activities, weight entries, and waist entries. This tool takes no input.",
  annotations: {
    title: "Get today's FitTrack summary",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function getTodaysFitTrackSummary(
  _input: Record<string, never>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve today's FitTrack summary.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve today's summary.",
          ),
        ],
      },
    };
  }

  const date = new Date().toISOString().slice(0, 10);
  const supabase = createSupabaseClient(accessToken);

  const [meals, gymSessions, extraActivities, weightEntries, waistEntries] =
    await Promise.all([
      supabase
        .from("fittrack_meals")
        .select("food,calories,protein,carbs,time,date,created_at")
        .eq("date", date)
        .order("created_at", { ascending: false }),
      supabase
        .from("fittrack_gym_sessions")
        .select(
          "exercise,duration,date,notes,start_time,end_time,created_at,updated_at",
        )
        .eq("date", date)
        .order("created_at", { ascending: false }),
      supabase
        .from("fittrack_extra_activities")
        .select(
          "date,activity,intensity,duration_minutes,notes,time,calories,created_at,updated_at",
        )
        .eq("date", date)
        .order("created_at", { ascending: false }),
      supabase
        .from("fittrack_weight")
        .select("weight,date,notes,created_at")
        .eq("date", date)
        .order("created_at", { ascending: false }),
      supabase
        .from("fittrack_waist")
        .select("waist,date,notes,created_at")
        .eq("date", date)
        .order("created_at", { ascending: false }),
    ]);

  const results = {
    meals,
    gymSessions,
    extraActivities,
    weightEntries,
    waistEntries,
  };
  const failedCategories = Object.entries(results)
    .filter(([, result]) => result.error !== null)
    .map(([category]) => category);

  if (failedCategories.length > 0) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `The authenticated daily query was rejected for: ${failedCategories.join(", ")}.`,
        },
      ],
    };
  }

  const summary = {
    date,
    timezone: "UTC",
    meals: meals.data ?? [],
    gymSessions: gymSessions.data ?? [],
    extraActivities: extraActivities.data ?? [],
    weightEntries: weightEntries.data ?? [],
    waistEntries: waistEntries.data ?? [],
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(summary, null, 2),
      },
    ],
    structuredContent: summary,
  };
}
