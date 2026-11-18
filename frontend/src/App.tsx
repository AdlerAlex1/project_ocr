import { useEffect, useState } from "react";
import axios from "axios";
import { useDropzone } from "react-dropzone";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";

const API = "http://localhost:8000/api";

type Note = { id: number; filename: string; status: string; text: string | null };

function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  // Настраиваем axios, чтобы он всегда прикреплял токен
  const api = axios.create({
    baseURL: API,
    headers: { Authorization: `Bearer ${token}` }
  });

  const loadNotes = () => {
    api.get<Note[]>("/notes").then((res) => setNotes(res.data)).catch(() => logout());
  };

  useEffect(() => {
    if (!token) navigate("/login");
    else loadNotes();
  }, [token]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [], "application/pdf": [] },
    onDrop: async (files) => {
      if (!files.length) return;
      setLoading(true);
      const formData = new FormData();
      formData.append("file", files[0]);
      try {
        await api.post("/notes", formData);
        loadNotes();
      } catch (error) {
        alert("Ошибка загрузки (возможно, токен устарел)");
        logout();
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Мои конспекты</h1>
        <button onClick={logout} style={{ padding: "5px 10px", cursor: "pointer" }}>Выйти</button>
      </div>
      
      <div {...getRootProps()} style={{
          border: `2px dashed ${isDragActive ? "#4CAF50" : "#888"}`,
          background: isDragActive ? "#f0fff0" : "transparent",
          padding: 40, textAlign: "center", cursor: "pointer", borderRadius: 8,
      }}>
        <input {...getInputProps()} />
        {loading ? <p>Распознавание...</p> : <p>Перетащи конспект сюда</p>}
      </div>

      <h3 style={{ marginTop: 40 }}>Ваши файлы:</h3>
      <ul style={{ paddingLeft: 0, listStyle: "none" }}>
        {notes.map((n) => (
          <li key={n.id} onClick={() => n.status === "done" && setSelectedNote(n)}
              style={{ marginBottom: 10, padding: 10, border: "1px solid #ddd", borderRadius: 4, cursor: n.status === "done" ? "pointer" : "default" }}>
            <strong>{n.filename}</strong> — <span style={{ color: n.status === "done" ? "green" : "orange" }}>{n.status}</span>
          </li>
        ))}
      </ul>

      {selectedNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "white", padding: 20, borderRadius: 8, width: "80%", maxWidth: 800 }}>
            <h2>{selectedNote.filename}</h2>
            <textarea readOnly value={selectedNote.text || ""} style={{ width: "100%", height: 300, padding: 10 }} />
            <button onClick={() => setSelectedNote(null)} style={{ marginTop: 10, padding: "8px 16px", cursor: "pointer" }}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<MainPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}