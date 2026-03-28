import React, { useState, useEffect, useRef } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import confetti from "canvas-confetti";
import * as mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
ChartJS.register(ArcElement, Tooltip, Legend);

const API_URL = "https://saulado.onrender.com";

function App() {
  // --- CORE STATE ---
  const [library, setLibrary] = useState([]);
  const [activeDeck, setActiveDeck] = useState(null);
  const [expandedDecks, setExpandedDecks] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(null);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Sidebar State

  // Magic & UI State
  const [magicText, setMagicText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const editorRef = useRef(null);

  // Quiz Engine State
  const [quizQueue, setQuizQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [quizPhase, setQuizPhase] = useState("asking");
  const [quizMode, setQuizMode] = useState("type");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [mistakesQueue, setMistakesQueue] = useState([]);
  const [cardLimit, setCardLimit] = useState(0);
  const [studyFilter, setStudyFilter] = useState("all");

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/library`);
      const data = await res.json();
      setLibrary(data);
      if (data.length > 0 && !activeDeck) setActiveDeck(data[0]);
      if (activeDeck) {
        const updated = findDeck(activeDeck.id, data);
        setActiveDeck(updated || (data.length > 0 ? data[0] : null));
      }
    } catch (e) {
      console.error("Backend offline");
    }
  };

  // --- NAVIGATION & UTILS ---
  const findDeck = (id, list) => {
    for (let d of list) {
      if (d.id === id) return d;
      if (d.subDecks) {
        let f = findDeck(id, d.subDecks);
        if (f) return f;
      }
    }
    return null;
  };

  const findParentDeck = (parentId, list) => {
    for (let d of list) {
      if (d.id === parentId) return d;
      if (d.subDecks) {
        let f = findParentDeck(parentId, d.subDecks);
        if (f) return f;
      }
    }
    return null;
  };

  const handleBack = () => {
    if (!activeDeck || !activeDeck.parent_id) return;
    const parent = findParentDeck(activeDeck.parent_id, library);
    if (parent) setActiveDeck(parent);
  };

  const getAllCardsRecursively = (deck) => {
    if (!deck) return [];
    let cards = [...deck.cards];
    if (deck.subDecks)
      deck.subDecks.forEach(
        (sub) => (cards = [...cards, ...getAllCardsRecursively(sub)]),
      );
    return cards;
  };

  const calculateMastery = (cards) => {
    if (cards.length === 0) return 0;
    let totalPct = 0;
    cards.forEach((c) => {
      if (c.attempt_count > 0) totalPct += c.correct_count / c.attempt_count;
    });
    return Math.round((totalPct / cards.length) * 100);
  };

  const getAnswerFromHtml = (html) => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.querySelector(".answer-highlight")?.innerText || "";
  };

  // --- EDITOR TOOLS ---
  const toggleHighlight = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let parent = sel.anchorNode.parentNode;
    if (parent.classList.contains("answer-highlight")) {
      const text = parent.innerText;
      parent.replaceWith(document.createTextNode(text));
    } else {
      const span = document.createElement("span");
      span.className = "answer-highlight";
      try {
        range.surroundContents(span);
      } catch (e) {
        console.error("Invalid Selection");
      }
    }
  };

  const formatAsBulletedList = () => {
    const rawText = editorRef.current.innerText;
    if (!rawText.trim()) return;
    const lines = rawText.split("\n");
    let formattedHtml = "";
    lines.forEach((line) => {
      let cleanLine = line.trim();
      if (!cleanLine) return;
      if (!cleanLine.includes(":") && !cleanLine.includes(" - ")) {
        formattedHtml += `<div>${cleanLine}</div>`;
        return;
      }
      cleanLine = cleanLine.replace(/^[•\*-]\s*/, "");
      let sepIdx = -1;
      let sepLen = 0;
      const colonIdx = cleanLine.indexOf(":");
      const hyphenIdx = cleanLine.indexOf(" - ");
      if (colonIdx !== -1 && (hyphenIdx === -1 || colonIdx < hyphenIdx)) {
        sepIdx = colonIdx;
        sepLen = 1;
      } else if (hyphenIdx !== -1) {
        sepIdx = hyphenIdx;
        sepLen = 3;
      }
      if (sepIdx !== -1) {
        const term = cleanLine.substring(0, sepIdx).trim();
        const definition = cleanLine.substring(sepIdx + sepLen).trim();
        formattedHtml += `<div>• <span class="answer-highlight">${term}</span>${sepLen === 1 ? ":" : " -"} ${definition}</div>`;
      } else {
        formattedHtml += `<div>• <span class="answer-highlight">${cleanLine}</span></div>`;
      }
    });
    editorRef.current.innerHTML = formattedHtml;
  };

  const saveCard = async () => {
    const html = editorRef.current.innerHTML;
    const plainText = editorRef.current.innerText.trim();
    if (!plainText || !activeDeck) return;

    const tempId = Date.now();
    const newCard = {
      id: tempId,
      deck_id: activeDeck.id,
      html,
      order_val: tempId,
      correct_count: 0,
      attempt_count: 0,
    };
    setActiveDeck((prev) => ({ ...prev, cards: [...prev.cards, newCard] }));
    editorRef.current.innerHTML = "";

    try {
      await fetch(`${API_URL}/api/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deck_id: activeDeck.id,
          html,
          order_val: tempId,
        }),
      });
      fetchLibrary();
    } catch (error) {
      fetchLibrary();
    }
  };

  const editCard = async (card) => {
    if (
      editorRef.current.innerText.trim() !== "" &&
      !confirm("Overwrite editor?")
    )
      return;
    editorRef.current.innerHTML = card.html;
    await fetch(`${API_URL}/api/cards/${card.id}`, { method: "DELETE" });
    fetchLibrary();
    editorRef.current.focus();
  };

  const handleCreateDeck = async (parentId = null) => {
    if (!newDeckName) return;
    const res = await fetch(`${API_URL}/api/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeckName, parent_id: parentId }),
    });
    const data = await res.json();
    setNewDeckName("");
    setIsModalOpen(null);
    if (parentId) expandedDecks.add(parentId);
    await fetchLibrary();
  };

  const shuffleCards = () => {
    if (!activeDeck) return;
    const shuffled = [...activeDeck.cards].sort(() => Math.random() - 0.5);
    setActiveDeck({ ...activeDeck, cards: shuffled });
  };

  const resetOrder = () => {
    if (!activeDeck) return;
    const ordered = [...activeDeck.cards].sort(
      (a, b) => a.order_val - b.order_val,
    );
    setActiveDeck({ ...activeDeck, cards: ordered });
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    let text = "";
    if (ext === "txt") text = await file.text();
    else if (ext === "docx") {
      const result = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer(),
      });
      text = result.value;
    } else if (ext === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((s) => s.str).join(" ") + "\n";
      }
    }
    setMagicText(text);
  };

  const processMagic = async () => {
    setIsImporting(true);
    const lines = magicText.split("\n");
    const baseTime = Date.now();
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim().replace(/^[•\*-]\s*/, "");
      if (!line) continue;
      let sepIdx = -1;
      let sepLen = 0;
      const colonIdx = line.indexOf(": ");
      const hyphenIdx = line.indexOf(" - ");
      if (colonIdx !== -1 && (hyphenIdx === -1 || colonIdx < hyphenIdx)) {
        sepIdx = colonIdx;
        sepLen = 2;
      } else if (hyphenIdx !== -1) {
        sepIdx = hyphenIdx;
        sepLen = 3;
      }
      if (sepIdx !== -1) {
        const term = line.substring(0, sepIdx).trim();
        const def = line.substring(sepIdx + sepLen).trim();
        if (term && def) {
          await fetch(`${API_URL}/api/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deck_id: activeDeck.id,
              html: `<span class="answer-highlight">${term}</span> - ${def}`,
              order_val: baseTime + i,
            }),
          });
        }
      }
    }
    setMagicText("");
    setIsImporting(false);
    setIsModalOpen(null);
    fetchLibrary();
  };

  const startQuiz = (limit) => {
    let pool = getAllCardsRecursively(activeDeck);
    if (studyFilter === "new") pool = pool.filter((c) => c.attempt_count === 0);
    if (pool.length === 0) return alert("No cards match your filter!");

    const shuffled = [...pool]
      .sort(() => 0.5 - Math.random())
      .slice(0, limit || pool.length);
    setQuizQueue(shuffled);
    setCurrentIdx(0);
    setCorrectCount(0);
    setStreak(0);
    setSessionHistory([]);
    setMistakesQueue([]);
    setQuizMode("type");
    setQuizPhase("asking");
    setIsQuizOpen(true);
    setIsModalOpen(null);
  };

  const submitAnswer = async (userVal) => {
    const card = quizQueue[currentIdx];
    const correct = getAnswerFromHtml(card.html);
    const temp = document.createElement("div");
    temp.innerHTML = card.html;

    setQuizPhase("checking");
    try {
      const res = await fetch(`${API_URL}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAnswer: userVal, correctAnswer: correct }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      handleResult(data.isCorrect, userVal, correct, temp.innerText, card.id);
    } catch (e) {
      handleResult(
        userVal.trim().toLowerCase() === correct.trim().toLowerCase(),
        userVal,
        correct,
        temp.innerText,
        card.id,
      );
    }
  };

  const handleResult = (isCorrect, userVal, correct, promptText, cardId) => {
    fetch(`${API_URL}/api/cards/${cardId}/track`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCorrect }),
    });
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setStreak((s) => s + 1);
      confetti({ particleCount: 30, spread: 50 });
    } else {
      setStreak(0);
      setMistakesQueue((prev) => [...prev, quizQueue[currentIdx]]);
    }
    setSessionHistory((prev) => [
      ...prev,
      {
        prompt: promptText.replace(correct, "_______"),
        correct,
        user: userVal,
        isCorrect,
      },
    ]);
    setQuizPhase("feedback");
  };

  const generateDecoys = (correct) => {
    const allAnswers = [
      ...new Set(quizQueue.map((c) => getAnswerFromHtml(c.html))),
    ].filter((a) => a && a !== correct);
    return [
      correct,
      ...allAnswers.sort(() => 0.5 - Math.random()).slice(0, 3),
    ].sort(() => 0.5 - Math.random());
  };

  const renderSidebarDecks = (decks, level = 0) => {
    return decks.map((deck) => (
      <div key={deck.id}>
        <div
          onClick={() => {
            setActiveDeck(deck);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
          }}
          className={`group flex items-center justify-between px-4 py-3 md:py-2 rounded-xl cursor-pointer mb-1 transition-all ${activeDeck?.id === deck.id ? "bg-indigo-50 text-indigo-700 font-bold shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          style={{ marginLeft: `${level * 12}px` }}
        >
          <div className="flex items-center truncate">
            {deck.subDecks?.length > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const n = new Set(expandedDecks);
                  n.has(deck.id) ? n.delete(deck.id) : n.add(deck.id);
                  setExpandedDecks(n);
                }}
                className={`mr-2 transition-transform text-[10px] ${expandedDecks.has(deck.id) ? "rotate-90" : ""}`}
              >
                ▶
              </span>
            )}
            <span className="truncate">{deck.name}</span>
          </div>
        </div>
        {expandedDecks.has(deck.id) &&
          deck.subDecks &&
          renderSidebarDecks(deck.subDecks, level + 1)}
      </div>
    ));
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#f8fafc] font-jakarta relative">
      {/* MOBILE SIDEBAR OVERLAY */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col shrink-0 shadow-sm`}
      >
        <div className="p-8 text-center">
          <div className="text-3xl mb-2">🦉</div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tighter mb-6 uppercase">
            SAULADO<span className="text-indigo-600">.AI</span>
          </h1>
          <button
            onClick={() => setIsModalOpen("mainDeck")}
            className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-700"
          >
            + Collection
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 pb-10 custom-scroll text-sm">
          {renderSidebarDecks(library)}
        </nav>
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative overflow-hidden w-full">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b flex items-center justify-between px-4 md:px-10 shrink-0 z-20 gap-2">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 bg-slate-100 rounded-lg md:hidden text-slate-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            {activeDeck?.parent_id && (
              <button
                onClick={handleBack}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div className="truncate">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-tight truncate">
                {activeDeck?.name || "Select Collection"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModalOpen("magic")}
              className="bg-amber-400 text-white p-2.5 md:px-5 rounded-xl text-[10px] md:text-xs font-black shadow-sm uppercase whitespace-nowrap"
            >
              ✨ <span className="hidden md:inline">Magic Import</span>
            </button>
            <button
              onClick={() => {
                setCardLimit(getAllCardsRecursively(activeDeck).length);
                setIsModalOpen("settings");
              }}
              className="bg-slate-900 text-white p-2.5 md:px-8 rounded-xl text-[10px] md:text-xs font-black shadow-xl uppercase whitespace-nowrap"
            >
              🚀 <span className="hidden md:inline">Simulan Na!</span>
              <span className="md:hidden">Start</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scroll">
          {activeDeck ? (
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-24">
              {/* Mastery */}
              <div className="bg-white p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border shadow-sm">
                <div className="flex justify-between items-center mb-2 text-[10px] font-black text-slate-400 uppercase">
                  Knowledge Mastery{" "}
                  <span className="text-indigo-600">
                    {calculateMastery(getAllCardsRecursively(activeDeck))}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-1000"
                    style={{
                      width: `${calculateMastery(getAllCardsRecursively(activeDeck))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Subfolders */}
              <section>
                <div className="flex justify-between items-center mb-4 ml-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                    Sub-Folders
                  </h3>
                  <button
                    onClick={() => setIsModalOpen("subDeck")}
                    className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full font-bold hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    + SUB-DECK
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  {activeDeck.subDecks?.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => setActiveDeck(sub)}
                      className="bg-white p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 cursor-pointer hover:border-indigo-400 text-center transition-all group shadow-sm"
                    >
                      <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">
                        📂
                      </div>
                      <h4 className="text-[10px] font-bold uppercase truncate">
                        {sub.name}
                      </h4>
                    </div>
                  ))}
                </div>
              </section>

              {/* Editor */}
              <section className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border shadow-sm">
                <div
                  ref={editorRef}
                  contentEditable
                  placeholder="Type or paste here..."
                  className="w-full min-h-[80px] md:min-h-[100px] text-lg md:text-xl outline-none mb-6 empty:before:content-[attr(placeholder)] empty:before:text-slate-300 leading-relaxed"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={toggleHighlight}
                    className="flex-1 md:flex-none bg-indigo-50 text-indigo-600 px-4 py-3 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all"
                  >
                    ✨ Highlight
                  </button>
                  <button
                    onClick={formatAsBulletedList}
                    className="flex-1 md:flex-none bg-amber-50 text-amber-600 px-4 py-3 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all"
                  >
                    • Bullet List
                  </button>
                  <button
                    onClick={saveCard}
                    className="w-full md:flex-1 bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-xs shadow-lg uppercase"
                  >
                    Save Card
                  </button>
                </div>
              </section>

              {/* Card List Controls */}
              <section>
                <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-3 px-2">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                    Reviewer Cards
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={shuffleCards}
                      className="text-[9px] md:text-[10px] bg-slate-50 text-slate-400 px-3 py-1.5 rounded-full font-bold hover:bg-slate-200"
                    >
                      Shuffle
                    </button>
                    <button
                      onClick={resetOrder}
                      className="text-[9px] md:text-[10px] bg-slate-50 text-slate-400 px-3 py-1.5 rounded-full font-bold hover:bg-slate-200"
                    >
                      Default
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Clear cards?")) {
                          await fetch(
                            `${API_URL}/api/decks/${activeDeck.id}/cards`,
                            { method: "DELETE" },
                          );
                          fetchLibrary();
                        }
                      }}
                      className="text-[9px] md:text-[10px] bg-rose-50 text-rose-500 px-3 py-1.5 rounded-full font-bold hover:bg-rose-500 hover:text-white uppercase"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete deck?")) {
                          await fetch(`${API_URL}/api/decks/${activeDeck.id}`, {
                            method: "DELETE",
                          });
                          setActiveDeck(null);
                          fetchLibrary();
                        }
                      }}
                      className="text-[9px] md:text-[10px] bg-rose-50 text-rose-500 px-3 py-1.5 rounded-full font-bold hover:bg-rose-500 hover:text-white uppercase"
                    >
                      Del Deck
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {activeDeck.cards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-white p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border relative group transition-all hover:shadow-md"
                    >
                      <div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => editCard(card)}
                          className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`${API_URL}/api/cards/${card.id}`, {
                              method: "DELETE",
                            });
                            fetchLibrary();
                          }}
                          className="p-2 bg-rose-50 text-rose-500 rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                      <div
                        className="text-slate-700 leading-relaxed pr-12 text-sm md:text-base"
                        dangerouslySetInnerHTML={{ __html: card.html }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
              <div className="text-7xl mb-4">🦉</div>
              <p className="font-bold uppercase text-xs tracking-widest">
                Select a collection to start
              </p>
            </div>
          )}
        </div>
      </main>

      {/* QUIZ OVERLAY */}
      {isQuizOpen && (
        <div className="fixed inset-0 bg-[#f8fafc] z-[60] flex flex-col items-center justify-center p-4 md:p-6 overflow-y-auto custom-scroll">
          <div className="absolute top-4 md:top-8 left-4 md:left-8 flex items-center gap-4">
            <button
              onClick={() => setIsQuizOpen(false)}
              className="font-black text-slate-400 text-[10px] uppercase tracking-widest"
            >
              ← EXIT
            </button>
            <div className="bg-white px-3 py-1.5 rounded-xl border font-black text-orange-500 shadow-sm text-xs">
              🔥 {streak}
            </div>
          </div>

          {quizPhase !== "results" ? (
            <div className="w-full max-w-2xl text-center mt-12 md:mt-0">
              <div className="text-5xl md:text-7xl mb-6 transition-transform">
                {quizPhase === "feedback"
                  ? sessionHistory[currentIdx]?.isCorrect
                    ? "🎓"
                    : "✍️"
                  : quizPhase === "checking"
                    ? "🧐"
                    : "🦉"}
              </div>
              <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 transition-all">
                <div className="text-lg md:text-2xl font-bold text-slate-800 mb-8 md:mb-10 leading-relaxed">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: quizQueue[currentIdx]?.html.replace(
                        /<span class="answer-highlight">.*?<\/span>/g,
                        '<span class="text-indigo-500 font-black border-b-2 px-2">_______</span>',
                      ),
                    }}
                  />
                </div>
                {quizPhase === "asking" && (
                  <div className="space-y-6">
                    {quizMode === "type" ? (
                      <input
                        autoFocus
                        className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 text-center text-lg md:text-xl font-bold outline-indigo-500 shadow-sm"
                        placeholder="Type answer..."
                        onKeyUp={(e) =>
                          e.key === "Enter" && submitAnswer(e.target.value)
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generateDecoys(
                          getAnswerFromHtml(quizQueue[currentIdx].html),
                        ).map((ans, i) => (
                          <button
                            key={i}
                            onClick={() => submitAnswer(ans)}
                            className="p-3 md:p-4 bg-white border-2 border-slate-100 rounded-xl md:rounded-2xl font-bold hover:border-indigo-500 hover:bg-indigo-50 transition-all text-slate-600 text-sm md:text-base"
                          >
                            {ans}
                          </button>
                        ))}
                      </div>
                    )}
                    {quizMode === "type" && (
                      <button
                        onClick={() => setQuizMode("choice")}
                        className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-500"
                      >
                        Hindi sigurado? (Choices)
                      </button>
                    )}
                  </div>
                )}
                {quizPhase === "checking" && (
                  <div className="py-4 font-black text-slate-400 animate-pulse italic uppercase tracking-widest text-xs md:text-sm">
                    Thinking... 🧐
                  </div>
                )}
                {quizPhase === "feedback" && (
                  <div className="space-y-6">
                    <p
                      className={`text-lg md:text-xl font-black ${sessionHistory[currentIdx]?.isCorrect ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {sessionHistory[currentIdx]?.isCorrect
                        ? "Ang galing! ✨"
                        : `Mali! Sagot: ${sessionHistory[currentIdx]?.correct}`}
                    </p>
                    <button
                      onClick={() => {
                        setQuizMode("type");
                        if (currentIdx + 1 < quizQueue.length) {
                          setCurrentIdx((i) => i + 1);
                          setQuizPhase("asking");
                        } else {
                          setQuizPhase("results");
                          confetti({ particleCount: 150, spread: 70 });
                        }
                      }}
                      className="w-full bg-indigo-600 text-white py-4 rounded-xl md:rounded-2xl font-black shadow-lg uppercase"
                    >
                      Next Card →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl py-6 md:py-10">
              <h2 className="text-3xl md:text-4xl font-black text-center mb-8 md:mb-10 text-slate-800 uppercase tracking-tighter">
                Session Complete! 🎉
              </h2>
              <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl mb-8 md:mb-10 text-center relative">
                <div className="w-32 h-32 md:w-48 md:h-48 mx-auto mb-6">
                  <Doughnut
                    data={{
                      labels: ["Tama", "Mali"],
                      datasets: [
                        {
                          data: [correctCount, quizQueue.length - correctCount],
                          backgroundColor: ["#6366f1", "#f1f5f9"],
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={{
                      cutout: "80%",
                      plugins: { legend: { display: false } },
                    }}
                  />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-6 md:pt-8">
                  <span className="text-2xl md:text-4xl font-black text-indigo-600">
                    {Math.round((correctCount / quizQueue.length) * 100)}%
                  </span>
                  <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {correctCount} / {quizQueue.length} Correct
                  </span>
                </div>
              </div>
              {mistakesQueue.length > 0 && (
                <button
                  onClick={() => {
                    setQuizQueue(
                      [...mistakesQueue].sort(() => 0.5 - Math.random()),
                    );
                    setMistakesQueue([]);
                    setCurrentIdx(0);
                    setCorrectCount(0);
                    setStreak(0);
                    setSessionHistory([]);
                    setQuizPhase("asking");
                  }}
                  className="w-full bg-amber-500 text-white py-4 md:py-5 rounded-2xl md:rounded-3xl font-black shadow-xl mb-8 md:mb-10 uppercase text-xs md:text-sm tracking-widest"
                >
                  🎯 Re-study Mistakes
                </button>
              )}
              <div className="space-y-3 mb-10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">
                  Detailed Review
                </h3>
                {sessionHistory.map((item, i) => (
                  <div
                    key={i}
                    className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl border flex flex-col md:flex-row md:justify-between md:items-center shadow-sm gap-2"
                  >
                    <div className="flex-1 md:pr-4">
                      <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">
                        Question
                      </p>
                      <p className="text-sm font-bold text-slate-700 leading-tight">
                        {item.prompt}
                      </p>
                    </div>
                    <div className="text-left md:text-right border-t md:border-t-0 pt-2 md:pt-0">
                      <p
                        className={`text-[9px] font-black uppercase mb-1 ${item.isCorrect ? "text-emerald-500" : "text-rose-400"}`}
                      >
                        {item.isCorrect ? "Correct" : "Incorrect"}
                      </p>
                      <p className="text-sm font-black text-indigo-600">
                        {item.correct}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setIsQuizOpen(false);
                  fetchLibrary();
                }}
                className="w-full bg-slate-900 text-white py-4 md:py-5 rounded-2xl md:rounded-3xl font-black shadow-xl uppercase text-xs md:text-sm tracking-widest"
              >
                Back to Library
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div
            className={`bg-white w-full rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-10 flex flex-col ${isModalOpen === "magic" ? "max-w-xl" : "max-w-sm"}`}
          >
            {isModalOpen === "settings" && (
              <>
                <h3 className="font-black text-xl mb-6 text-center italic uppercase tracking-tighter text-slate-800">
                  Study Settings 🚀
                </h3>
                <div className="flex bg-slate-100 p-1 rounded-xl md:rounded-2xl mb-6">
                  <button
                    onClick={() => setStudyFilter("all")}
                    className={`flex-1 py-2 md:py-3 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs uppercase transition-all ${studyFilter === "all" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
                  >
                    All Cards
                  </button>
                  <button
                    onClick={() => setStudyFilter("new")}
                    className={`flex-1 py-2 md:py-3 rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs uppercase transition-all ${studyFilter === "new" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
                  >
                    New Only
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-black mb-2 text-center">
                  How many cards to answer?
                </p>
                <input
                  type="number"
                  value={cardLimit}
                  onChange={(e) => setCardLimit(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-6 text-center outline-indigo-500"
                />
                <button
                  onClick={() => startQuiz(cardLimit)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase tracking-widest text-xs"
                >
                  Start Study
                </button>
              </>
            )}
            {isModalOpen === "mainDeck" && (
              <>
                <h3 className="text-center font-black mb-6 text-xl">
                  New Collection
                </h3>
                <input
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-4 outline-indigo-500"
                  placeholder="e.g. Science"
                />
                <button
                  onClick={() => handleCreateDeck(null)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase text-xs"
                >
                  Create
                </button>
              </>
            )}
            {isModalOpen === "subDeck" && (
              <>
                <h3 className="text-center font-black mb-6 text-xl">
                  New Sub-Deck
                </h3>
                <input
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="bg-slate-50 p-4 rounded-xl font-bold mb-4 outline-indigo-500"
                  placeholder="e.g. Chapter 1"
                />
                <button
                  onClick={() => handleCreateDeck(activeDeck.id)}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg uppercase text-xs"
                >
                  Add
                </button>
              </>
            )}
            {isModalOpen === "magic" && (
              <>
                <h3 className="font-black text-xl mb-4 italic">
                  Magic Import ✨
                </h3>
                <input
                  type="file"
                  accept=".txt,.docx,.pdf"
                  onChange={handleFileImport}
                  className="mb-4 text-[10px] md:text-xs font-bold text-slate-500"
                />
                <textarea
                  value={magicText}
                  onChange={(e) => setMagicText(e.target.value)}
                  className="w-full h-40 bg-slate-50 border p-4 rounded-xl text-sm mb-6 outline-none font-mono"
                  placeholder="Format: Word - Definition..."
                />
                <button
                  onClick={processMagic}
                  disabled={isImporting}
                  className="bg-amber-500 text-white py-4 rounded-xl font-black shadow-md uppercase text-xs"
                >
                  {isImporting ? "Processing..." : "Generate Reviewer"}
                </button>
              </>
            )}
            <button
              onClick={() => setIsModalOpen(null)}
              className="mt-4 text-slate-400 font-black text-[10px] uppercase hover:text-slate-900 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
