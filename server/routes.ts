import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserProfileSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get user profile by Firebase UID
  app.get("/api/profile/:firebaseUid", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const profile = await storage.getUserProfile(firebaseUid);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create or update user profile
  app.post("/api/profile", async (req, res) => {
    try {
      const validationResult = insertUserProfileSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues 
        });
      }
      
      const data = validationResult.data;
      const existingProfile = await storage.getUserProfile(data.firebaseUid);
      
      let profile;
      if (existingProfile) {
        profile = await storage.updateUserProfile(data.firebaseUid, data);
      } else {
        profile = await storage.createUserProfile(data);
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error creating/updating profile:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark onboarding as complete
  app.put("/api/profile/:firebaseUid/onboarding", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const profile = await storage.updateUserProfile(firebaseUid, {
        onboardingCompleted: true
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating onboarding status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
