import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string) {
  if (!isoDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

const calendarDate = z
  .string()
  .refine(isCalendarDate, "必须使用真实的 YYYY-MM-DD 日历日期");

export const postMetaSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  publishedAt: calendarDate,
  updatedAt: calendarDate.optional(),
  tags: z.array(z.string().trim().min(1)).min(1),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
  series: z.string().trim().min(1).optional(),
});
