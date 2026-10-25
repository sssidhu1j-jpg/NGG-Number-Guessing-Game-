const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");

const router = express.Router();

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "2h"
        }
    );
}

function authenticate(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    try {
        const token = header.split(" ")[1];

        req.user = jwt.verify(token, process.env.JWT_SECRET);

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Your session is invalid or expired."
        });
    }
}

// Register a new user
router.post("/register", async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Username, email, and password are required."
            });
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (
            cleanUsername.length < 3 ||
            cleanUsername.length > 30
        ) {
            return res.status(400).json({
                success: false,
                message: "Username must be between 3 and 30 characters."
            });
        }

        if (
            cleanEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be between 8 and 72 characters."
            });
        }

        const existingUser = db.prepare(
            "SELECT id FROM users WHERE email = ?"
        ).get(cleanEmail);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const result = db.prepare(`
            INSERT INTO users (username, email, password)
            VALUES (?, ?, ?)
        `).run(cleanUsername, cleanEmail, hashedPassword);

        const user = {
            id: Number(result.lastInsertRowid),
            username: cleanUsername,
            email: cleanEmail,
            points: 0
        };

        res.status(201).json({
            success: true,
            message: "Registration successful!",
            token: createToken(user),
            user
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        next(error);
    }
});

// Log in
router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = db.prepare(`
            SELECT id, username, email, password, points
            FROM users
            WHERE email = ?
        `).get(email.trim().toLowerCase());

        if (
            !user ||
            !(await bcrypt.compare(password, user.password))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        res.json({
            success: true,
            message: "Login successful!",
            token: createToken(user),
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                points: user.points
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get the logged-in user's profile
router.get("/profile", authenticate, (req, res, next) => {
    try {
        const user = db.prepare(`
            SELECT id, username, email, points, created_at
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
module.exports.authenticate = authenticate;