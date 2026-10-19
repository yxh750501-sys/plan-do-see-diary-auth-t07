import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  priority: integer("priority").notNull(),
  successCriteria: text("success_criteria").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  carryForward: text("carry_forward").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const planRevisions = sqliteTable("plan_revisions", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id),
  version: integer("version").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  changedAt: text("changed_at").notNull()
}, (t) => [uniqueIndex("plan_revisions_plan_version").on(t.planId, t.version)]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  priority: integer("priority").notNull(),
  tag: text("tag").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  status: text("status").notNull().default("doing"),
  completedAt: text("completed_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workLogs = sqliteTable("work_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  actualMinutes: integer("actual_minutes").notNull(),
  blocker: text("blocker").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull()
});

export const completionEvents = sqliteTable("completion_events", {
  taskId: text("task_id").primaryKey().references(() => tasks.id),
  completedAt: text("completed_at").notNull()
});

export const reviewActions = sqliteTable("review_actions", {
  id: text("id").primaryKey(),
  fromPlanId: text("from_plan_id").notNull().references(() => plans.id),
  toPlanId: text("to_plan_id").notNull().references(() => plans.id),
  improvement: text("improvement").notNull(),
  createdAt: text("created_at").notNull()
});
