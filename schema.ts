import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  realName: text("real_name").notNull(),
  fakeName: text("fake_name").notNull(),
  age: integer("age").notNull(),
  school: text("school").notNull(),
  classInfo: text("class_info").notNull(),
  avatarType: text("avatar_type").notNull(), // "animal" or "fantasy"
  avatarId: text("avatar_id").notNull(),
  lastActive: timestamp("last_active").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  read: boolean("read").default(false),
});

export const guesses = pgTable("guesses", {
  id: serial("id").primaryKey(),
  guesserId: integer("guesser_id").notNull(),
  targetId: integer("target_id").notNull(),
  guessedName: text("guessed_name").notNull(),
  correct: boolean("correct").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  lastActive: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertGuessSchema = createInsertSchema(guesses).omit({
  id: true,
  timestamp: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertGuess = z.infer<typeof insertGuessSchema>;
export type Guess = typeof guesses.$inferSelect;

// Used for conversations list
export type Conversation = {
  userId: number;
  fakeName: string;
  avatarType: string;
  avatarId: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
};
