const express = require("express");
const db = require("../database");
const { authenticate } = require("./auth");

const router = express.Router();

// Get all available rewards
router.get("/", authenticate, (req, res, next) => {
    try {
        const rewards = db.prepare(`
            SELECT id, name, description, points_required
            FROM rewards
            ORDER BY points_required ASC
        `).all();

        res.json({
            success: true,
            rewards
        });
    } catch (error) {
        next(error);
    }
});

// Redeem a reward using points
router.post("/redeem", authenticate, (req, res, next) => {
    try {
        const { rewardId } = req.body;

        if (
            !Number.isSafeInteger(rewardId) ||
            rewardId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid reward ID."
            });
        }

        const redeemReward = db.transaction(() => {
            const reward = db.prepare(`
                SELECT id, name, points_required
                FROM rewards
                WHERE id = ?
            `).get(rewardId);

            if (!reward) {
                return {
                    status: 404,
                    message: "Reward not found."
                };
            }

            const user = db.prepare(`
                SELECT id, points
                FROM users
                WHERE id = ?
            `).get(req.user.id);

            if (!user) {
                return {
                    status: 404,
                    message: "User not found."
                };
            }

            if (user.points < reward.points_required) {
                return {
                    status: 400,
                    message: "You do not have enough points."
                };
            }

            // Deduct points and record redemption atomically.
            const update = db.prepare(`
                UPDATE users
                SET points = points - ?
                WHERE id = ? AND points >= ?
            `).run(
                reward.points_required,
                req.user.id,
                reward.points_required
            );

            if (update.changes !== 1) {
                return {
                    status: 400,
                    message: "Not enough points to redeem this reward."
                };
            }

            db.prepare(`
                INSERT INTO redeemed_rewards
                    (user_id, reward_id, points_spent)
                VALUES (?, ?, ?)
            `).run(
                req.user.id,
                reward.id,
                reward.points_required
            );

            const updatedUser = db.prepare(`
                SELECT points FROM users WHERE id = ?
            `).get(req.user.id);

            return {
                status: 200,
                message: "Reward redeemed successfully!",
                reward: {
                    id: reward.id,
                    name: reward.name
                },
                remainingPoints: updatedUser.points
            };
        });

        const result = redeemReward();

        if (result.status !== 200) {
            return res.status(result.status).json({
                success: false,
                message: result.message
            });
        }

        res.json({
            success: true,
            message: result.message,
            reward: result.reward,
            remainingPoints: result.remainingPoints
        });
    } catch (error) {
        next(error);
    }
});

// Get the user's redeemed rewards
router.get("/my-rewards", authenticate, (req, res, next) => {
    try {
        const rewards = db.prepare(`
            SELECT
                rr.id,
                r.name,
                r.description,
                rr.points_spent,
                rr.redeemed_at
            FROM redeemed_rewards rr
            JOIN rewards r ON r.id = rr.reward_id
            WHERE rr.user_id = ?
            ORDER BY rr.id DESC
        `).all(req.user.id);

        res.json({
            success: true,
            rewards
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;