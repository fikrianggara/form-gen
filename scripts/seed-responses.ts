/**
 * Seed dummy responses for a questionnaire so report/export views have data.
 *
 * Usage:
 *   npm run db:seed-responses                 # default: customer-feedback, 14 responses
 *   npm run db:seed-responses -- <slug> <count>
 *
 * The script goes through the real engine (createResponse + saveResponse) so
 * visibility rules, required validation, aggregates and progress are computed
 * exactly as in production. Response timestamps are backdated across the last
 * 14 days so the report's daily chart has a realistic spread.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getQuestionnaireConfig } from "@/services/response.service";
import {
  createResponse,
  saveResponse,
} from "@/services/response.service";
import { evaluateVisibility } from "@/domain/rules/visibility";
import type { AnswerValue } from "@/domain/types";
import type { ConfigQuestion } from "@/lib/types";
import type { QuestionnaireConfig } from "@/lib/types";

const DEFAULT_SLUG = "customer-feedback";
const DEFAULT_COUNT = 14;

const FIRST = [
  "Budi", "Siti", "Agus", "Dewi", "Rizky", "Ayu", "Andi", "Rina", "Fajar",
  "Lina", "Hendra", "Nina", "Dedi", "Putri", "Eko", "Maya", "Yudi", "Sri",
  "Bagus", "Wulan", "Dimas", "Ratna", "Arief", "Indah", "Galih", "Sari",
];
const LAST = [
  "Santoso", "Rahayu", "Pratama", "Wijaya", "Saputra", "Hidayat", "Kusuma",
  "Nugroho", "Utami", "Setiawan", "Lestari", "Susanto", "Permata",
  "Ramadhan", "Fauzi", "Anggraini", "Suryana", "Puspita", "Maulana",
  "Handayani",
];
const CITIES = [
  "Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Semarang", "Medan",
  "Makassar", "Denpasar", "Palembang", "Malang", "Bogor", "Tangerang",
];
const COMMENTS = [
  "Pelayanan sangat baik",
  "Cepat dan mudah digunakan",
  "Perlu perbaikan di bagian pengiriman",
  "Pengalaman yang memuaskan",
  "Aplikasi mudah dipahami",
  "Harga cukup bersaing",
  "Tingkatkan kualitas produk",
  "Respon cepat dan ramah",
  "Sangat direkomendasikan",
  "Masih perlu penyempurnaan",
  "Fitur lengkap, tampilan rapi",
  "Sesuai ekspektasi",
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]): T => arr[rand(arr.length)];
const randInt = (min: number, max: number) => min + rand(max - min + 1);

function randName(): string {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

function randEmail(): string {
  return `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${randInt(1, 99)}@gmail.com`;
}

function randDate(withinDays = 90): string {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, withinDays));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function randBackdated(withinDays = 14): Date {
  const d = new Date();
  d.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  d.setDate(d.getDate() - randInt(0, withinDays));
  return d;
}

/** Plausible random value for one question, guided by its code/title. */
function answerFor(q: ConfigQuestion): AnswerValue {
  const type = q.questionMaster.questionType;
  const text = `${q.questionMaster.title} ${q.questionMaster.code}`.toLowerCase();

  switch (type) {
    case "NUMBER": {
      if (/idr|amount|price|total|expenditure|pengeluaran|budget/.test(text)) {
        return randInt(5, 200) * 100_000;
      }
      if (/age|umur/.test(text)) return randInt(18, 60);
      if (/dependen|tanggungan|child|anak/.test(text)) return randInt(0, 4);
      const min = q.questionMaster.minValue ?? 1;
      const max = q.questionMaster.maxValue ?? 100;
      return randInt(min, max);
    }
    case "RATING": {
      return randInt(1, q.questionMaster.ratingMax ?? 5);
    }
    case "DATE":
      return randDate();
    case "CHECKBOX": {
      const items = q.options?.items ?? [];
      if (items.length === 0) return pick(["a", "b", "c"]);
      const count = randInt(1, Math.min(3, items.length));
      const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, count);
      return shuffled.map((o) => o.value);
    }
    case "RADIO":
    case "SELECT": {
      const items = q.options?.items ?? [];
      if (items.length === 0) return pick(["option-a", "option-b"]);
      return pick(items).value;
    }
    case "TEXT":
    case "TEXTAREA":
    default: {
      if (/name|nama/.test(text)) return randName();
      if (/email/.test(text)) return randEmail();
      if (/city|kota|domisili/.test(text)) return pick(CITIES);
      if (/phone|hp|telp|wa/.test(text)) return `08${randInt(100000000, 999999999)}`;
      if (/comment|note|saran|feedback|kritik|alasan|reason/.test(text)) {
        return pick(COMMENTS);
      }
      return `${pick(COMMENTS).split(" ")[0]} ${pick(LAST)}`;
    }
  }
}

async function seed(slug: string, count: number): Promise<void> {
  const config = await getQuestionnaireConfig(slug);
  if (!config) {
    console.error(`Questionnaire "${slug}" not found.`);
    process.exit(1);
  }
  if (config.status !== "ACTIVE") {
    console.error(`Questionnaire "${slug}" is ${config.status} — responses can only be created for ACTIVE questionnaires.`);
    process.exit(1);
  }

  const topLevel = config.questions.filter((q) => q.parentId === null);
  let completedCount = 0;
  let draftCount = 0;

  for (let i = 0; i < count; i++) {
    const label = randName();
    const response = await createResponse(config.id, randomUUID(), label);
    const answers: Array<{ questionId: string; value: AnswerValue }> = [];
    const groups: Array<{ parentQuestionId: string; rows: Array<Array<{ questionId: string; value: AnswerValue }>> }> = [];
    const flat: Record<string, AnswerValue> = {};
    const isCompleted = Math.random() < 0.7; // ~70% completed, rest partial drafts

    for (const q of topLevel) {
      const visible = evaluateVisibility(q.visibilityRule, flat);
      if (!visible) continue;

      if (q.isAggregate) continue; // computed by the server

      if (q.isRepeatable) {
        const rowCount = randInt(1, 3);
        const rows: Array<Array<{ questionId: string; value: AnswerValue }>> = [];
        for (let r = 0; r < rowCount; r++) {
          const row: Array<{ questionId: string; value: AnswerValue }> = [];
          for (const child of config.questions.filter((c) => c.parentId === q.id)) {
            if (child.isAggregate) continue;
            const value = answerFor(child);
            row.push({ questionId: child.id, value });
            if (flat[child.id] === undefined) flat[child.id] = value;
          }
          rows.push(row);
        }
        groups.push({ parentQuestionId: q.id, rows });
        continue;
      }

      // Drafts answer a random subset so progress varies; completed answer all.
      if (!isCompleted && Math.random() < 0.4) continue;
      const value = answerFor(q);
      answers.push({ questionId: q.id, value });
      flat[q.id] = value;
    }

    await saveResponse(response.id, {
      status: isCompleted ? "SUBMITTED" : "DRAFT",
      answers,
      groups,
    });

    // Backdate so the report's daily chart spreads across the last two weeks.
    const backdated = randBackdated();
    await db.response.update({
      where: { id: response.id },
      data: {
        createdAt: backdated,
        completedAt: isCompleted ? new Date(backdated.getTime() + randInt(2, 60) * 60_000) : null,
      },
    });

    if (isCompleted) completedCount++;
    else draftCount++;
  }

  console.log(
    `Seeded ${count} responses for "${config.title}" (${completedCount} completed, ${draftCount} drafts).`
  );
}

const slug = process.argv[2] ?? DEFAULT_SLUG;
const count = Number(process.argv[3] ?? DEFAULT_COUNT);
seed(slug, count)
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
