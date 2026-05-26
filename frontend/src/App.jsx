import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

// ── Sound Engine ──────────────────────────────────────────────────────────────
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      success: { freqs: [523, 659, 784], dur: 0.1 },
      error:   { freqs: [300, 200],      dur: 0.15, wave: "sawtooth" },
      click:   { freqs: [900],           dur: 0.04 },
      vote:    { freqs: [440, 554, 659, 880], dur: 0.09 },
    };
    const s = sounds[type] || sounds.click;
    s.freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      o.type = s.wave || "sine";
      const t = ctx.currentTime + i * s.dur;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + s.dur);
      o.start(t); o.stop(t + s.dur);
    });
  } catch {}
};

// ── Particle Canvas ───────────────────────────────────────────────────────────
const Particles = () => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.8 + 0.4,
      dx: (Math.random() - 0.5) * 0.35, dy: (Math.random() - 0.5) * 0.35,
      op: Math.random() * 0.45 + 0.08,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(37,99,235,${p.op})`; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position:"fixed",top:0,left:0,pointerEvents:"none",zIndex:0,opacity:0.6 }} />;
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, []);
  const icons = { success: "✓", error: "✕", info: "i" };
  return (
    <div className={`toast toast-${type}`} onClick={onClose}>
      <span className={`toast-dot dot-${type}`}>{icons[type]}</span>
      <span className="toast-msg">{msg}</span>
      <span className="toast-close">×</span>
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────
const Modal = ({ title, children, onClose }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal-box">
      <div className="modal-header">
        <span className="modal-title">{title}</span>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

// ── Field ─────────────────────────────────────────────────────────────────────
const Field = ({ label, icon, type = "text", value, onChange, placeholder, onKeyDown }) => (
  <div className="field">
    <label className="field-label"><span className="field-ico">{icon}</span>{label}</label>
    <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown}
      placeholder={placeholder} className="field-input" />
  </div>
);

// ── PrimaryBtn ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", disabled = false, loading = false, small = false }) => (
  <button disabled={disabled || loading} onClick={onClick}
    className={`btn btn-${variant}${small ? " btn-small" : ""}${loading ? " btn-loading" : ""}`}>
    {loading ? <span className="spinner" /> : null}
    {children}
  </button>
);

// ── Hash Token ────────────────────────────────────────────────────────────────
const HashCard = ({ token, used, ts }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    playSound("click");
  };
  return (
    <div className={`hash-card ${used ? "hash-used" : "hash-active"}`}>
      <span className={`hash-pill ${used ? "pill-red" : "pill-green"}`}>{used ? "USED" : "ACTIVE"}</span>
      <span className="hash-val">{token.substring(0, 14)}…{token.substring(50)}</span>
      <button className="copy-btn" onClick={copy} title="Copy full token">{copied ? "✓" : "⎘"}</button>
    </div>
  );
};

// ── Candidate Card ────────────────────────────────────────────────────────────
const CandidateCard = ({ c, selected, onSelect }) => (
  <div className={`cand-card ${selected ? "cand-selected" : ""}`}
    onClick={() => { playSound("click"); onSelect(c.id); }}>
    <div className="cand-symbol">{c.symbol || c.name.charAt(0)}</div>
    <div className="cand-name">{c.name}</div>
    <div className="cand-party">{c.party}</div>
    {selected && <div className="cand-check">✓</div>}
  </div>
);

// ── Result Row ────────────────────────────────────────────────────────────────
const ResultRow = ({ r, rank, maxVotes, total }) => {
  const pct = total > 0 ? Math.round(r.votes / total * 100) : 0;
  const barW = maxVotes > 0 ? (r.votes / maxVotes * 100) : 0;
  return (
    <div className={`result-row ${rank === 1 && r.votes > 0 ? "result-leader" : ""}`}>
      <span className="result-rank">#{rank}</span>
      <span className="result-sym">{r.symbol || r.name.charAt(0)}</span>
      <div className="result-info">
        <div className="result-name">{r.name}</div>
        <div className="result-party">{r.party}</div>
        <div className="result-bar-wrap">
          <div className="result-bar" style={{ width: `${barW}%` }} />
        </div>
      </div>
      <div className="result-meta">
        <span className="result-count">{r.votes}</span>
        <span className="result-pct">{pct}%</span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("home");
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyHash, setVerifyHash] = useState("");

  // Data
  const [results, setResults] = useState([]);
  const [hashes, setHashes] = useState([]);
  const [candidates, setCandidates] = useState([]);

  // Forms
  const [reg, setReg] = useState({ voter_id: "", name: "", secret_key: "" });
  const [voteForm, setVote] = useState({ voter_id: "", secret_key: "", candidate_id: null });
  const [reReg, setReReg] = useState({ voter_id: "", name: "", new_secret_key: "" });
  const [adminCreds, setAdminCreds] = useState({ username: "", password: "" });
  const [adminToken, setAdminToken] = useState(null);
  const [adminVoters, setAdminVoters] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [lastHash, setLastHash] = useState(null);
  const [hashSearch, setHashSearch] = useState("");

  const toast = (msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    playSound(type === "success" ? "success" : "error");
  };

  const loadPublic = useCallback(async () => {
    try {
      const [r, h, c] = await Promise.all([
        axios.get(`${API}/results`),
        axios.get(`${API}/eligible-hashes`),
        axios.get(`${API}/candidates`),
      ]);
      setResults(r.data);
      setHashes(h.data);
      setCandidates(c.data);
    } catch {}
  }, []);

  useEffect(() => { loadPublic(); const iv = setInterval(loadPublic, 4000); return () => clearInterval(iv); }, []);

  useEffect(() => { if (adminToken) loadAdminData(); }, [adminToken]);

  const loadAdminData = async () => {
    const h = { Authorization: adminToken };
    try {
      const [v, s] = await Promise.all([
        axios.get(`${API}/admin/voters`, { headers: h }),
        axios.get(`${API}/admin/stats`, { headers: h }),
      ]);
      setAdminVoters(v.data);
      setAdminStats(s.data);
    } catch (e) { toast("Failed to load admin data", "error"); }
  };

  const loadAuditLog = async () => {
    try {
      const r = await axios.get(`${API}/admin/audit-log`, { headers: { Authorization: adminToken } });
      setAuditLog(r.data);
      setShowAudit(true);
    } catch { toast("Could not load audit log", "error"); }
  };

  const doRegister = async () => {
    if (!reg.voter_id.trim() || !reg.name.trim() || !reg.secret_key) return toast("Fill all fields", "error");
    setLoading(true);
    try {
      const r = await axios.post(`${API}/register`, reg);
      setLastHash(r.data.eligibility_hash);
      toast("Registered! Your eligibility token is ready.");
      setReg({ voter_id: "", name: "", secret_key: "" });
    } catch (e) { toast(e.response?.data?.detail || "Registration failed", "error"); }
    setLoading(false);
  };

  const doVote = async () => {
    if (!voteForm.voter_id || !voteForm.secret_key) return toast("Enter your Voter ID and secret key", "error");
    if (!voteForm.candidate_id) return toast("Select a candidate first", "error");
    const cand = candidates.find(c => c.id === voteForm.candidate_id);
    setConfirmModal({
      title: "Confirm Your Vote",
      body: `You are about to vote for ${cand?.name} (${cand?.party}). This action cannot be undone.`,
      action: async () => {
        setLoading(true);
        try {
          await axios.post(`${API}/vote`, voteForm);
          toast("🗳️ Vote cast! Democracy in action.");
          playSound("vote");
          setVote({ voter_id: "", secret_key: "", candidate_id: null });
          loadPublic();
        } catch (e) { toast(e.response?.data?.detail || "Vote failed", "error"); }
        setLoading(false);
      }
    });
  };

  const doReRegister = async () => {
    if (!reReg.voter_id || !reReg.name || !reReg.new_secret_key) return toast("Fill all fields", "error");
    setLoading(true);
    try {
      const r = await axios.post(`${API}/re-register`, reReg);
      setLastHash(r.data.eligibility_hash);
      toast("Re-registered! New token generated.");
      setReReg({ voter_id: "", name: "", new_secret_key: "" });
    } catch (e) { toast(e.response?.data?.detail || "Error", "error"); }
    setLoading(false);
  };

  const doAdminLogin = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/admin/login`, adminCreds);
      setAdminToken(r.data.token);
      toast("Admin access granted");
    } catch { toast("Invalid credentials", "error"); }
    setLoading(false);
  };

  const doDeleteVoter = async (voter_id) => {
    setConfirmModal({
      title: "Delete Voter",
      body: `Permanently delete voter "${voter_id}" and their eligibility token?`,
      danger: true,
      action: async () => {
        try {
          await axios.delete(`${API}/admin/voter/${voter_id}`, { headers: { Authorization: adminToken } });
          toast(`Voter ${voter_id} deleted`);
          loadAdminData();
        } catch (e) { toast(e.response?.data?.detail || "Error", "error"); }
      }
    });
  };

  const doResetElection = async () => {
    setConfirmModal({
      title: "Reset Election",
      body: "This will set ALL votes to zero and reactivate all tokens. Are you absolutely sure?",
      danger: true,
      action: async () => {
        try {
          await axios.post(`${API}/admin/reset-election`, {}, { headers: { Authorization: adminToken } });
          toast("Election reset. All votes cleared.");
          loadAdminData(); loadPublic();
        } catch (e) { toast(e.response?.data?.detail || "Error", "error"); }
      }
    });
  };

  const doVerifyToken = async () => {
    if (!verifyHash.trim()) return toast("Paste a token to verify", "error");
    try {
      const r = await axios.get(`${API}/audit/verify/${verifyHash.trim()}`);
      setVerifyResult(r.data);
    } catch (e) {
      setVerifyResult({ found: false, status: "Token not found in registry" });
    }
  };

  const totalVotes = results.reduce((a, r) => a + r.votes, 0);
  const maxVotes = Math.max(...results.map(r => r.votes), 1);
  const filteredHashes = hashes.filter(h => h.hash_token.includes(hashSearch.toLowerCase()));

  const navItems = [
    { id: "home",    icon: "⬡",  label: "Home"         },
    { id: "register",icon: "✦",  label: "Register"     },
    { id: "vote",    icon: "◉",  label: "Vote"         },
    { id: "rereg",   icon: "↺",  label: "Re-Register"  },
    { id: "tokens",  icon: "⧫",  label: "Tokens"       },
    { id: "audit",   icon: "⊕",  label: "Verify"       },
    { id: "results", icon: "▸",  label: "Results"      },
    { id: "admin",   icon: "⬟",  label: "Admin"        },
  ];

  const enterSubmit = (fn) => (e) => { if (e.key === "Enter") fn(); };

  return (
    <>
      <style>{CSS}</style>
      <Particles />

      {/* Toast Stack */}
      <div className="toast-stack">
        {toasts.map(t => (
          <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => setToasts(ts => ts.filter(x => x.id !== t.id))} />
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <Modal title={confirmModal.title} onClose={() => setConfirmModal(null)}>
          <p className="modal-text">{confirmModal.body}</p>
          <div className="modal-actions">
            <Btn variant="ghost" onClick={() => setConfirmModal(null)}>Cancel</Btn>
            <Btn variant={confirmModal.danger ? "danger" : "primary"} loading={loading}
              onClick={async () => { await confirmModal.action(); setConfirmModal(null); }}>
              Confirm
            </Btn>
          </div>
        </Modal>
      )}

      {/* Audit Log Modal */}
      {showAudit && (
        <Modal title="Audit Log (last 100)" onClose={() => setShowAudit(false)}>
          <div className="audit-scroll">
            {auditLog.length === 0 ? <p className="empty">No events yet.</p> :
              auditLog.map((l, i) => (
                <div key={i} className="audit-row">
                  <span className={`audit-action action-${l.action.toLowerCase().includes("fail") ? "fail" : l.action.toLowerCase().includes("delete") || l.action.toLowerCase().includes("reset") ? "warn" : "ok"}`}>{l.action}</span>
                  <span className="audit-vid">{l.voter_id || "—"}</span>
                  <span className="audit-det">{l.details || ""}</span>
                  <span className="audit-ts">{l.ts ? new Date(l.ts * 1000).toLocaleTimeString() : ""}</span>
                </div>
              ))
            }
          </div>
        </Modal>
      )}

      <div className="app">
        {/* ── Header ── */}
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-mark">⬡</div>
              <div className="logo-text">
                <span className="logo-name">SecureVote</span>
                <span className="logo-sub">Cryptographic Electoral System</span>
              </div>
            </div>
            <div className="header-right">
              <div className="live-dot" />
              <span className="live-txt">LIVE</span>
              <div className="vote-counter">{totalVotes} votes</div>
            </div>
          </div>
          <nav className="nav">
            {navItems.map(n => (
              <button key={n.id} onClick={() => { playSound("click"); setTab(n.id); }}
                className={`nav-btn ${tab === n.id ? "nav-active" : ""}`}>
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-lbl">{n.label}</span>
              </button>
            ))}
          </nav>
        </header>

        <main className="main">

          {/* ── HOME ── */}
          {tab === "home" && (
            <div className="page fade-in">
              <div className="hero">
                <div className="hero-glyph">⬡</div>
                <h1 className="hero-title">Your Vote.<br /><em>Your Voice.</em></h1>
                <p className="hero-sub">SHA-256 cryptographic eligibility · Publicly verifiable · Zero knowledge</p>
                <div className="hero-chips">
                  <div className="chip chip-blue">👥 {totalVotes} Votes Cast</div>
                  <div className="chip chip-violet">⧫ {hashes.length} Tokens</div>
                  <div className="chip chip-indigo">◉ {candidates.length} Candidates</div>
                </div>
                <div className="hero-btns">
                  <Btn onClick={() => setTab("register")}>Register to Vote</Btn>
                  <Btn variant="secondary" onClick={() => setTab("vote")}>Cast Your Vote</Btn>
                </div>
              </div>

              <div className="how-grid">
                {[
                  ["✦", "Register", "Enter Voter ID + secret key. A SHA-256 eligibility token is generated and stored publicly."],
                  ["⊕", "Verify",   "Your token appears in the public registry — provable without revealing your identity."],
                  ["◉", "Vote",     "Use your credentials to vote. Your token is marked 'used', preventing double-voting."],
                  ["▸", "Audit",    "All eligibility tokens are public. Anyone can verify integrity without accessing private data."],
                ].map(([icon, title, desc]) => (
                  <div className="how-card" key={title}>
                    <span className="how-icon">{icon}</span>
                    <strong className="how-title">{title}</strong>
                    <p className="how-desc">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── REGISTER ── */}
          {tab === "register" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">✦</span>
                  <div><h2 className="card-title">Voter Registration</h2><p className="card-sub">Register once. Your eligibility token is created publicly.</p></div>
                </div>
                <Field label="Voter ID" icon="🪪" value={reg.voter_id} onChange={e => setReg({ ...reg, voter_id: e.target.value })} placeholder="e.g. MH2024001" />
                <Field label="Full Name" icon="👤" value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} placeholder="Your legal name" />
                <Field label="Secret Key" icon="🔑" type="password" value={reg.secret_key} onChange={e => setReg({ ...reg, secret_key: e.target.value })} placeholder="Min 4 chars — remember this!" onKeyDown={enterSubmit(doRegister)} />
                <div className="info-box">⚠ Remember your secret key — you will need it to vote.</div>
                <Btn onClick={doRegister} loading={loading}>{loading ? "Registering…" : "Register & Generate Token"}</Btn>

                {lastHash && (
                  <div className="hash-reveal slide-in">
                    <div className="hash-reveal-label">🔗 Your Eligibility Token</div>
                    <div className="hash-reveal-val">{lastHash}</div>
                    <div className="hash-reveal-note">SHA-256(VoterID + SecretKey) — publicly verifiable, not reversible.</div>
                    <button className="copy-full-btn" onClick={() => { navigator.clipboard.writeText(lastHash); toast("Token copied!"); }}>⎘ Copy Token</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── VOTE ── */}
          {tab === "vote" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">◉</span>
                  <div><h2 className="card-title">Cast Your Vote</h2><p className="card-sub">One person, one vote — cryptographically enforced.</p></div>
                </div>
                <Field label="Voter ID" icon="🪪" value={voteForm.voter_id} onChange={e => setVote({ ...voteForm, voter_id: e.target.value })} placeholder="Your registered Voter ID" />
                <Field label="Secret Key" icon="🔑" type="password" value={voteForm.secret_key} onChange={e => setVote({ ...voteForm, secret_key: e.target.value })} placeholder="Your private secret key" />
                <div className="field">
                  <label className="field-label"><span className="field-ico">🏆</span>Choose Your Candidate</label>
                  <div className="cand-grid">
                    {candidates.map(c => (
                      <CandidateCard key={c.id} c={c} selected={voteForm.candidate_id === c.id} onSelect={id => setVote({ ...voteForm, candidate_id: id })} />
                    ))}
                  </div>
                </div>
                <Btn onClick={doVote} variant="success" loading={loading}>{loading ? "Casting…" : "Cast My Vote"}</Btn>
              </div>
            </div>
          )}

          {/* ── RE-REGISTER ── */}
          {tab === "rereg" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">↺</span>
                  <div><h2 className="card-title">Re-Register</h2><p className="card-sub">Forgot your secret key? Reset it — only if you haven't voted yet.</p></div>
                </div>
                <div className="warn-box">🔒 Only works if you have NOT yet voted. Old token will be invalidated.</div>
                <Field label="Voter ID" icon="🪪" value={reReg.voter_id} onChange={e => setReReg({ ...reReg, voter_id: e.target.value })} placeholder="Your Voter ID" />
                <Field label="Full Name" icon="👤" value={reReg.name} onChange={e => setReReg({ ...reReg, name: e.target.value })} placeholder="Your legal name" />
                <Field label="New Secret Key" icon="🔑" type="password" value={reReg.new_secret_key} onChange={e => setReReg({ ...reReg, new_secret_key: e.target.value })} placeholder="New private key" onKeyDown={enterSubmit(doReRegister)} />
                <Btn onClick={doReRegister} variant="warning" loading={loading}>{loading ? "Processing…" : "Re-Register & New Token"}</Btn>
                {lastHash && (
                  <div className="hash-reveal slide-in">
                    <div className="hash-reveal-label">🔗 New Eligibility Token</div>
                    <div className="hash-reveal-val">{lastHash}</div>
                    <button className="copy-full-btn" onClick={() => { navigator.clipboard.writeText(lastHash); toast("Copied!"); }}>⎘ Copy</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TOKENS ── */}
          {tab === "tokens" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">⧫</span>
                  <div><h2 className="card-title">Public Eligibility Tokens</h2><p className="card-sub">All tokens are publicly verifiable. Green = not voted. Red = voted.</p></div>
                </div>
                <div className="token-stats">
                  <div className="tstat"><span className="tstat-v">{hashes.length}</span><span className="tstat-l">Total</span></div>
                  <div className="tstat"><span className="tstat-v green">{hashes.filter(h => !h.used).length}</span><span className="tstat-l">Active</span></div>
                  <div className="tstat"><span className="tstat-v red">{hashes.filter(h => h.used).length}</span><span className="tstat-l">Used</span></div>
                </div>
                <input className="field-input search-input" placeholder="🔍  Search token…" value={hashSearch} onChange={e => setHashSearch(e.target.value)} />
                <div className="hash-list">
                  {filteredHashes.length === 0
                    ? <div className="empty">No tokens found.</div>
                    : filteredHashes.map((h, i) => <HashCard key={i} token={h.hash_token} used={h.used} ts={h.created_at} />)
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── VERIFY / AUDIT ── */}
          {tab === "audit" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">⊕</span>
                  <div><h2 className="card-title">Verify Token</h2><p className="card-sub">Anyone can verify whether an eligibility token has been used — without knowing the voter's identity.</p></div>
                </div>
                <Field label="Token Hash" icon="🔍" value={verifyHash} onChange={e => { setVerifyHash(e.target.value); setVerifyResult(null); }} placeholder="Paste full 64-char SHA-256 token…" onKeyDown={enterSubmit(doVerifyToken)} />
                <Btn onClick={doVerifyToken} variant="secondary">Verify Token</Btn>
                {verifyResult && (
                  <div className={`verify-result ${verifyResult.found ? (verifyResult.used ? "verify-used" : "verify-active") : "verify-notfound"} slide-in`}>
                    <div className="verify-icon">{verifyResult.found ? (verifyResult.used ? "🔴" : "🟢") : "❓"}</div>
                    <div>
                      <div className="verify-status">{verifyResult.found ? (verifyResult.used ? "USED — Vote was cast" : "ACTIVE — Not yet voted") : "NOT FOUND in registry"}</div>
                      {verifyResult.found && <div className="verify-sub">Token is {verifyResult.used ? "marked as used" : "valid and unused"}</div>}
                    </div>
                  </div>
                )}
                <div className="info-box" style={{marginTop:"16px"}}>💡 This proves election integrity without revealing voter identity. The token is SHA-256(VoterID + SecretKey).</div>
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {tab === "results" && (
            <div className="page fade-in">
              <div className="card">
                <div className="card-head">
                  <span className="card-icon">▸</span>
                  <div><h2 className="card-title">Live Election Results</h2><p className="card-sub">Real-time · Auto-refreshes every 4 seconds</p></div>
                </div>
                {results.length === 0
                  ? <div className="empty">No results yet.</div>
                  : results.sort((a, b) => b.votes - a.votes).map((r, i) => (
                    <ResultRow key={r.id} r={r} rank={i + 1} maxVotes={maxVotes} total={totalVotes} />
                  ))
                }
                <div className="results-footer">Total votes cast: <strong>{totalVotes}</strong></div>
              </div>
            </div>
          )}

          {/* ── ADMIN ── */}
          {tab === "admin" && (
            <div className="page fade-in">
              {!adminToken ? (
                <div className="card admin-login-card">
                  <div className="card-head">
                    <span className="card-icon">⬟</span>
                    <div><h2 className="card-title">Admin Access</h2><p className="card-sub">Restricted to authorized personnel.</p></div>
                  </div>
                  <Field label="Username" icon="👤" value={adminCreds.username} onChange={e => setAdminCreds({ ...adminCreds, username: e.target.value })} placeholder="admin" />
                  <Field label="Password" icon="🔒" type="password" value={adminCreds.password} onChange={e => setAdminCreds({ ...adminCreds, password: e.target.value })} placeholder="••••••••" onKeyDown={enterSubmit(doAdminLogin)} />
                  <Btn onClick={doAdminLogin} variant="danger" loading={loading}>{loading ? "Authenticating…" : "Admin Login"}</Btn>
                </div>
              ) : (
                <div>
                  <div className="card">
                    <div className="card-head">
                      <span className="card-icon">⬟</span>
                      <div><h2 className="card-title">Admin Dashboard</h2></div>
                      <button className="logout-btn" onClick={() => setAdminToken(null)}>Logout ×</button>
                    </div>
                    {adminStats && (
                      <div className="admin-stats-grid">
                        {[
                          ["👥", "Total Voters",  adminStats.total_voters,   ""],
                          ["✅", "Voted",          adminStats.voted_count,    "green"],
                          ["⏳", "Pending",        adminStats.pending_count,  "amber"],
                          ["📊", "Turnout",        adminStats.turnout_pct + "%", "blue"],
                          ["🔗", "Tokens",         adminStats.total_tokens,   ""],
                          ["✓",  "Used Tokens",    adminStats.used_tokens,    "green"],
                        ].map(([icon, label, val, color]) => (
                          <div className="astat" key={label}>
                            <div className="astat-icon">{icon}</div>
                            <div className={`astat-val ${color}`}>{val}</div>
                            <div className="astat-label">{label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="admin-actions">
                      <Btn variant="secondary" small onClick={() => { loadAdminData(); toast("Refreshed"); }}>↻ Refresh</Btn>
                      <Btn variant="ghost" small onClick={loadAuditLog}>📋 Audit Log</Btn>
                      <Btn variant="danger" small onClick={doResetElection}>⚠ Reset Election</Btn>
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="section-title">Registered Voters</h3>
                    <div className="info-box">Admin can see Name + Voter ID only. Secret keys are never stored in plain text.</div>
                    <div className="table-wrap">
                      <table className="voter-table">
                        <thead>
                          <tr><th>Voter ID</th><th>Name</th><th>Status</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                          {adminVoters.map(v => (
                            <tr key={v.voter_id} className={v.has_voted ? "row-voted" : ""}>
                              <td className="td-mono">{v.voter_id}</td>
                              <td>{v.name}</td>
                              <td><span className={`badge ${v.has_voted ? "badge-voted" : "badge-pending"}`}>{v.has_voted ? "✓ Voted" : "⏳ Pending"}</span></td>
                              <td><button className="del-btn" onClick={() => doDeleteVoter(v.voter_id)}>✕ Delete</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {adminVoters.length === 0 && <div className="empty">No voters registered yet.</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </main>

        <footer className="footer">
          <span>⬡ SecureVote v2.0 — SHA-256 Cryptographic Eligibility</span>
          <span>Admin: admin / admin@secure2024</span>
        </footer>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Syne:wght@600;700;800&display=swap');

:root {
  --bg:       #F8FAFC;
  --bg2:      #EEF2F7;
  --bg3:      #E8EEF5;
  --card:     #FFFFFF;
  --border:   #E2E8F0;
  --border2:  #CBD5E1;
  --text:     #1E293B;
  --muted:    #64748B;
  --muted2:   #94A3B8;
  --indigo:   #2563EB;
  --indigo2:  #4F46E5;
  --violet:   #4F46E5;
  --blue:     #2563EB;
  --green:    #10B981;
  --red:      #EF4444;
  --amber:    #F59E0B;
  --glow-i:   0 4px 24px #2563EB30;
  --glow-g:   0 4px 24px #10B98130;
  --radius:   14px;
  --shadow:   0 2px 16px #1E293B14;
}

*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
html { scroll-behavior:smooth; }
body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; overflow-x:hidden; -webkit-font-smoothing:antialiased; }

/* ── APP SHELL ── */
.app { position:relative; z-index:1; min-height:100vh; display:flex; flex-direction:column; }

/* ── HEADER ── */
.header {
  background:linear-gradient(135deg, #2563EB 0%, #1E40AF 100%);
  border-bottom:1px solid #1D4ED8;
  position:sticky; top:0; z-index:100;
  box-shadow:0 2px 16px #2563EB30;
}
.header-inner { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; }
.logo { display:flex; align-items:center; gap:12px; }
.logo-mark {
  font-size:1.8rem; color:#ffffff;
  filter:drop-shadow(0 0 8px rgba(255,255,255,0.5));
  animation:pulse-logo 3s ease-in-out infinite;
}
.logo-text { display:flex; flex-direction:column; }
.logo-name { font-family:'Syne',sans-serif; font-size:1.15rem; font-weight:800; color:#ffffff; letter-spacing:-0.3px; }
.logo-sub { font-size:0.68rem; color:rgba(255,255,255,0.7); letter-spacing:0.8px; text-transform:uppercase; }
.header-right { display:flex; align-items:center; gap:10px; }
.live-dot { width:8px; height:8px; border-radius:50%; background:#10B981; box-shadow:0 0 8px #10B981; animation:blink 1.4s ease-in-out infinite; }
.live-txt { font-size:0.72rem; font-weight:600; color:#ffffff; letter-spacing:1.5px; }
.vote-counter { background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); border-radius:100px; padding:4px 12px; font-size:0.78rem; color:#ffffff; font-family:'DM Mono',monospace; }

/* ── NAV ── */
.nav { display:flex; overflow-x:auto; padding:0 16px; gap:2px; scrollbar-width:none; border-top:1px solid rgba(255,255,255,0.15); background:rgba(30,64,175,0.6); }
.nav::-webkit-scrollbar { display:none; }
.nav-btn {
  display:flex; align-items:center; gap:7px;
  padding:10px 14px; border:none; background:transparent;
  color:rgba(255,255,255,0.7); cursor:pointer;
  font-family:'DM Sans',sans-serif; font-size:0.85rem; font-weight:500;
  border-bottom:2px solid transparent;
  transition:color 0.2s, border-color 0.2s, background 0.2s;
  white-space:nowrap;
}
.nav-btn:hover { color:#ffffff; background:rgba(255,255,255,0.1); }
.nav-active { color:#ffffff !important; border-bottom-color:#10B981 !important; }
.nav-icon { font-size:0.95rem; }
.nav-lbl { font-size:0.82rem; }

/* ── MAIN ── */
.main { flex:1; padding:28px 20px; max-width:860px; margin:0 auto; width:100%; }
.page { animation:fadeUp 0.28s ease; }
.fade-in { animation:fadeUp 0.28s ease; }

/* ── HERO ── */
.hero { text-align:center; padding:56px 0 32px; }
.hero-glyph {
  font-size:5.5rem; color:var(--indigo);
  filter:drop-shadow(0 0 24px #2563EB40);
  animation:float 4s ease-in-out infinite;
  display:block; margin-bottom:20px;
}
.hero-title {
  font-family:'Syne',sans-serif; font-size:3rem; font-weight:800; line-height:1.1;
  color:var(--text); margin-bottom:14px; letter-spacing:-1px;
}
.hero-title em {
  font-style:normal;
  background:linear-gradient(135deg,#2563EB,#4F46E5);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
.hero-sub { font-size:0.92rem; color:var(--muted); letter-spacing:0.3px; margin-bottom:28px; }
.hero-chips { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-bottom:28px; }
.chip { padding:6px 16px; border-radius:100px; font-size:0.82rem; font-weight:500; border:1px solid; }
.chip-blue   { background:rgba(37,99,235,0.08);  border-color:rgba(37,99,235,0.25);  color:#2563EB; }
.chip-violet { background:rgba(79,70,229,0.08);  border-color:rgba(79,70,229,0.25);  color:#4F46E5; }
.chip-indigo { background:rgba(37,99,235,0.08);  border-color:rgba(37,99,235,0.25);  color:#1D4ED8; }
.hero-btns { display:flex; justify-content:center; gap:14px; flex-wrap:wrap; }

/* ── HOW IT WORKS ── */
.how-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-top:44px; }
.how-card {
  background:var(--card); border:1px solid var(--border); border-radius:var(--radius);
  padding:22px 18px; transition:border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.how-card:hover { border-color:var(--border2); transform:translateY(-3px); box-shadow:0 8px 24px #2563EB12; }
.how-icon { display:block; font-size:1.5rem; color:var(--indigo); margin-bottom:10px; }
.how-title { display:block; font-family:'Syne',sans-serif; font-size:0.9rem; font-weight:700; color:var(--text); margin-bottom:6px; }
.how-desc { font-size:0.81rem; color:var(--muted); line-height:1.6; }

/* ── CARD ── */
.card { background:var(--card); border:1px solid var(--border); border-radius:20px; padding:28px; margin-bottom:20px; box-shadow:var(--shadow); }
.card-head { display:flex; align-items:flex-start; gap:14px; margin-bottom:24px; }
.card-icon { font-size:1.6rem; color:var(--indigo); flex-shrink:0; padding-top:2px; }
.card-title { font-family:'Syne',sans-serif; font-size:1.25rem; font-weight:700; color:var(--text); }
.card-sub { font-size:0.84rem; color:var(--muted); margin-top:3px; }
.section-title { font-family:'Syne',sans-serif; font-size:1rem; font-weight:700; color:var(--text); margin-bottom:16px; }

/* ── FIELD ── */
.field { margin-bottom:16px; }
.field-label { display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:600; color:var(--muted2); margin-bottom:7px; letter-spacing:0.2px; text-transform:uppercase; }
.field-ico { font-size:0.9rem; }
.field-input {
  width:100%; background:#fff; border:1px solid var(--border); border-radius:10px;
  padding:12px 16px; color:var(--text); font-family:'DM Sans',sans-serif; font-size:0.95rem;
  transition:border-color 0.2s, box-shadow 0.2s; outline:none;
}
.field-input::placeholder { color:var(--muted2); }
.field-input:focus { border-color:var(--indigo); box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
.search-input { margin-bottom:14px; }

/* ── BUTTONS ── */
.btn {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:12px 24px; border:none; border-radius:10px;
  font-family:'DM Sans',sans-serif; font-size:0.9rem; font-weight:600;
  cursor:pointer; transition:all 0.2s; margin-top:8px; position:relative; overflow:hidden;
}
.btn:disabled { opacity:0.5; cursor:not-allowed; }
.btn::after { content:""; position:absolute; inset:0; background:rgba(255,255,255,0); transition:background 0.15s; }
.btn:not(:disabled):hover::after { background:rgba(255,255,255,0.07); }
.btn:not(:disabled):active { transform:scale(0.97); }
.btn-small { padding:8px 16px; font-size:0.82rem; }

.btn-primary  { background:var(--indigo);  color:#fff; box-shadow:var(--glow-i); }
.btn-secondary { background:#fff;    color:var(--indigo); border:1px solid var(--border2); box-shadow:var(--shadow); }
.btn-success  { background:var(--green);   color:#fff; box-shadow:var(--glow-g); }
.btn-warning  { background:var(--amber);   color:#fff; }
.btn-danger   { background:var(--red);     color:#fff; box-shadow:0 4px 16px rgba(239,68,68,0.25); }
.btn-ghost    { background:transparent;    color:var(--muted); border:1px solid var(--border); }

.spinner {
  display:inline-block; width:14px; height:14px;
  border:2px solid rgba(255,255,255,0.3); border-top-color:#fff;
  border-radius:50%; animation:spin 0.7s linear infinite;
}

/* ── INFO/WARN BOXES ── */
.info-box { background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.2); border-radius:10px; padding:12px 16px; font-size:0.83rem; color:#1D4ED8; margin:12px 0; }
.warn-box  { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2);  border-radius:10px; padding:12px 16px; font-size:0.83rem; color:#DC2626; margin:12px 0; }

/* ── HASH REVEAL ── */
.hash-reveal { background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.25); border-radius:12px; padding:18px; margin-top:18px; }
.hash-reveal-label { font-size:0.78rem; font-weight:700; color:#059669; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
.hash-reveal-val { font-family:'DM Mono',monospace; font-size:0.78rem; word-break:break-all; color:var(--text); background:var(--bg3); padding:12px; border-radius:8px; }
.hash-reveal-note { font-size:0.74rem; color:var(--muted); margin-top:10px; }
.copy-full-btn { margin-top:12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); color:#059669; border-radius:8px; padding:7px 14px; cursor:pointer; font-size:0.82rem; transition:background 0.2s; }
.copy-full-btn:hover { background:rgba(16,185,129,0.15); }

/* ── CANDIDATES ── */
.cand-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:10px; }
.cand-card {
  background:var(--bg3); border:2px solid var(--border); border-radius:14px;
  padding:22px 14px; text-align:center; cursor:pointer;
  transition:all 0.2s; position:relative;
}
.cand-card:hover { border-color:var(--border2); transform:translateY(-2px); }
.cand-selected { border-color:var(--green) !important; background:rgba(16,185,129,0.05) !important; box-shadow:0 0 16px rgba(16,185,129,0.15); }
.cand-symbol { font-size:2.2rem; margin-bottom:10px; }
.cand-name { font-family:'Syne',sans-serif; font-size:0.9rem; font-weight:700; color:var(--text); }
.cand-party { font-size:0.74rem; color:var(--muted); margin-top:4px; }
.cand-check { position:absolute; top:8px; right:10px; color:var(--green); font-weight:900; font-size:1.1rem; }

/* ── TOKENS ── */
.token-stats { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
.tstat { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 18px; text-align:center; flex:1; min-width:70px; box-shadow:var(--shadow); }
.tstat-v { display:block; font-family:'Syne',sans-serif; font-size:1.7rem; font-weight:700; color:var(--text); }
.tstat-v.green { color:var(--green); } .tstat-v.red { color:var(--red); }
.tstat-l { font-size:0.73rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; }
.hash-list { display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
.hash-card { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:11px 14px; transition:border-color 0.2s; box-shadow:var(--shadow); }
.hash-active { border-color:rgba(16,185,129,0.3); }
.hash-used   { border-color:rgba(239,68,68,0.2); opacity:0.7; }
.hash-pill { padding:3px 9px; border-radius:100px; font-size:0.7rem; font-weight:700; letter-spacing:0.5px; flex-shrink:0; }
.pill-green { background:rgba(16,185,129,0.12); color:#059669; }
.pill-red   { background:rgba(239,68,68,0.1);  color:var(--red); }
.hash-val { font-family:'DM Mono',monospace; font-size:0.75rem; color:var(--muted); flex:1; overflow:hidden; text-overflow:ellipsis; }
.copy-btn { background:none; border:1px solid var(--border); color:var(--muted); border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.9rem; flex-shrink:0; transition:all 0.15s; }
.copy-btn:hover { border-color:var(--indigo); color:var(--indigo); }

/* ── VERIFY ── */
.verify-result { display:flex; align-items:center; gap:14px; border-radius:12px; padding:18px; margin-top:16px; border:1px solid; }
.verify-active    { background:rgba(16,185,129,0.06);  border-color:rgba(16,185,129,0.3); }
.verify-used      { background:rgba(239,68,68,0.05);   border-color:rgba(239,68,68,0.3); }
.verify-notfound  { background:rgba(245,158,11,0.05);  border-color:rgba(245,158,11,0.3); }
.verify-icon { font-size:2rem; flex-shrink:0; }
.verify-status { font-family:'Syne',sans-serif; font-size:1rem; font-weight:700; color:var(--text); }
.verify-sub { font-size:0.82rem; color:var(--muted); margin-top:3px; }

/* ── RESULTS ── */
.result-row { display:flex; align-items:center; gap:14px; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px 18px; margin-bottom:12px; transition:border-color 0.2s; box-shadow:var(--shadow); }
.result-leader { border-color:rgba(37,99,235,0.4); background:rgba(37,99,235,0.03); }
.result-rank { font-family:'Syne',sans-serif; font-size:1rem; font-weight:700; color:var(--muted2); min-width:28px; }
.result-sym { font-size:1.8rem; flex-shrink:0; }
.result-info { flex:1; }
.result-name { font-family:'Syne',sans-serif; font-weight:700; font-size:0.95rem; color:var(--text); }
.result-party { font-size:0.76rem; color:var(--muted); margin-bottom:8px; }
.result-bar-wrap { height:5px; background:var(--border); border-radius:100px; overflow:hidden; }
.result-bar { height:100%; background:linear-gradient(90deg,#2563EB,#4F46E5); border-radius:100px; transition:width 1s ease; }
.result-meta { text-align:right; flex-shrink:0; }
.result-count { font-family:'Syne',sans-serif; font-size:1.6rem; font-weight:800; color:var(--indigo); display:block; }
.result-pct { font-size:0.78rem; color:var(--muted); }
.results-footer { text-align:center; padding:14px; font-size:0.87rem; color:var(--muted); border-top:1px solid var(--border); margin-top:8px; }

/* ── ADMIN ── */
.admin-login-card { max-width:420px; margin:0 auto; }
.logout-btn { margin-left:auto; background:transparent; border:1px solid rgba(239,68,68,0.4); color:var(--red); border-radius:8px; padding:6px 14px; cursor:pointer; font-size:0.82rem; transition:all 0.2s; }
.logout-btn:hover { background:rgba(239,68,68,0.1); }
.admin-stats-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px; }
.astat { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px; text-align:center; box-shadow:var(--shadow); }
.astat-icon { font-size:1.2rem; margin-bottom:4px; }
.astat-val { font-family:'Syne',sans-serif; font-size:1.5rem; font-weight:800; color:var(--text); }
.astat-val.green { color:#059669; } .astat-val.amber { color:#D97706; } .astat-val.blue { color:var(--indigo); }
.astat-label { font-size:0.72rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; }
.admin-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:4px; }
.table-wrap { overflow-x:auto; margin-top:16px; }
.voter-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
.voter-table th { padding:10px 14px; text-align:left; font-size:0.75rem; color:var(--muted); border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:0.5px; }
.voter-table td { padding:12px 14px; border-bottom:1px solid var(--border); }
.voter-table tr:hover td { background:rgba(37,99,235,0.03); }
.row-voted td { opacity:0.7; }
.td-mono { font-family:'DM Mono',monospace; font-size:0.82rem; color:var(--indigo); }
.badge { padding:3px 10px; border-radius:100px; font-size:0.75rem; font-weight:700; }
.badge-voted   { background:rgba(16,185,129,0.12); color:#059669; }
.badge-pending { background:rgba(245,158,11,0.12); color:#D97706; }
.del-btn { background:transparent; border:1px solid rgba(239,68,68,0.35); color:var(--red); border-radius:7px; padding:4px 10px; cursor:pointer; font-size:0.79rem; transition:all 0.2s; }
.del-btn:hover { background:rgba(239,68,68,0.12); }

/* ── AUDIT LOG ── */
.audit-scroll { max-height:480px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
.audit-row { display:grid; grid-template-columns:auto 1fr 1fr auto; gap:12px; align-items:center; padding:9px 0; border-bottom:1px solid var(--border); font-size:0.82rem; }
.audit-action { font-family:'DM Mono',monospace; font-size:0.75rem; padding:2px 8px; border-radius:6px; font-weight:600; }
.action-ok   { background:rgba(34,197,94,0.12);  color:var(--green); }
.action-fail { background:rgba(239,68,68,0.12);   color:var(--red); }
.action-warn { background:rgba(245,158,11,0.12);  color:var(--amber); }
.audit-vid { color:var(--indigo); font-family:'DM Mono',monospace; font-size:0.8rem; }
.audit-det { color:var(--muted); font-size:0.8rem; }
.audit-ts { color:var(--muted2); font-size:0.75rem; white-space:nowrap; }

/* ── MODAL ── */
.modal-overlay { position:fixed; inset:0; background:rgba(30,41,59,0.5); backdrop-filter:blur(6px); z-index:500; display:flex; align-items:center; justify-content:center; padding:20px; animation:fadeUp 0.2s; }
.modal-box { background:var(--card); border:1px solid var(--border); border-radius:20px; width:100%; max-width:440px; box-shadow:0 24px 80px #1E293B20; }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 0; }
.modal-title { font-family:'Syne',sans-serif; font-size:1.1rem; font-weight:700; color:var(--text); }
.modal-close { background:none; border:none; color:var(--muted); font-size:1.4rem; cursor:pointer; padding:4px; line-height:1; }
.modal-body { padding:18px 24px 24px; }
.modal-text { color:var(--muted); font-size:0.9rem; line-height:1.6; margin-bottom:20px; }
.modal-actions { display:flex; gap:10px; justify-content:flex-end; }

/* ── TOAST ── */
.toast-stack { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; }
.toast {
  display:flex; align-items:center; gap:10px;
  background:var(--card); border:1px solid var(--border); border-radius:12px;
  padding:13px 16px; font-size:0.87rem; box-shadow:0 8px 40px #1E293B20;
  animation:slideInToast 0.3s ease; max-width:340px; cursor:pointer;
  transition:transform 0.15s; min-width:220px;
}
.toast:hover { transform:scale(1.02); }
.toast-msg { flex:1; color:var(--text); }
.toast-close { color:var(--muted); font-size:1.1rem; }
.toast-dot { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; flex-shrink:0; }
.dot-success { background:rgba(16,185,129,0.15);  color:var(--green); }
.dot-error   { background:rgba(239,68,68,0.15);   color:var(--red); }
.dot-info    { background:rgba(37,99,235,0.12);   color:var(--indigo); }
.toast-success { border-color:rgba(34,197,94,0.3); }
.toast-error   { border-color:rgba(239,68,68,0.3); }

/* ── FOOTER ── */
.footer { background:linear-gradient(135deg, #2563EB 0%, #1E40AF 100%); border-top:1px solid #1D4ED8; padding:14px 24px; display:flex; justify-content:space-between; font-size:0.73rem; color:rgba(255,255,255,0.8); flex-wrap:wrap; gap:8px; }

/* ── MISC ── */
.empty { text-align:center; color:var(--muted); padding:36px; font-size:0.9rem; }

/* ── ANIMATIONS ── */
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
@keyframes slideInToast { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:none} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
@keyframes pulse-logo { 0%,100%{filter:drop-shadow(0 0 12px var(--indigo))} 50%{filter:drop-shadow(0 0 24px var(--indigo2))} }
@keyframes spin { to{transform:rotate(360deg)} }
@keyframes slide-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
.slide-in { animation:slide-in 0.35s ease; }

/* ── RESPONSIVE ── */
@media(max-width:600px) {
  .hero-title { font-size:2rem; }
  .admin-stats-grid { grid-template-columns:repeat(2,1fr); }
  .cand-grid { grid-template-columns:repeat(2,1fr); }
  .how-grid { grid-template-columns:1fr 1fr; }
  .header-inner { padding:12px 16px; }
  .main { padding:16px 12px; }
  .card { padding:20px 16px; }
}
`;