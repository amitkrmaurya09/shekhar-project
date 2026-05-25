import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

// ── Sound Engine ──────────────────────────────────────────────────────────────
const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const sounds = {
    success: { freq: [523, 659, 784], dur: 0.12 },
    error:   { freq: [300, 200],       dur: 0.15 },
    click:   { freq: [800],            dur: 0.05 },
    vote:    { freq: [440, 554, 659, 880], dur: 0.1 },
  };
  const s = sounds[type] || sounds.click;
  s.freq.forEach((f, i) => {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(ctx.destination);
    o2.frequency.value = f;
    o2.type = type === "error" ? "sawtooth" : "sine";
    g2.gain.setValueAtTime(0.2, ctx.currentTime + i * s.dur);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * s.dur + s.dur);
    o2.start(ctx.currentTime + i * s.dur);
    o2.stop(ctx.currentTime + i * s.dur + s.dur);
  });
};

// ── Particle System ───────────────────────────────────────────────────────────
const Particles = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,0,${p.opacity})`;
        ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} style={{ position:"fixed",top:0,left:0,pointerEvents:"none",zIndex:0 }} />;
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{type==="success"?"✅":type==="error"?"❌":"ℹ️"}</span>
      <span>{msg}</span>
    </div>
  );
};

// ── NavTab ────────────────────────────────────────────────────────────────────
const NavTab = ({ icon, label, active, onClick }) => (
  <button onClick={() => { playSound("click"); onClick(); }}
    className={`nav-tab ${active ? "nav-tab-active" : ""}`}>
    <span className="tab-icon">{icon}</span>
    <span className="tab-label">{label}</span>
  </button>
);

// ── Input ─────────────────────────────────────────────────────────────────────
const Field = ({ label, icon, type="text", value, onChange, placeholder }) => (
  <div className="field">
    <label className="field-label"><span>{icon}</span> {label}</label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="field-input" onClick={() => playSound("click")} />
  </div>
);

// ── GlowButton ────────────────────────────────────────────────────────────────
const GlowBtn = ({ children, onClick, color="gold", disabled=false, icon="" }) => (
  <button disabled={disabled} onClick={onClick} className={`glow-btn glow-${color}`}>
    {icon && <span>{icon}</span>} {children}
  </button>
);

// ── Hash Token Card ───────────────────────────────────────────────────────────
const HashCard = ({ token, used }) => (
  <div className={`hash-card ${used ? "hash-used" : "hash-active"}`}>
    <div className="hash-status">{used ? "🔴 USED" : "🟢 ACTIVE"}</div>
    <div className="hash-token">{token.substring(0,16)}…{token.substring(48)}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("home");
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Register
  const [reg, setReg] = useState({ voter_id:"", name:"", secret_key:"" });
  // Vote
  const [voteForm, setVote] = useState({ voter_id:"", secret_key:"", candidate_id:1 });
  // Re-register
  const [reReg, setReReg] = useState({ voter_id:"", name:"", new_secret_key:"" });
  // Admin
  const [adminCreds, setAdminCreds] = useState({ username:"", password:"" });
  const [adminToken, setAdminToken] = useState(null);
  const [adminVoters, setAdminVoters] = useState([]);
  const [adminStats, setAdminStats] = useState(null);

  // Public data
  const [results, setResults] = useState([]);
  const [hashes, setHashes] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [lastHash, setLastHash] = useState(null);

  const toast = (msg, type="success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    playSound(type === "success" ? "success" : "error");
  };

  useEffect(() => {
    const load = () => {
      axios.get(`${API}/results`).then(r => setResults(r.data)).catch(()=>{});
      axios.get(`${API}/eligible-hashes`).then(r => setHashes(r.data)).catch(()=>{});
      axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(()=>{});
    };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (adminToken) loadAdminData();
  }, [adminToken]);

  const loadAdminData = async () => {
    const h = { Authorization: adminToken };
    const [v, s] = await Promise.all([
      axios.get(`${API}/admin/voters`, { headers: h }),
      axios.get(`${API}/admin/stats`, { headers: h }),
    ]);
    setAdminVoters(v.data);
    setAdminStats(s.data);
  };

  const doRegister = async () => {
    if (!reg.voter_id || !reg.name || !reg.secret_key) return toast("Fill all fields","error");
    setLoading(true);
    try {
      const r = await axios.post(`${API}/register`, reg);
      setLastHash(r.data.eligibility_hash);
      toast(`Registered! Token: ${r.data.eligibility_hash.substring(0,12)}…`);
      setReg({ voter_id:"", name:"", secret_key:"" });
    } catch(e) { toast(e.response?.data?.detail || "Error","error"); }
    setLoading(false);
  };

  const doVote = async () => {
    if (!voteForm.voter_id || !voteForm.secret_key) return toast("Fill all fields","error");
    setLoading(true);
    try {
      await axios.post(`${API}/vote`, voteForm);
      toast("🗳️ Vote cast successfully! Democracy in action!");
      playSound("vote");
      setVote({ voter_id:"", secret_key:"", candidate_id:1 });
    } catch(e) { toast(e.response?.data?.detail || "Error","error"); }
    setLoading(false);
  };

  const doReRegister = async () => {
    if (!reReg.voter_id || !reReg.name || !reReg.new_secret_key) return toast("Fill all fields","error");
    setLoading(true);
    try {
      const r = await axios.post(`${API}/re-register`, reReg);
      setLastHash(r.data.eligibility_hash);
      toast("Re-registered successfully!");
      setReReg({ voter_id:"", name:"", new_secret_key:"" });
    } catch(e) { toast(e.response?.data?.detail || "Error","error"); }
    setLoading(false);
  };

  const doAdminLogin = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/admin/login`, adminCreds);
      setAdminToken(r.data.token);
      toast("Admin access granted 🔐");
    } catch(e) { toast("Invalid credentials","error"); }
    setLoading(false);
  };

  const doDeleteVoter = async (voter_id) => {
    if (!confirm(`Delete voter ${voter_id}?`)) return;
    try {
      await axios.delete(`${API}/admin/voter/${voter_id}`, { headers:{ Authorization: adminToken } });
      toast(`Voter ${voter_id} deleted`);
      loadAdminData();
    } catch(e) { toast(e.response?.data?.detail || "Error","error"); }
  };

  const maxVotes = Math.max(...results.map(r => r.votes), 1);

  return (
    <>
      <style>{CSS}</style>
      <Particles />

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => setToasts(ts => ts.filter(x=>x.id!==t.id))} />
        ))}
      </div>

      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-icon">🗳️</div>
              <div>
                <div className="logo-title">SecureVote</div>
                <div className="logo-sub">Blockchain-Grade Electoral System</div>
              </div>
            </div>
            <div className="live-badge">🔴 LIVE</div>
          </div>
          <nav className="nav">
            <NavTab icon="🏛️" label="Home"       active={tab==="home"}       onClick={()=>setTab("home")} />
            <NavTab icon="📝" label="Register"   active={tab==="register"}   onClick={()=>setTab("register")} />
            <NavTab icon="🗳️" label="Vote"       active={tab==="vote"}       onClick={()=>setTab("vote")} />
            <NavTab icon="🔄" label="Re-Register" active={tab==="rereg"}    onClick={()=>setTab("rereg")} />
            <NavTab icon="🔗" label="Public Tokens" active={tab==="tokens"} onClick={()=>setTab("tokens")} />
            <NavTab icon="📊" label="Results"    active={tab==="results"}    onClick={()=>setTab("results")} />
            <NavTab icon="🛡️" label="Admin"      active={tab==="admin"}      onClick={()=>setTab("admin")} />
          </nav>
        </header>

        <main className="main">

          {/* ── HOME ── */}
          {tab==="home" && (
            <div className="page page-home">
              <div className="home-hero">
                <div className="hero-orb">🗳️</div>
                <h1 className="hero-title">Your Vote.<br/>Your Voice.</h1>
                <p className="hero-sub">Cryptographically secured • Publicly verifiable • Tamper-proof</p>
                <div className="hero-stats">
                  <div className="stat-chip">👥 {results.reduce((a,r)=>a+r.votes,0)} Votes Cast</div>
                  <div className="stat-chip">🔗 {hashes.length} Tokens Issued</div>
                  <div className="stat-chip">🏆 {candidates.length} Candidates</div>
                </div>
                <div className="hero-btns">
                  <GlowBtn onClick={()=>setTab("register")} icon="📝" color="gold">Register to Vote</GlowBtn>
                  <GlowBtn onClick={()=>setTab("vote")} icon="🗳️" color="green">Cast Your Vote</GlowBtn>
                </div>
              </div>

              <div className="how-it-works">
                <h2 className="section-title">How It Works</h2>
                <div className="steps">
                  {[
                    ["1️⃣","Register","Enter your Voter ID + secret key (KB1234). A SHA-256 eligibility token is generated and stored publicly."],
                    ["2️⃣","Verify","Your hash token appears in the public registry — verifiable by anyone without revealing your identity."],
                    ["3️⃣","Vote","Use your Voter ID + secret key to cast your vote. The same hash is used to confirm eligibility then marked 'used'."],
                    ["4️⃣","Audit","All eligibility tokens are public. Anyone can verify election integrity without accessing private data."],
                  ].map(([n,t,d]) => (
                    <div className="step" key={t}>
                      <div className="step-num">{n}</div>
                      <div className="step-title">{t}</div>
                      <div className="step-desc">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── REGISTER ── */}
          {tab==="register" && (
            <div className="page">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">📝</span>
                  <h2>Voter Registration</h2>
                </div>
                <p className="card-desc">Register once with your Voter ID. A public eligibility token will be created — proof you're registered, without revealing your identity.</p>
                <Field label="Voter ID" icon="🪪" value={reg.voter_id} onChange={e=>setReg({...reg,voter_id:e.target.value})} placeholder="e.g. MH2024001" />
                <Field label="Full Name" icon="👤" value={reg.name} onChange={e=>setReg({...reg,name:e.target.value})} placeholder="Your legal name" />
                <Field label="Secret Key" icon="🔑" type="password" value={reg.secret_key} onChange={e=>setReg({...reg,secret_key:e.target.value})} placeholder="Election secret key" />
                <div className="info-box">⚠️ The election secret key is <strong>KB1234</strong>. Keep it safe — it's your authentication credential.</div>
                <GlowBtn onClick={doRegister} icon="📝" disabled={loading}>
                  {loading ? "Registering…" : "Register & Generate Token"}
                </GlowBtn>
                {lastHash && (
                  <div className="hash-reveal">
                    <div className="hash-reveal-label">🔗 Your Eligibility Token</div>
                    <div className="hash-reveal-value">{lastHash}</div>
                    <div className="hash-reveal-note">This token is now publicly visible. SHA-256(VoterID + SecretKey)</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── VOTE ── */}
          {tab==="vote" && (
            <div className="page">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🗳️</span>
                  <h2>Cast Your Vote</h2>
                </div>
                <p className="card-desc">Your vote is authenticated using the same hash generated at registration. One person, one vote — cryptographically enforced.</p>
                <Field label="Voter ID" icon="🪪" value={voteForm.voter_id} onChange={e=>setVote({...voteForm,voter_id:e.target.value})} placeholder="Your registered Voter ID" />
                <Field label="Secret Key" icon="🔑" type="password" value={voteForm.secret_key} onChange={e=>setVote({...voteForm,secret_key:e.target.value})} placeholder="Election secret key" />
                <div className="field">
                  <label className="field-label"><span>🏆</span> Choose Your Candidate</label>
                  <div className="candidate-grid">
                    {candidates.map(c => (
                      <div key={c.id}
                        className={`candidate-card ${voteForm.candidate_id===c.id ? "candidate-selected":""}`}
                        onClick={()=>{ playSound("click"); setVote({...voteForm,candidate_id:c.id}); }}>
                        <div className="candidate-avatar">{c.name.charAt(0)}</div>
                        <div className="candidate-name">{c.name}</div>
                        <div className="candidate-party">{c.party}</div>
                        {voteForm.candidate_id===c.id && <div className="candidate-check">✓</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <GlowBtn onClick={doVote} icon="🗳️" color="green" disabled={loading}>
                  {loading ? "Casting vote…" : "Cast My Vote"}
                </GlowBtn>
              </div>
            </div>
          )}

          {/* ── RE-REGISTER ── */}
          {tab==="rereg" && (
            <div className="page">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🔄</span>
                  <h2>Re-Register (Forgot Secret Key)</h2>
                </div>
                <p className="card-desc">If you forgot your secret key and <strong>haven't voted yet</strong>, you can delete your old registration and create a fresh one on the same Voter ID.</p>
                <div className="warning-box">🔒 This only works if you have NOT yet voted. Once voted, registration is permanent.</div>
                <Field label="Voter ID" icon="🪪" value={reReg.voter_id} onChange={e=>setReReg({...reReg,voter_id:e.target.value})} placeholder="Your Voter ID" />
                <Field label="Full Name" icon="👤" value={reReg.name} onChange={e=>setReReg({...reReg,name:e.target.value})} placeholder="Your legal name" />
                <Field label="Secret Key" icon="🔑" type="password" value={reReg.new_secret_key} onChange={e=>setReReg({...reReg,new_secret_key:e.target.value})} placeholder="Election secret key (KB1234)" />
                <GlowBtn onClick={doReRegister} icon="🔄" color="purple" disabled={loading}>
                  {loading ? "Processing…" : "Re-Register & New Token"}
                </GlowBtn>
              </div>
            </div>
          )}

          {/* ── TOKENS ── */}
          {tab==="tokens" && (
            <div className="page">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">🔗</span>
                  <h2>Public Eligibility Tokens</h2>
                </div>
                <p className="card-desc">All eligibility tokens are publicly verifiable. Each token = SHA-256(VoterID + SecretKey). Green = registered & not voted. Red = vote cast.</p>
                <div className="token-stats">
                  <div className="tstat"><span className="tstat-val">{hashes.length}</span><span className="tstat-label">Total Tokens</span></div>
                  <div className="tstat"><span className="tstat-val green">{hashes.filter(h=>!h.used).length}</span><span className="tstat-label">Active</span></div>
                  <div className="tstat"><span className="tstat-val red">{hashes.filter(h=>h.used).length}</span><span className="tstat-label">Used</span></div>
                </div>
                <div className="hash-list">
                  {hashes.length === 0
                    ? <div className="empty">No tokens yet. Register voters to generate tokens.</div>
                    : hashes.map((h,i) => <HashCard key={i} token={h.hash_token} used={h.used} />)
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {tab==="results" && (
            <div className="page">
              <div className="card">
                <div className="card-header">
                  <span className="card-icon">📊</span>
                  <h2>Live Election Results</h2>
                </div>
                <div className="results-list">
                  {results.sort((a,b)=>b.votes-a.votes).map((r,i) => (
                    <div className="result-row" key={r.id}>
                      <div className="result-rank">#{i+1}</div>
                      <div className="result-avatar">{r.name.charAt(0)}</div>
                      <div className="result-info">
                        <div className="result-name">{r.name}</div>
                        <div className="result-party">{r.party}</div>
                        <div className="result-bar-wrap">
                          <div className="result-bar" style={{width:`${(r.votes/maxVotes)*100}%`}} />
                        </div>
                      </div>
                      <div className="result-votes">
                        <div className="result-count">{r.votes}</div>
                        <div className="result-pct">{results.reduce((a,x)=>a+x.votes,0) > 0 ? Math.round(r.votes/results.reduce((a,x)=>a+x.votes,0)*100) : 0}%</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="total-bar">
                  Total votes cast: <strong>{results.reduce((a,r)=>a+r.votes,0)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN ── */}
          {tab==="admin" && (
            <div className="page">
              {!adminToken ? (
                <div className="card admin-login-card">
                  <div className="card-header">
                    <span className="card-icon">🛡️</span>
                    <h2>Admin Access</h2>
                  </div>
                  <p className="card-desc">Restricted to authorized personnel only.</p>
                  <Field label="Username" icon="👤" value={adminCreds.username} onChange={e=>setAdminCreds({...adminCreds,username:e.target.value})} placeholder="admin" />
                  <Field label="Password" icon="🔒" type="password" value={adminCreds.password} onChange={e=>setAdminCreds({...adminCreds,password:e.target.value})} placeholder="••••••••" />
                  <GlowBtn onClick={doAdminLogin} icon="🔐" color="red" disabled={loading}>
                    {loading ? "Authenticating…" : "Admin Login"}
                  </GlowBtn>
                </div>
              ) : (
                <div className="card">
                  <div className="card-header">
                    <span className="card-icon">🛡️</span>
                    <h2>Admin Dashboard</h2>
                    <button className="logout-btn" onClick={()=>setAdminToken(null)}>Logout 🚪</button>
                  </div>

                  {adminStats && (
                    <div className="admin-stats">
                      {[
                        ["👥","Total Voters",adminStats.total_voters],
                        ["✅","Voted",adminStats.voted_count,"green"],
                        ["⏳","Pending",adminStats.pending_count,"orange"],
                        ["🔗","Tokens",adminStats.total_tokens],
                      ].map(([icon,label,val,color]) => (
                        <div className="astat" key={label}>
                          <div className="astat-icon">{icon}</div>
                          <div className={`astat-val ${color||""}`}>{val}</div>
                          <div className="astat-label">{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="admin-note">⚠️ Admin can see Name + Voter ID only. Secret keys are never stored in plain text.</div>

                  <div className="voter-table-wrap">
                    <table className="voter-table">
                      <thead>
                        <tr>
                          <th>🪪 Voter ID</th>
                          <th>👤 Name</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminVoters.map(v => (
                          <tr key={v.voter_id} className={v.has_voted?"voted-row":""}>
                            <td className="voter-id-cell">{v.voter_id}</td>
                            <td>{v.name}</td>
                            <td><span className={`badge ${v.has_voted?"badge-voted":"badge-pending"}`}>{v.has_voted?"✅ Voted":"⏳ Pending"}</span></td>
                            <td>
                              <button className="del-btn" onClick={()=>doDeleteVoter(v.voter_id)}>🗑️ Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {adminVoters.length === 0 && <div className="empty">No voters registered yet.</div>}
                </div>
              )}
            </div>
          )}

        </main>

        <footer className="footer">
          <span>🔒 SecureVote — SHA-256 Cryptographic Eligibility System</span>
          <span>Secret Key: KB1234 • Admin: admin / admin@secure2024</span>
        </footer>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;900&family=Rajdhani:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

:root {
  --gold:#ffd700; --gold2:#ffaa00; --green:#00e676; --red:#ff1744;
  --purple:#aa00ff; --bg:#060812; --bg2:#0d1427; --bg3:#111a35;
  --border:#1e3a6e; --text:#e8f0fe; --muted:#5c7ab8;
  --card:#0a1428; --glow-gold:0 0 20px #ffd70060;
}

body { background:var(--bg); color:var(--text); font-family:'Rajdhani',sans-serif; overflow-x:hidden; }

.app { position:relative; z-index:1; min-height:100vh; display:flex; flex-direction:column; }

/* ── HEADER ── */
.header { background:linear-gradient(180deg,#050a1a 0%,var(--bg2) 100%); border-bottom:1px solid var(--border); padding:0; position:sticky; top:0; z-index:100; backdrop-filter:blur(20px); }
.header-inner { display:flex; align-items:center; justify-content:space-between; padding:14px 24px 10px; }
.logo { display:flex; align-items:center; gap:12px; }
.logo-icon { font-size:2rem; filter:drop-shadow(0 0 10px gold); animation:pulse 2s infinite; }
.logo-title { font-family:'Orbitron',sans-serif; font-size:1.4rem; font-weight:900; background:linear-gradient(90deg,var(--gold),var(--gold2),#fff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.logo-sub { font-size:0.7rem; color:var(--muted); letter-spacing:1px; }
.live-badge { background:#ff1744; padding:4px 10px; border-radius:100px; font-size:0.75rem; font-weight:700; animation:blink 1s infinite; letter-spacing:1px; }

.nav { display:flex; overflow-x:auto; padding:0 12px; gap:4px; scrollbar-width:none; }
.nav-tab { display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-family:'Rajdhani',sans-serif; font-size:0.9rem; font-weight:600; border-bottom:3px solid transparent; transition:all 0.2s; white-space:nowrap; }
.nav-tab:hover { color:var(--text); background:#ffffff08; }
.nav-tab-active { color:var(--gold) !important; border-bottom-color:var(--gold) !important; }
.tab-icon { font-size:1.1rem; }

/* ── MAIN ── */
.main { flex:1; padding:24px 16px; max-width:900px; margin:0 auto; width:100%; }
.page { animation:fadeIn 0.3s ease; }

/* ── HOME ── */
.home-hero { text-align:center; padding:40px 0 24px; }
.hero-orb { font-size:5rem; animation:float 3s ease-in-out infinite; filter:drop-shadow(0 0 30px gold); }
.hero-title { font-family:'Orbitron',sans-serif; font-size:2.8rem; font-weight:900; line-height:1.1; background:linear-gradient(135deg,#fff,var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin:16px 0; }
.hero-sub { color:var(--muted); font-size:1rem; letter-spacing:1px; margin-bottom:24px; }
.hero-stats { display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
.stat-chip { background:var(--bg3); border:1px solid var(--border); border-radius:100px; padding:6px 16px; font-size:0.85rem; color:var(--gold); }
.hero-btns { display:flex; justify-content:center; gap:16px; flex-wrap:wrap; }

.how-it-works { margin-top:40px; }
.section-title { font-family:'Orbitron',sans-serif; font-size:1.2rem; color:var(--gold); text-align:center; margin-bottom:20px; }
.steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
.step { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:20px; text-align:center; transition:transform 0.2s; }
.step:hover { transform:translateY(-4px); border-color:var(--gold); }
.step-num { font-size:2rem; margin-bottom:8px; }
.step-title { font-family:'Orbitron',sans-serif; font-size:0.85rem; color:var(--gold); margin-bottom:8px; }
.step-desc { font-size:0.82rem; color:var(--muted); line-height:1.5; }

/* ── CARD ── */
.card { background:var(--card); border:1px solid var(--border); border-radius:20px; padding:28px; margin-bottom:20px; box-shadow:0 8px 40px #0006; }
.card-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.card-icon { font-size:1.8rem; }
.card-header h2 { font-family:'Orbitron',sans-serif; font-size:1.2rem; color:var(--gold); }
.card-desc { color:var(--muted); font-size:0.9rem; line-height:1.6; margin-bottom:20px; }

/* ── FIELD ── */
.field { margin-bottom:16px; }
.field-label { display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--gold); font-weight:600; margin-bottom:6px; }
.field-input { width:100%; background:#060e20; border:1px solid var(--border); border-radius:10px; padding:12px 16px; color:var(--text); font-family:'Rajdhani',sans-serif; font-size:1rem; transition:border-color 0.2s,box-shadow 0.2s; outline:none; }
.field-input:focus { border-color:var(--gold); box-shadow:0 0 0 3px #ffd70020; }
.field-input::placeholder { color:var(--muted); }

/* ── BUTTONS ── */
.glow-btn { display:inline-flex; align-items:center; gap:8px; padding:14px 28px; border:none; border-radius:12px; font-family:'Orbitron',sans-serif; font-size:0.85rem; font-weight:700; cursor:pointer; transition:all 0.2s; margin-top:8px; letter-spacing:0.5px; }
.glow-btn:disabled { opacity:0.5; cursor:not-allowed; }
.glow-gold { background:linear-gradient(135deg,var(--gold),var(--gold2)); color:#000; box-shadow:var(--glow-gold); }
.glow-gold:hover:not(:disabled) { box-shadow:0 0 30px #ffd70099; transform:translateY(-2px); }
.glow-green { background:linear-gradient(135deg,#00c853,#00e676); color:#000; box-shadow:0 0 20px #00e67660; }
.glow-green:hover:not(:disabled) { box-shadow:0 0 30px #00e67699; transform:translateY(-2px); }
.glow-purple { background:linear-gradient(135deg,#6200ea,#aa00ff); color:#fff; box-shadow:0 0 20px #aa00ff60; }
.glow-purple:hover:not(:disabled) { transform:translateY(-2px); }
.glow-red { background:linear-gradient(135deg,#b71c1c,#ff1744); color:#fff; box-shadow:0 0 20px #ff174460; }
.glow-red:hover:not(:disabled) { transform:translateY(-2px); }

/* ── INFO / WARNING BOXES ── */
.info-box { background:#ffd70015; border:1px solid #ffd70040; border-radius:10px; padding:12px 16px; font-size:0.85rem; color:var(--gold); margin:12px 0; }
.warning-box { background:#ff174415; border:1px solid #ff174440; border-radius:10px; padding:12px 16px; font-size:0.85rem; color:#ff6b6b; margin:12px 0; }

/* ── HASH REVEAL ── */
.hash-reveal { background:#0a1f0a; border:1px solid #00e67640; border-radius:12px; padding:16px; margin-top:16px; animation:fadeIn 0.5s; }
.hash-reveal-label { font-size:0.8rem; color:var(--green); font-weight:700; margin-bottom:8px; }
.hash-reveal-value { font-family:monospace; font-size:0.78rem; word-break:break-all; color:var(--text); background:#060e20; padding:10px; border-radius:8px; }
.hash-reveal-note { font-size:0.75rem; color:var(--muted); margin-top:8px; }

/* ── CANDIDATES ── */
.candidate-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-top:8px; }
.candidate-card { background:#060e20; border:2px solid var(--border); border-radius:14px; padding:20px 12px; text-align:center; cursor:pointer; transition:all 0.2s; position:relative; }
.candidate-card:hover { border-color:var(--gold); transform:scale(1.02); }
.candidate-selected { border-color:var(--green) !important; background:#001a0a !important; box-shadow:0 0 20px #00e67630; }
.candidate-avatar { width:52px; height:52px; border-radius:50%; background:linear-gradient(135deg,var(--gold),var(--gold2)); color:#000; font-family:'Orbitron',sans-serif; font-size:1.4rem; font-weight:900; display:flex; align-items:center; justify-content:center; margin:0 auto 10px; }
.candidate-name { font-weight:700; font-size:0.95rem; }
.candidate-party { font-size:0.75rem; color:var(--muted); margin-top:4px; }
.candidate-check { position:absolute; top:8px; right:10px; color:var(--green); font-size:1.2rem; font-weight:900; }

/* ── TOKENS ── */
.token-stats { display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.tstat { background:#060e20; border:1px solid var(--border); border-radius:12px; padding:14px 20px; text-align:center; flex:1; min-width:80px; }
.tstat-val { display:block; font-family:'Orbitron',sans-serif; font-size:1.8rem; font-weight:700; }
.tstat-val.green { color:var(--green); } .tstat-val.red { color:var(--red); }
.tstat-label { font-size:0.75rem; color:var(--muted); }
.hash-list { display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto; }
.hash-card { display:flex; align-items:center; gap:12px; background:#060e20; border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
.hash-active { border-color:#00e67630; } .hash-used { border-color:#ff174430; opacity:0.7; }
.hash-status { font-size:0.75rem; font-weight:700; white-space:nowrap; min-width:70px; }
.hash-token { font-family:monospace; font-size:0.78rem; color:var(--muted); word-break:break-all; }

/* ── RESULTS ── */
.results-list { display:flex; flex-direction:column; gap:14px; }
.result-row { display:flex; align-items:center; gap:14px; background:#060e20; border:1px solid var(--border); border-radius:14px; padding:16px; }
.result-rank { font-family:'Orbitron',sans-serif; font-size:1rem; color:var(--gold); min-width:28px; }
.result-avatar { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,var(--gold),var(--gold2)); color:#000; font-size:1.2rem; font-weight:900; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.result-info { flex:1; }
.result-name { font-weight:700; font-size:1rem; }
.result-party { font-size:0.78rem; color:var(--muted); margin-bottom:8px; }
.result-bar-wrap { height:6px; background:#0d1427; border-radius:100px; overflow:hidden; }
.result-bar { height:100%; background:linear-gradient(90deg,var(--gold),var(--gold2)); border-radius:100px; transition:width 0.8s ease; }
.result-votes { text-align:right; }
.result-count { font-family:'Orbitron',sans-serif; font-size:1.5rem; font-weight:900; color:var(--gold); }
.result-pct { font-size:0.8rem; color:var(--muted); }
.total-bar { text-align:center; padding:12px; font-size:0.9rem; color:var(--muted); border-top:1px solid var(--border); margin-top:16px; }

/* ── ADMIN ── */
.admin-login-card { max-width:420px; margin:0 auto; }
.logout-btn { margin-left:auto; background:transparent; border:1px solid var(--red); color:var(--red); border-radius:8px; padding:6px 14px; cursor:pointer; font-family:'Rajdhani',sans-serif; font-size:0.85rem; }
.admin-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
.astat { background:#060e20; border:1px solid var(--border); border-radius:12px; padding:16px; text-align:center; }
.astat-icon { font-size:1.4rem; margin-bottom:4px; }
.astat-val { font-family:'Orbitron',sans-serif; font-size:1.6rem; font-weight:700; }
.astat-val.green { color:var(--green); } .astat-val.orange { color:var(--gold2); }
.astat-label { font-size:0.75rem; color:var(--muted); }
.admin-note { background:#ffd70010; border:1px solid #ffd70030; border-radius:10px; padding:10px 14px; font-size:0.82rem; color:var(--gold); margin-bottom:16px; }
.voter-table-wrap { overflow-x:auto; }
.voter-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
.voter-table th { background:#0d1427; padding:12px 16px; text-align:left; font-size:0.8rem; color:var(--muted); border-bottom:1px solid var(--border); }
.voter-table td { padding:12px 16px; border-bottom:1px solid #1a2a4a; }
.voter-table tr:hover td { background:#060e20; }
.voted-row td { opacity:0.75; }
.voter-id-cell { font-family:monospace; font-size:0.85rem; color:var(--gold); }
.badge { padding:4px 10px; border-radius:100px; font-size:0.78rem; font-weight:700; }
.badge-voted { background:#00e67620; color:var(--green); }
.badge-pending { background:#ffd70020; color:var(--gold); }
.del-btn { background:transparent; border:1px solid var(--red); color:var(--red); border-radius:8px; padding:4px 10px; cursor:pointer; font-size:0.8rem; transition:all 0.2s; }
.del-btn:hover { background:var(--red); color:#fff; }

/* ── TOAST ── */
.toast-container { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; }
.toast { display:flex; align-items:center; gap:10px; background:#0d1427; border:1px solid var(--border); border-radius:12px; padding:14px 18px; font-size:0.9rem; box-shadow:0 8px 32px #0008; animation:slideIn 0.3s ease; max-width:320px; }
.toast-success { border-color:#00e67640; }
.toast-error { border-color:#ff174440; }
.toast-icon { font-size:1.2rem; }

/* ── FOOTER ── */
.footer { background:var(--bg2); border-top:1px solid var(--border); padding:16px 24px; display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted); flex-wrap:wrap; gap:8px; }

/* ── MISC ── */
.empty { text-align:center; color:var(--muted); padding:32px; }

/* ── ANIMATIONS ── */
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
@keyframes pulse { 0%,100%{filter:drop-shadow(0 0 8px gold)} 50%{filter:drop-shadow(0 0 20px gold)} }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.5} }
@keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
`;
