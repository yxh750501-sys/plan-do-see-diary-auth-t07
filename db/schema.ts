import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull()
}, (t) => [uniqueIndex("users_username_unique").on(t.username)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull()
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").references(() => users.id),
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

export const dailySpecs = sqliteTable("daily_specs", {
  userId: text("user_id").primaryKey().references(() => users.id),
  question: text("question").notNull(),
  metric: text("metric").notNull(),
  unit: text("unit").notNull(),
  calculationRule: text("calculation_rule").notNull(),
  missingRule: text("missing_rule").notNull(),
  duplicateRule: text("duplicate_rule").notNull(),
  outlierRule: text("outlier_rule").notNull(),
  roundingRule: text("rounding_rule").notNull(),
  weekStart: text("week_start").notNull(),
  planRule: text("plan_rule").notNull(),
  createdAt: text("created_at").notNull()
});

export const dailyEntries = sqliteTable("daily_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kstDate: text("kst_date").notNull(),
  value: real("value").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (t) => [uniqueIndex("daily_entries_user_date").on(t.userId, t.kstDate)]);

export const dailyRuleChanges = sqliteTable("daily_rule_changes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  beforeRule: text("before_rule").notNull(),
  afterRule: text("after_rule").notNull(),
  reason: text("reason").notNull(),
  day1Id: text("day1_id").notNull().references(() => dailyEntries.id),
  day2Id: text("day2_id").notNull().references(() => dailyEntries.id),
  changedAt: text("changed_at").notNull()
}, (t) => [uniqueIndex("daily_rule_changes_user_unique").on(t.userId)]);
