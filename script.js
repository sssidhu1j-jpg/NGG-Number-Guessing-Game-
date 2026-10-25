"use strict";

// GuessGold: browser-based number guessing game.
// This is a learning demo, not secure authentication.

const $ = (id) => document.getElementById(id);

const STORAGE_KEY   = "guessGoldAccountsV1";
const SESSION_KEY   = "guessGoldCurrentUserV1";

const STARTING_COINS       = 50;
const DAILY_REWARD         = 20;
const CORRECT_REWARD       = 10;
const HINT_COST            = 3;
const FAILED_ROUND_PENALTY = 5;
const MAX_ATTEMPTS         = 3;

let accounts       = loadAccounts();
let currentUsername = null;
let secretNumber   = 0;
let attemptsLeft   = MAX_ATTEMPTS;
let roundNumber    = 1;
let gamesWon       = 0;
let hintUsed       = false;
let roundFinished  = false;
let authMode       = "register";

// ── STORAGE ────────────────────────────────────────────

function loadAccounts() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            return saved;
        }
        return {};
    } catch (error) {
        console.error("Could not load saved accounts:", error);
        return {};
    }
}

function saveAccounts() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    } catch (error) {
        console.error("Could not save accounts:", error);
        setMessage($("gameMessage"), "Unable to save data in this browser.", "error");
    }
}

// ── HELPERS ────────────────────────────────────────────

function normalizeUsername(value) {
    return value.trim().toLowerCase();
}

function getAccount() {
    return currentUsername ? (accounts[currentUsername] || null) : null;
}

function getToday() {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, "0");
    const d   = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function makePlayerId(username) {
    // Simple deterministic short ID from username hash
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) & 0xfffff;
    }
    return "GG-" + String(hash).padStart(6, "0").slice(0, 6);
}

function setMessage(element, text, type = "") {
    if (!element) return;
    element.textContent = text;
    element.className   = "message";
    if (type) element.classList.add(type);
}

// ── HISTORY ────────────────────────────────────────────

function addHistory(text) {
    const account = getAccount();
    if (!account) return;
    account.history.unshift({ text, date: new Date().toLocaleString() });
    account.history = account.history.slice(0, 20);
    saveAccounts();
    renderHistory();
}

// ── COINS ──────────────────────────────────────────────

function updateCoins(change) {
    const account = getAccount();
    if (!account) return;
    account.coins = Math.max(0, account.coins + change);
    saveAccounts();
    renderCoins();
}

function renderCoins() {
    const account = getAccount();
    const bal     = account ? account.coins : 0;

    $("coinBalance").textContent  = bal;
    $("walletBalance").textContent = bal + " coins";
    $("heroCoins").textContent    = bal;
}

// ── HISTORY LIST ───────────────────────────────────────

function renderHistory() {
    const account = getAccount();
    const list    = $("historyList");
    list.replaceChildren();

    if (!account || account.history.length === 0) {
        const li = document.createElement("li");
        li.className   = "empty-history";
        li.textContent = "No games yet. Start guessing!";
        list.appendChild(li);
        return;
    }

    account.history.forEach((entry) => {
        const li   = document.createElement("li");
        const date = document.createElement("small");
        li.appendChild(document.createTextNode(entry.text + " — "));
        date.textContent = entry.date;
        li.appendChild(date);
        list.appendChild(li);
    });
}

// ── AUTH MODE ──────────────────────────────────────────

function setAuthMode(mode) {
    authMode = mode;
    const registering = mode === "register";

    $("authTitle").textContent    = registering ? "Create Your Account" : "Welcome Back";
    $("authSubmit").textContent   = registering ? "Create Account →"    : "Login →";
    $("nameField").hidden         = !registering;
    $("playerName").required      = registering;

    $("showLogin").hidden         = !registering;
    $("showRegister").hidden      = registering;
    $("switchText").textContent   = registering
        ? "Already have an account?"
        : "New to GuessGold?";

    $("password").autocomplete    = registering ? "new-password" : "current-password";

    // Sync tab highlight
    $("tabRegister").classList.toggle("active", registering);
    $("tabLogin").classList.toggle("active", !registering);

    setMessage($("authMessage"), "");
}

// ── SHOW GAME / SHOW AUTH ──────────────────────────────

function showGame() {
    const account = getAccount();
    if (!account) return;

    // Switch pages
    $("authPage").hidden = true;
    $("gamePage").hidden = false;

    // Show nav & topbar items
    $("topbarNav").hidden    = false;
    $("walletTopbar").hidden = false;
    $("userBar").hidden      = false;
    $("freeBadge").hidden    = true;

    // Populate profile info
    const pid = makePlayerId(currentUsername);
    const initial = (account.name || currentUsername).charAt(0).toUpperCase();

    $("heroAvatar").textContent      = initial;
    $("heroWelcomeName").textContent = "Welcome back, " + account.name + "!";
    $("heroGameId").textContent      = "Your game ID: " + pid;
    $("heroWins").textContent        = account.wins || 0;
    $("heroPlayerId").textContent    = pid;

    $("profileAvatar").textContent   = initial;
    $("profileName").textContent     = account.name;
    $("profileUsername").textContent = "@" + currentUsername;
    $("profileId").textContent       = pid;
    $("profileSince").textContent    = account.joinDate || "Today";

    renderCoins();
    renderHistory();
    updateDailyRewardDisplay();
    resetRound();
}

function showLoginScreen() {
    $("authPage").hidden = false;
    $("gamePage").hidden = true;

    $("topbarNav").hidden    = true;
    $("walletTopbar").hidden = true;
    $("userBar").hidden      = true;
    $("freeBadge").hidden    = false;

    $("coinBalance").textContent  = "0";
    $("walletBalance").textContent = "0 coins";

    $("authForm").reset();
    setAuthMode("login");
}

// ── DAILY REWARD ───────────────────────────────────────

function updateDailyRewardDisplay() {
    const account = getAccount();
    if (!account) return;

    const claimed = account.lastDailyReward === getToday();
    $("dailyRewardButton").disabled   = claimed;
    $("dailyRewardButton").textContent = claimed ? "Already Claimed" : "Claim reward →";
    $("dailyStatus").textContent      = claimed
        ? "Available again tomorrow."
        : "Available once per day.";
}

// ── ATTEMPT DOTS ───────────────────────────────────────

function updateAttemptDots() {
    const dots = $("attemptDots").querySelectorAll(".attempt-dot");
    dots.forEach((dot, i) => {
        dot.classList.toggle("active", i < attemptsLeft);
    });
    $("attemptsLeft").textContent = `${attemptsLeft} / ${MAX_ATTEMPTS}`;
}

// ── ROUND MANAGEMENT ───────────────────────────────────

function resetRound() {
    secretNumber  = Math.floor(Math.random() * 10) + 1;
    attemptsLeft  = MAX_ATTEMPTS;
    hintUsed      = false;
    roundFinished = false;

    $("numberDisplay").textContent = "?";
    $("guessInput").value          = "";
    $("guessInput").disabled       = false;
    $("guessButton").disabled      = false;
    $("hintButton").disabled       = false;
    $("newGameButton").hidden      = true;

    $("roundNumber").textContent   = "● ROUND READY";

    updateAttemptDots();
    setMessage($("gameMessage"), "ℹ️ Make your first guess to get started.");
}

function finishRound(message, type = "") {
    roundFinished = true;

    $("numberDisplay").textContent = secretNumber;
    $("guessInput").disabled       = true;
    $("guessButton").disabled      = true;
    $("hintButton").disabled       = true;
    $("newGameButton").hidden      = false;
    $("roundNumber").textContent   = `ROUND ${roundNumber}`;

    setMessage($("gameMessage"), message, type);
}

// ── AUTH FORM SUBMIT ───────────────────────────────────

$("authForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const name     = $("playerName").value.trim();
    const username = normalizeUsername($("username").value);
    const password = $("password").value;

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        setMessage($("authMessage"),
            "Username must be 3–20 letters, numbers, or underscores.", "error");
        return;
    }

    if (password.length < 4) {
        setMessage($("authMessage"),
            "Password must be at least 4 characters.", "error");
        return;
    }

    if (authMode === "register") {
        if (!name) {
            setMessage($("authMessage"), "Please enter your name.", "error");
            return;
        }
        if (accounts[username]) {
            setMessage($("authMessage"),
                "Username already exists. Please log in.", "error");
            return;
        }
        accounts[username] = {
            name,
            password,
            coins: STARTING_COINS,
            wins: 0,
            lastDailyReward: "",
            joinDate: new Date().toLocaleDateString(),
            history: []
        };
        saveAccounts();
    } else {
        const acc = accounts[username];
        if (!acc || acc.password !== password) {
            setMessage($("authMessage"),
                "Incorrect username or password.", "error");
            return;
        }
    }

    currentUsername = username;
    localStorage.setItem(SESSION_KEY, currentUsername);
    $("authForm").reset();
    showGame();
});

// ── AUTH TAB BUTTONS ───────────────────────────────────

$("tabRegister").addEventListener("click", () => {
    $("authForm").reset();
    setAuthMode("register");
});

$("tabLogin").addEventListener("click", () => {
    $("authForm").reset();
    setAuthMode("login");
});

$("showLogin").addEventListener("click", () => {
    $("authForm").reset();
    setAuthMode("login");
});

$("showRegister").addEventListener("click", () => {
    $("authForm").reset();
    setAuthMode("register");
});

// ── LOGOUT ─────────────────────────────────────────────

$("logoutButton").addEventListener("click", () => {
    currentUsername = null;
    localStorage.removeItem(SESSION_KEY);
    showLoginScreen();
});

// ── DAILY REWARD ───────────────────────────────────────

$("dailyRewardButton").addEventListener("click", () => {
    const account = getAccount();
    if (!account) return;

    if (account.lastDailyReward === getToday()) {
        updateDailyRewardDisplay();
        return;
    }

    account.coins += DAILY_REWARD;
    account.lastDailyReward = getToday();
    saveAccounts();
    renderCoins();
    updateDailyRewardDisplay();
    addHistory(`Daily reward claimed: +${DAILY_REWARD} coins`);
    $("dailyStatus").textContent = "✅ You received 20 coins today!";
});

// ── GUESS ──────────────────────────────────────────────

$("guessForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (roundFinished) return;

    const guess = Number($("guessInput").value);

    if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
        setMessage($("gameMessage"),
            "Please enter a whole number from 1 to 10.", "error");
        return;
    }

    attemptsLeft--;
    updateAttemptDots();

    if (guess === secretNumber) {
        updateCoins(CORRECT_REWARD);
        const account = getAccount();
        if (account) {
            account.wins = (account.wins || 0) + 1;
            saveAccounts();
            $("heroWins").textContent = account.wins;
        }
        addHistory(`Round ${roundNumber}: Correct! Number was ${secretNumber}. +${CORRECT_REWARD} coins`);
        finishRound(
            `🎉 Correct! The secret number was ${secretNumber}. You earned ${CORRECT_REWARD} coins!`,
            "success"
        );
        return;
    }

    if (attemptsLeft === 0) {
        updateCoins(-FAILED_ROUND_PENALTY);
        addHistory(`Round ${roundNumber}: Failed. Number was ${secretNumber}. -${FAILED_ROUND_PENALTY} coins`);
        finishRound(
            `Round over! The secret number was ${secretNumber}. You lost ${FAILED_ROUND_PENALTY} coins.`,
            "error"
        );
        return;
    }

    const direction = guess < secretNumber ? "Try a higher number." : "Try a lower number.";
    setMessage($("gameMessage"),
        `❌ Incorrect! ${direction} ${attemptsLeft} attempt(s) remaining.`, "error");

    $("guessInput").value = "";
    $("guessInput").focus();
});

// ── HINT ───────────────────────────────────────────────

$("hintButton").addEventListener("click", () => {
    if (roundFinished || hintUsed) return;

    const account = getAccount();
    if (!account) return;

    if (account.coins < HINT_COST) {
        setMessage($("gameMessage"),
            "You need at least 3 coins to use a hint.", "error");
        return;
    }

    hintUsed = true;
    updateCoins(-HINT_COST);

    const half = secretNumber <= 5 ? "LOWER HALF: 1–5" : "UPPER HALF: 6–10";
    setMessage($("gameMessage"),
        `💡 Hint: The secret number is in the ${half}. You spent ${HINT_COST} coins.`);
    $("hintButton").disabled = true;
    addHistory(`Round ${roundNumber}: Hint used (-${HINT_COST} coins)`);
});

// ── NEW ROUND ──────────────────────────────────────────

$("newGameButton").addEventListener("click", () => {
    if (!roundFinished) return;
    roundNumber++;
    resetRound();
});

// ── CLEAR HISTORY ──────────────────────────────────────

$("clearHistoryButton").addEventListener("click", () => {
    const account = getAccount();
    if (!account) return;
    account.history = [];
    saveAccounts();
    renderHistory();
});

// ── RESTORE SESSION ────────────────────────────────────

const savedUsername = localStorage.getItem(SESSION_KEY);

if (savedUsername && accounts[savedUsername]) {
    currentUsername = savedUsername;
    showGame();
} else {
    localStorage.removeItem(SESSION_KEY);
    setAuthMode("register");
}
