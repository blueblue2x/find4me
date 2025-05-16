import { users, messages, guesses, type User, type InsertUser, type Message, type InsertMessage, type Guess, type InsertGuess, type Conversation } from "@shared/schema";
import MemoryStore from "memorystore";
import session from "express-session";

const MemoryStoreSession = MemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByRealName(realName: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastActive(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesBetweenUsers(userId1: number, userId2: number): Promise<Message[]>;
  getUnreadMessagesCount(userId: number): Promise<number>;
  markMessagesAsRead(senderId: number, receiverId: number): Promise<void>;
  
  // Guess operations
  createGuess(guess: InsertGuess): Promise<Guess>;
  getGuessesForUser(userId: number): Promise<Guess[]>;
  
  // Conversation operations
  getConversationsForUser(userId: number): Promise<Conversation[]>;
  
  // Session store
  sessionStore: any;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private messages: Map<number, Message>;
  private guesses: Map<number, Guess>;
  private userCurrentId: number;
  private messageCurrentId: number;
  private guessCurrentId: number;
  sessionStore: any;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.guesses = new Map();
    this.userCurrentId = 1;
    this.messageCurrentId = 1;
    this.guessCurrentId = 1;
    this.sessionStore = new MemoryStoreSession({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByRealName(realName: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.realName.toLowerCase() === realName.toLowerCase(),
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const lastActive = new Date();
    const user: User = { ...insertUser, id, lastActive };
    this.users.set(id, user);
    return user;
  }
  
  async updateUserLastActive(id: number): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.lastActive = new Date();
      this.users.set(id, user);
    }
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Message operations
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageCurrentId++;
    const timestamp = new Date();
    const message: Message = { ...insertMessage, id, timestamp };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesBetweenUsers(userId1: number, userId2: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => 
        (message.senderId === userId1 && message.receiverId === userId2) || 
        (message.senderId === userId2 && message.receiverId === userId1)
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  async getUnreadMessagesCount(userId: number): Promise<number> {
    return Array.from(this.messages.values()).filter(
      (message) => message.receiverId === userId && !message.read
    ).length;
  }
  
  async markMessagesAsRead(senderId: number, receiverId: number): Promise<void> {
    for (const [id, message] of this.messages.entries()) {
      if (message.senderId === senderId && message.receiverId === receiverId && !message.read) {
        message.read = true;
        this.messages.set(id, message);
      }
    }
  }

  // Guess operations
  async createGuess(insertGuess: InsertGuess): Promise<Guess> {
    const id = this.guessCurrentId++;
    const timestamp = new Date();
    const guess: Guess = { ...insertGuess, id, timestamp };
    this.guesses.set(id, guess);
    return guess;
  }

  async getGuessesForUser(userId: number): Promise<Guess[]> {
    return Array.from(this.guesses.values()).filter(
      (guess) => guess.guesserId === userId || guess.targetId === userId
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  // Conversation operations
  async getConversationsForUser(userId: number): Promise<Conversation[]> {
    // Get all users the current user has interacted with
    const allMessages = Array.from(this.messages.values());
    const interactedUserIds = new Set<number>();
    
    allMessages.forEach(message => {
      if (message.senderId === userId) {
        interactedUserIds.add(message.receiverId);
      } else if (message.receiverId === userId) {
        interactedUserIds.add(message.senderId);
      }
    });
    
    // Build conversations
    const conversations: Conversation[] = [];
    
    for (const otherUserId of interactedUserIds) {
      const otherUser = await this.getUser(otherUserId);
      if (!otherUser) continue;
      
      // Get conversation messages sorted by timestamp
      const conversationMessages = allMessages
        .filter(m => 
          (m.senderId === userId && m.receiverId === otherUserId) || 
          (m.senderId === otherUserId && m.receiverId === userId))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // Get last message if it exists
      const lastMessage = conversationMessages.length > 0 ? conversationMessages[0] : undefined;
      
      // Count unread messages
      const unreadCount = conversationMessages.filter(m => 
        m.senderId === otherUserId && m.receiverId === userId && !m.read
      ).length;
      
      conversations.push({
        userId: otherUser.id,
        fakeName: otherUser.fakeName,
        avatarType: otherUser.avatarType,
        avatarId: otherUser.avatarId,
        lastMessage: lastMessage?.content,
        lastMessageTime: lastMessage?.timestamp,
        unreadCount
      });
    }
    
    // Sort by most recent message
    return conversations.sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
    });
  }
}

export const storage = new MemStorage();
