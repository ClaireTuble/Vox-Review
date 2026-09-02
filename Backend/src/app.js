import express from "express";
import cors from "cors";
import supabase from "./config/supabase.js";
import healthRoutes from "./routes/healthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userActivityRoutes from "./routes/userActivityRoutes.js";
import userProfileRoutes from "./routes/userProfileRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user/activity", userActivityRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/user", verificationRoutes);

// Test Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 VoxReview Backend API is running!",
    version: "1.0.0",
  });
});

// Supabase Test Route
app.get("/test-db", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      message: "✅ Connected to Supabase!",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default app;