require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");
const rewardRoutes = require("./routes/rewards");

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
    console.error("Error: JWT_SECRET is missing from the .env file.");
    process.exit(1);
}

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173"
    })
);

app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "GuessGold API is running successfully!"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/rewards", rewardRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found."
    });
});

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        success: false,
        message: "An internal server error occurred."
    });
});

app.listen(PORT, () => {
    console.log(`GuessGold server running at http://localhost:${PORT}`);
});