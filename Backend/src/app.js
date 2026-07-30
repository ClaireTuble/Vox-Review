import express from "express";
import cors from "cors";
import supabase from "./config/supabase.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

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