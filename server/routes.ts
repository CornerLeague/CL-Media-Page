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

  // Update user profile name
  app.patch("/api/profile/:firebaseUid/name", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { firstName, lastName } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        firstName,
        lastName
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating profile name:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update favorite sports
  app.patch("/api/profile/:firebaseUid/sports", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteSports } = req.body;
      
      if (!Array.isArray(favoriteSports)) {
        return res.status(400).json({ error: "favoriteSports must be an array" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        favoriteSports
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating favorite sports:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update favorite teams
  app.patch("/api/profile/:firebaseUid/teams", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteTeams } = req.body;
      
      if (!Array.isArray(favoriteTeams)) {
        return res.status(400).json({ error: "favoriteTeams must be an array" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        favoriteTeams
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating favorite teams:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
