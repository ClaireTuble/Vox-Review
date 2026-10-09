import express from "express";
import cors from "cors";
import healthRoutes from "./routes/healthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userActivityRoutes from "./routes/userActivityRoutes.js";
import userProfileRoutes from "./routes/userProfileRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";
import nlpRoutes from "./routes/nlpRoutes.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "7mb" }));

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user/activity", userActivityRoutes);
app.use("/api/user", userProfileRoutes);
app.use("/api/user", verificationRoutes);
app.use("/api/nlp", nlpRoutes);

// Test Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 VoxReview Backend API is running!",
    version: "1.0.0",
  });
});

export default app;