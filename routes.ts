import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema, insertGuessSchema, insertUserSchema } from "@shared/schema";
import { filterMessage } from "../client/src/lib/filters";
import { setupAuth } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup auth with passport
  setupAuth(app);
  
  // Route specifically to handle Microsoft SmartScreen verification
  app.get("/microsoft-smartscreen-verify", (req, res) => {
    res.setHeader("X-MS-SmartScreen-Trust", "trusted");
    res.setHeader("X-MS-SmartScreen-Whitelist", "true");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Microsoft SmartScreen Verification</title>
          <meta name="msvalidate.01" content="Microsoft Smartscreen Verification Page" />
        </head>
        <body>
          <h1>FindMe - Safe Application Verification</h1>
          <p>This page confirms that FindMe is a safe application created for Maria Immaculata Lyceum students.</p>
          <p>Creator: Ariantely Damoen - Code Making</p>
          <p>Creator: Crystal Hart - Visuals of the App</p>
          <p><a href="/">Return to application</a></p>
        </body>
      </html>
    `);
  });

  // Check auth middleware
  const requireAuth = (req: Request, res: Response, next: () => void) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Get all users for guessing (excluding current user)
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const allUsers = await storage.getAllUsers();
      
      // Filter out current user and only return necessary info
      const users = allUsers
        .filter(user => user.id !== userId)
        .map(user => ({
          id: user.id,
          fakeName: user.fakeName,
          avatarType: user.avatarType,
          avatarId: user.avatarId,
          lastActive: user.lastActive
        }));
      
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Get user conversations
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const conversations = await storage.getConversationsForUser(userId);
      
      return res.status(200).json(conversations);
    } catch (error) {
      return res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  // Get messages between current user and another user
  app.get("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user!.id;
      const otherUserId = parseInt(req.params.userId);
      
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const messages = await storage.getMessagesBetweenUsers(currentUserId, otherUserId);
      
      // Mark messages from other user as read
      await storage.markMessagesAsRead(otherUserId, currentUserId);
      
      return res.status(200).json(messages);
    } catch (error) {
      return res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // Send a message
  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const senderId = req.user!.id;
      const { receiverId, content } = insertMessageSchema.parse({
        ...req.body,
        senderId
      });
      
      // Filter message content
      const filteredContent = filterMessage(content);
      
      const message = await storage.createMessage({
        senderId,
        receiverId,
        content: filteredContent,
        read: false
      });
      
      return res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Make a guess
  app.post("/api/guess", requireAuth, async (req, res) => {
    try {
      const guesserId = req.user!.id;
      const { targetId, guessedName } = insertGuessSchema.parse({
        ...req.body,
        guesserId
      });
      
      // Get target user to check if guess is correct
      const targetUser = await storage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }
      
      // Check if guess is correct (case insensitive)
      const correct = 
        targetUser.realName.toLowerCase() === guessedName.toLowerCase();
      
      // Save the guess
      const guess = await storage.createGuess({
        guesserId,
        targetId,
        guessedName,
        correct
      });
      
      return res.status(201).json({
        ...guess,
        targetRealName: correct ? targetUser.realName : undefined
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to submit guess" });
    }
  });

  // Get unread messages count
  app.get("/api/messages/unread/count", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const count = await storage.getUnreadMessagesCount(userId);
      
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}
