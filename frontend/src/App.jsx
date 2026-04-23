import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

export default function App() {
  const [form, setForm] = useState({
    name: "",
    age: "",
    secret_code: "",
  });

  const [vote, setVote] = useState({
    name: "",
    secret_code: "",
    candidate_id: 1,
  });

  const [results, setResults] = useState([]);

  // fetch results every 2 sec (real-time feel)
  useEffect(() => {
    const interval = setInterval(() => {
      axios.get(`${API}/results`).then(res => setResults(res.data));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

const register = async () => {
  try {
    await axios.post(`${API}/register`, form);

    alert("Registered!");

    setForm({
      name: "",
      age: "",
      secret_code: ""
    });

  } catch (e) {
    alert(e.response?.data?.detail);
  }
};

  const castVote = async () => {
    try {
      await axios.post(`${API}/vote`, vote);
      alert("Vote casted!");
    } catch (e) {
      alert(e.response?.data?.detail);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">

      <h1 className="text-3xl font-bold text-center mb-8">Voting System</h1>

      {/* Register */}
      <div className="bg-gray-800 p-4 rounded mb-6">
        <h2 className="text-xl mb-3">Register</h2>

        <input placeholder="Name"
          className="p-2 m-1 text-blue-50 border-2"
          value={form.name}
          onChange={e => setForm({...form, name: e.target.value})} />

        <input placeholder="Age"
        value={form.age}
          className="p-2 m-1 text-blue-50 border-2"
          onChange={e => setForm({...form, age: e.target.value})} />

        <input placeholder="Secret Code"
          value={form.secret_code}
          className="p-2 m-1 text-blue-50 border-2"
          onChange={e => setForm({...form, secret_code: e.target.value})} />

        <button onClick={register}
          className="bg-blue-500 px-4 py-2 m-2 rounded">
          Register
        </button>
      </div>

      {/* Vote */}
      <div className="bg-gray-800 p-4 rounded mb-6">
        <h2 className="text-xl mb-3">Vote</h2>

        <input placeholder="Name"
          className="p-2 m-1 text-blue-50 border-2"
          onChange={e => setVote({...vote, name: e.target.value})} />

        <input placeholder="Secret Code"
          className="p-2 m-1 text-blue-50 border-2"
          onChange={e => setVote({...vote, secret_code: e.target.value})} />

        <select
          className="p-2 m-1 text-blue-50 border-2"
          onChange={e => setVote({...vote, candidate_id: Number(e.target.value)})}
        >
          <option value={1}>Candidate A</option>
          <option value={2}>Candidate B</option>
        </select>

        <button onClick={castVote}
          className="bg-green-500 px-4 py-2 m-2 rounded">
          Vote
        </button>
      </div>

      {/* Results */}
      <div className="bg-gray-800 p-4 rounded">
        <h2 className="text-xl mb-3">Live Results</h2>

        {results.map((r, i) => (
          <div key={i} className="flex justify-between p-2 border-b">
            <span>{r.name}</span>
            <span>{r.votes}</span>
          </div>
        ))}
      </div>

    </div>
  );
}