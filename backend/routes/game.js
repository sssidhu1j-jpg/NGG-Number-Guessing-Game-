const express = require("express");
const db = require("../database");
const { authenticate } = require("./auth");

const router = express.Router();

const MAX_ATTEMPTS = 10;

// Start a new game
router.post("/start", authenticate, (req, res) => {
    const targetNumber = Math.floor(Math.random() * 100) + 1;

    const result = db.prepare(`
        INSERT INTO games (user_id, target_number)
        VALUES (?, ?)
    `).run(req.user.id, targetNumber);

    res.status(201).json({
        success: true,
        message: "New game started!",
        game: {
            id: Number(result.lastInsertRowid),
            minNumber: 1,
            maxNumber: 100,
            maxAttempts: MAX_ATTEMPTS
        }
    });
});

// Submit a guess
router.post("/guess", authenticate, (req, res) => {
    const { gameId, guess } = req.body;

    if (
        !Number.isSafeInteger(gameId) ||
        gameId <= 0 ||
        !Number.isInteger(guess) ||
        guess < 1 ||
        guess > 100
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide a valid game ID and a number from 1 to 100."
        });
    }

    const game = db.prepare(`
        SELECT id, target_number, attempts, won
        FROM games
        WHERE id = ? AND user_id = ?
    `).get(gameId, req.user.id);

    if (!game) {
        return res.status(404).json({
            success: false,
            message: "Game not found."
        });
    }

    if (game.won || game.attempts >= MAX_ATTEMPTS) {
        return res.status(400).json({
            success: false,
            message: "This game has ended. Start a new game."
        });
    }

    const attempts = game.attempts + 1;
    const won = guess === game.target_number;
    const finished = won || attempts >= MAX_ATTEMPTS;

    // Award points only for a win.
    const pointsEarned = won
        ? Math.max(10, 100 - (attempts - 1) * 10)
        : 0;

    const finishGame = db.transaction(() => {
        db.prepare(`
            UPDATE games
            SET attempts = ?, won = ?, points_earned = ?
            WHERE id = ? AND user_id = ?
        `).run(
            attempts,
            won ? 1 : 0,
            pointsEarned,
            gameId,
            req.user.id
        );

        if (pointsEarned > 0) {
            db.prepare(`
                UPDATE users
                SET points = points + ?
                WHERE id = ?
            `).run(pointsEarned, req.user.id);
        }
    });

    finishGame();

    const response = {
        success: true,
        attempts,
        attemptsRemaining: MAX_ATTEMPTS - attempts,
        finished,
        won,
        pointsEarned
    };

    if (won) {
        response.message = "Correct guess! You won!";
    } else if (finished) {
        response.message = "Game over! Better luck next time.";
        response.correctNumber = game.target_number;
    } else if (guess < game.target_number) {
        response.message = "Too low! Try a higher number.";
    } else {
        response.message = "Too high! Try a lower number.";
    }

    res.json(response);
});

// Get the player's game history
router.get("/history", authenticate, (req, res, next) => {
    try {
        const games = db.prepare(`
            SELECT id, attempts, won, points_earned, created_at
            FROM games
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 50
        `).all(req.user.id);

        res.json({
            success: true,
            games
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;