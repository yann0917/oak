// FSRS 间隔重复调度封装：卡状态（review_cards）与流水（review_logs）分离，
// 全部数据以 ISO 文本落库，进出 ts-fsrs 时在 Date 与字符串间转换。
import { Rating, createEmptyCard, fsrs, generatorParameters, type Card } from "ts-fsrs";

// ts-fsrs 未单独导出 Grade（只有 Grades 常量），这里本地推导
type Grade = Exclude<Rating, Rating.Manual>;
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { notes, reviewCards, reviewLogs } from "@/db/schema";

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9, // 目标 90% 记住率
    enable_fuzz: true, // 打散同一天到期的卡
  })
);

type CardRow = typeof reviewCards.$inferSelect;

function rowToCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as Card["state"],
    last_review: row.lastReview ? new Date(row.lastReview) : undefined,
  };
}

function cardToValues(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
}

// 新建笔记时发一张空卡（当卡已存在则跳过，幂等）
export function createCardIfAbsent(noteId: number, userId: number) {
  const exists = db.select({ noteId: reviewCards.noteId }).from(reviewCards).where(eq(reviewCards.noteId, noteId)).get();
  if (exists) return;
  const card = createEmptyCard(new Date());
  db.insert(reviewCards).values({ noteId, userId, ...cardToValues(card), lastReview: null }).run();
}

// 今日/到期待复习队列（仅 enabled 的笔记）
export function getDueCards(userId: number, now = new Date()) {
  return db
    .select({
      noteId: reviewCards.noteId,
      title: notes.title,
      source: notes.source,
      question: notes.question,
      answer: notes.answer,
      enabled: notes.enabled,
    })
    .from(reviewCards)
    .innerJoin(notes, eq(reviewCards.noteId, notes.id))
    .where(and(eq(reviewCards.userId, userId), eq(notes.enabled, 1), lte(reviewCards.due, now.toISOString())))
    .orderBy(reviewCards.due)
    .all();
}

export interface RateResult {
  nextDue: string;
  scheduledDays: number;
  deltaDays: number; // 距下次复习的间隔天数（不足 1 天按 <1 描述，由前端处理）
}

// 复习评分：写回新卡状态 + 记流水，返回下一次到期时间
export function rateCard(noteId: number, rating: Rating): RateResult {
  const row = db.select().from(reviewCards).where(eq(reviewCards.noteId, noteId)).get();
  if (!row) throw new Error("复习卡不存在");
  const now = new Date();
  const next = scheduler.repeat(rowToCard(row), now)[rating as Grade].card;
  const nextDue = next.due.toISOString();
  const state = next.state;
  db.transaction((tx) => {
    tx.update(reviewCards)
      .set({ ...cardToValues(next), lastReview: now.toISOString() })
      .where(eq(reviewCards.noteId, noteId))
      .run();
    tx.insert(reviewLogs)
      .values({
        noteId,
        userId: row.userId,
        rating,
        state,
        due: nextDue,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsed_days,
        scheduledDays: next.scheduled_days,
        reviewedAt: now.toISOString(),
      })
      .run();
  });
  return { nextDue, scheduledDays: next.scheduled_days, deltaDays: Math.round((next.due.getTime() - now.getTime()) / 86400000) };
}

// 四个评分按钮的间隔预览：如「良好：7 天后」
export function previewIntervals(noteId: number, now = new Date()): { rating: Rating; due: string; days: number }[] {
  const row = db.select().from(reviewCards).where(eq(reviewCards.noteId, noteId)).get();
  if (!row) return [];
  const results = scheduler.repeat(rowToCard(row), now);
  return ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]).map((r) => {
    const c = results[r].card;
    return { rating: r as Rating, due: c.due.toISOString(), days: Math.round((c.due.getTime() - now.getTime()) / 86400000) };
  });
}
