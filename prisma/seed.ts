/**
 * Seed script: demo users, master data, option sets (static + external API),
 * and two questionnaires exercising rules, repeatable groups and aggregates.
 *
 * Run: npm run db:seed
 * Idempotent: masters/option sets upsert; demo questionnaires are replaced.
 */
import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { AggregateConfig, VisibilityRule } from "@/domain/types";

const db = new PrismaClient();

async function main() {
  // ---- users -------------------------------------------------------------
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  await db.user.upsert({
    where: { email: "admin@formgen.app" },
    update: { role: "ADMIN", isActive: true },
    create: {
      email: "admin@formgen.app",
      name: "System Admin",
      passwordHash,
      role: "ADMIN",
    },
  });
  await db.user.upsert({
    where: { email: "operator@formgen.app" },
    update: { role: "OPERATOR", isActive: true },
    create: {
      email: "operator@formgen.app",
      name: "Survey Operator",
      passwordHash,
      role: "OPERATOR",
    },
  });

  // ---- option sets ---------------------------------------------------------
  const genderSet = await upsertOptionSet("Gender", [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
    { label: "Prefer not to say", value: "other" },
  ]);
  const hobbiesSet = await upsertOptionSet("Hobbies", [
    { label: "Reading", value: "reading" },
    { label: "Sports", value: "sports" },
    { label: "Music", value: "music" },
    { label: "Gaming", value: "gaming" },
    { label: "Travel", value: "travel" },
  ]);
  const occupationSet = await upsertOptionSet("Occupation", [
    { label: "Student", value: "student" },
    { label: "Employee", value: "employee" },
    { label: "Self-employed", value: "self_employed" },
    { label: "Unemployed", value: "unemployed" },
    { label: "Retired", value: "retired" },
  ]);
  const yesNoSet = await upsertOptionSet("Yes / No", [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ]);
  const externalSet = await (async () => {
    const existing = await db.optionSet.findFirst({
      where: { name: "External Demo Users", isLatest: true },
    });
    if (existing) return existing;
    return db.optionSet.create({
      data: {
        name: "External Demo Users",
        version: 1,
        isLatest: true,
        source: "EXTERNAL_API",
        apiUrl: "https://jsonplaceholder.typicode.com/users",
        apiMethod: "GET",
        apiHeaders: {},
        itemsPath: "",
      },
    });
  })();

  // ---- question masters -----------------------------------------------------
  const masters = {
    name: await upsertMaster("q_name", {
      title: "Full name",
      description: "Your full legal name",
      questionType: "TEXT",
      requiredDefault: true,
      placeholder: "e.g. Fikri Anggara",
      maxLength: 200,
    }),
    email: await upsertMaster("q_email", {
      title: "Email address",
      questionType: "TEXT",
      requiredDefault: true,
      placeholder: "you@example.com",
      maxLength: 200,
    }),
    age: await upsertMaster("q_age", {
      title: "Age",
      questionType: "NUMBER",
      minValue: 0,
      maxValue: 120,
    }),
    dob: await upsertMaster("q_dob", {
      title: "Date of birth",
      questionType: "DATE",
    }),
    gender: await upsertMaster("q_gender", {
      title: "Gender",
      questionType: "RADIO",
      requiredDefault: true,
      optionSetId: genderSet.id,
    }),
    hobbies: await upsertMaster("q_hobbies", {
      title: "Hobbies",
      description: "Select all that apply",
      questionType: "CHECKBOX",
      optionSetId: hobbiesSet.id,
    }),
    occupation: await upsertMaster("q_occupation", {
      title: "Occupation",
      questionType: "SELECT",
      requiredDefault: true,
      optionSetId: occupationSet.id,
    }),
    satisfaction: await upsertMaster("q_satisfaction", {
      title: "Overall satisfaction",
      questionType: "RATING",
      requiredDefault: true,
      ratingMax: 5,
    }),
    comment: await upsertMaster("q_comment", {
      title: "Additional comments",
      questionType: "TEXTAREA",
      maxLength: 2000,
    }),
    hasDependents: await upsertMaster("q_has_dependents", {
      title: "Do you have dependents?",
      questionType: "RADIO",
      requiredDefault: true,
      optionSetId: yesNoSet.id,
    }),
    dependentsCount: await upsertMaster("q_dependents_count", {
      title: "How many dependents?",
      questionType: "NUMBER",
      minValue: 1,
      maxValue: 50,
    }),
    expenseItem: await upsertMaster("q_expense_item", {
      title: "Expense item",
      questionType: "TEXT",
      placeholder: "e.g. Groceries",
      maxLength: 200,
    }),
    expenseAmount: await upsertMaster("q_expense_amount", {
      title: "Amount (IDR)",
      questionType: "NUMBER",
      requiredDefault: true,
      minValue: 0,
    }),
    expenseTotal: await upsertMaster("q_expense_total", {
      title: "Total expenditure (computed)",
      description: "Automatically summed from the rows above",
      questionType: "NUMBER",
    }),
    externalUser: await upsertMaster("q_external_user", {
      title: "External contact (live API)",
      description: "Options are fetched from jsonplaceholder.typicode.com",
      questionType: "SELECT",
      optionSetId: externalSet.id,
    }),
  };

  // ---- questionnaires -------------------------------------------------------
  await replaceDemoQuestionnaire("customer-feedback", "Customer Feedback Survey", async (q) => {
    await db.questionnaire.update({
      where: { id: q.id },
      data: {
        title: "Customer Feedback Survey",
        description: "Help us improve our service. Takes about 3 minutes.",
        status: "ACTIVE",
        acceptMultipleResponses: true,
      },
    });

    const qName = await addQ(q.id, masters.name, { required: true });
    const qEmail = await addQ(q.id, masters.email, { required: true });
    const qAge = await addQ(q.id, masters.age);
    const qDob = await addQ(q.id, masters.dob);
    const qGender = await addQ(q.id, masters.gender, { required: true });
    const qHobbies = await addQ(q.id, masters.hobbies);
    const qOccupation = await addQ(q.id, masters.occupation, { required: true });
    const qSatisfaction = await addQ(q.id, masters.satisfaction, { required: true });
    const qComment = await addQ(q.id, masters.comment);
    const qHasDependents = await addQ(q.id, masters.hasDependents, { required: true });
    // Conditional: only shown when the respondent answered "yes" to dependents.
    const qDependentsCount = await addQ(q.id, masters.dependentsCount, {
      visibilityRule: {
        condition: "ALL",
        rules: [{ dependsOnQuestionId: qHasDependents.id, operator: "EQ", value: "yes" }],
      },
    });
    // Repeatable group: expense rows.
    const qExpenseGroup = await addQ(q.id, masters.expenseItem, {
      isRepeatable: true,
      titleOverride: "Monthly expenses",
      descriptionOverride: "Add each expense as a separate row",
    });
    const qExpenseAmount = await addQ(q.id, masters.expenseAmount, {
      parentId: qExpenseGroup.id,
      required: true,
    });
    // Aggregate: sum of all amount rows.
    const qExpenseTotal = await addQ(q.id, masters.expenseTotal, {
      isAggregate: true,
      aggregateConfig: { type: "SUM", sourceQuestionId: qExpenseAmount.id },
    });
    // External API options.
    await addQ(q.id, masters.externalUser);

    return { qName, qEmail, qAge, qDob, qGender, qHobbies, qOccupation, qSatisfaction, qComment, qHasDependents, qDependentsCount, qExpenseGroup, qExpenseAmount, qExpenseTotal };
  });

  await replaceDemoQuestionnaire("registration-form", "One-Time Registration", async (q) => {
    await db.questionnaire.update({
      where: { id: q.id },
      data: {
        title: "One-Time Registration",
        description: "This form accepts a single response per visitor.",
        status: "ACTIVE",
        acceptMultipleResponses: false,
      },
    });
    await addQ(q.id, masters.name, { required: true });
    await addQ(q.id, masters.email, { required: true });
    await addQ(q.id, masters.occupation, { required: true });
    await addQ(q.id, masters.satisfaction, { required: true });
  });

  console.log("Seed complete.");
  console.log("  Users:      admin@formgen.app / operator@formgen.app (password: ChangeMe123!)");
  console.log("  Forms:      /f/customer-feedback  /f/registration-form");
}

// ---------------------------------------------------------------- helpers

async function upsertOptionSet(
  name: string,
  options: Array<{ label: string; value: string }>
) {
  const existing = await db.optionSet.findFirst({ where: { name, isLatest: true } });
  if (existing) return existing;
  return db.optionSet.create({
    data: {
      name,
      version: 1,
      isLatest: true,
      source: "STATIC",
      options: { create: options.map((o, i) => ({ ...o, order: i })) },
    },
  });
}

async function upsertMaster(
  code: string,
  data: {
    title: string;
    questionType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "RADIO" | "CHECKBOX" | "SELECT" | "RATING";
    description?: string;
    requiredDefault?: boolean;
    placeholder?: string;
    minValue?: number;
    maxValue?: number;
    maxLength?: number;
    ratingMax?: number;
    optionSetId?: string;
  }
) {
  const existing = await db.questionMaster.findFirst({ where: { code, isLatest: true } });
  if (existing) return existing;
  return db.questionMaster.create({
    data: { code, version: 1, isLatest: true, ...data },
  });
}

async function addQ(
  questionnaireId: string,
  master: { id: string; requiredDefault: boolean },
  opts: {
    required?: boolean;
    parentId?: string;
    visibilityRule?: VisibilityRule | null;
    isRepeatable?: boolean;
    isAggregate?: boolean;
    aggregateConfig?: AggregateConfig | null;
    titleOverride?: string;
    descriptionOverride?: string;
  } = {}
) {
  return db.questionnaireQuestion.create({
    data: {
      questionnaireId,
      questionMasterId: master.id,
      required: opts.required ?? master.requiredDefault,
      parentId: opts.parentId ?? null,
      visibilityRule: opts.visibilityRule
        ? (opts.visibilityRule as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      isRepeatable: opts.isRepeatable ?? false,
      isAggregate: opts.isAggregate ?? false,
      aggregateConfig: opts.aggregateConfig
        ? (opts.aggregateConfig as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      order: (await db.questionnaireQuestion.count({ where: { questionnaireId } })) + 1,
    },
  });
}

/** Replace (delete + recreate) a demo questionnaire by slug so reseeding refreshes it. */
async function replaceDemoQuestionnaire(
  slug: string,
  _fallbackTitle: string,
  build: (q: { id: string }) => Promise<unknown>
) {
  const existing = await db.questionnaire.findUnique({ where: { slug } });
  if (existing) {
    await db.questionnaire.delete({ where: { id: existing.id } });
  }
  const q = await db.questionnaire.create({
    data: { title: _fallbackTitle, slug, status: "DRAFT" },
  });
  await build(q);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
