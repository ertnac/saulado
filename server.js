const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { Groq } = require('groq-sdk');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
// --- CONFIGURATION ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false } // Required for most cloud DBs
});
// const db = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: '', // Default XAMPP password is empty
//     database: 'saulado_db'
// });

db.connect(err => {
    if (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
    } else {
        console.log('✅ MySQL Connected & AI Backend Ready');
    }
});

// --- DECK API ---

// Fetch Full Library (Recursive Tree)
app.get('/api/library', (req, res) => {
    const deckQuery = 'SELECT * FROM decks';
    const cardQuery = 'SELECT * FROM cards ORDER BY order_val ASC';

    db.query(deckQuery, (err, decks) => {
        if (err) return res.status(500).json(err);

        db.query(cardQuery, (err, cards) => {
            if (err) return res.status(500).json(err);

            const buildTree = (parentId = null) => {
                return decks
                    .filter(d => d.parent_id === parentId)
                    .map(d => ({
                        ...d,
                        cards: cards.filter(c => c.deck_id === d.id),
                        subDecks: buildTree(d.id)
                    }));
            };
            res.json(buildTree(null));
        });
    });
});

// Create Deck (Main or Sub)
app.post('/api/decks', (req, res) => {
    const { name, parent_id } = req.body;
    db.query('INSERT INTO decks (name, parent_id) VALUES (?, ?)', [name, parent_id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ id: result.insertId });
    });
});

// Delete Deck (Cascade deletes subdecks and cards)
app.delete('/api/decks/:id', (req, res) => {
    db.query('DELETE FROM decks WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

// --- CARD API ---

// Create Card
app.post('/api/cards', (req, res) => {
    const { deck_id, html, order_val } = req.body;
    db.query('INSERT INTO cards (deck_id, html, order_val) VALUES (?, ?, ?)',
        [deck_id, html, order_val], (err) => {
            if (err) return res.status(500).json(err);
            res.sendStatus(200);
        });
});

// Delete Single Card
app.delete('/api/cards/:id', (req, res) => {
    db.query('DELETE FROM cards WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

// Delete All Cards in a specific deck
app.delete('/api/decks/:id/cards', (req, res) => {
    db.query('DELETE FROM cards WHERE deck_id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.sendStatus(200);
    });
});

// Update Mastery Stats (Track Progress)
app.put('/api/cards/:id/track', (req, res) => {
    const { isCorrect } = req.body;
    const correctIncrement = isCorrect ? 1 : 0;

    db.query(
        'UPDATE cards SET attempt_count = attempt_count + 1, correct_count = correct_count + ? WHERE id = ?',
        [correctIncrement, req.params.id],
        (err) => {
            if (err) return res.status(500).json(err);
            res.sendStatus(200);
        }
    );
});

// --- AI TYPO TOLERANCE ---

app.post('/verify', async (req, res) => {
    const { userAnswer, correctAnswer } = req.body;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a quiz checker. Compare the user's answer to the correct answer. If it is a minor typo, sounds similar, or represents the same person/place/concept, return JSON: {\"isCorrect\": true}. Otherwise, return {\"isCorrect\": false}. Return only valid JSON."
                },
                {
                    role: "user",
                    content: `Correct Answer: "${correctAnswer}", User's Answer: "${userAnswer}"`
                }
            ],
            model: "llama-3.1-8b-instant",
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(chatCompletion.choices[0].message.content);
        console.log(`AI Check: "${userAnswer}" for "${correctAnswer}" -> ${result.isCorrect}`);
        res.json(result);
    } catch (error) {
        console.error('Groq Error:', error.message);
        // Fallback to exact match if AI fails
        const fallback = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
        res.json({ isCorrect: fallback });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});