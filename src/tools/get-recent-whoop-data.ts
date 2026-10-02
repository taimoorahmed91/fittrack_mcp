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
      "WHOOP-data month (YYYY-MM) or exact date (YYYY-MM-DD). When omitted, the ten most recent records are returned.",
    ),
};

export const metadata: ToolMetadata = {
  name: "get-recent-whoop-data",
  description:
    "Get up to ten of the authenticated user's latest FitTrack WHOOP records, optionally filtered by month or exact date. Returns recovery, HRV, heart rate, blood oxygen, skin temperature, sleep, strain, and energy metrics.",
  annotations: {
    title: "Get recent WHOOP data",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function getRecentWhoopData(
  { date }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve WHOOP data.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your WHOOP data.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  let query = supabase
    .from("fittrack_whoop_data")
    .select(
      "date,recovery_score,hrv_rmssd_milli,resting_heart_rate,spo2_percentage,skin_temp_celsius,sleep_performance_percentage,sleep_efficiency_percentage,total_in_bed_hours,total_rem_sleep_milli,total_deep_sleep_milli,total_light_sleep_milli,total_awake_time_milli,respiratory_rate,disturbance_count,sleep_cycle_count,strain,kilojoule,average_heart_rate,max_heart_rate,created_at,updated_at,cycle_end_timestamp",
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

  const { data, error } = await query;

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated WHOOP-data query was rejected.",
        },
      ],
    };
  }

  const filters = date ? { date } : {};
  const result = {
    filters,
    entries: data,
  };

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No WHOOP records matched ${JSON.stringify(filters)} for the authenticated user.`
            : JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}
