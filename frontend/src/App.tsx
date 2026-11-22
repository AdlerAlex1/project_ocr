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
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const api = axios.create({
    baseURL: API,
    headers: { Authorization: `Bearer ${token}` }
  });

  const loadNotes = () => {
    setIsInitialLoading(true);
    api.get<Note[]>("/notes")
      .then((res) => setNotes(res.data))
      .catch(() => logout())
      .finally(() => setIsInitialLoading(false));
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

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Точно удалить этот конспект?")) return;
    try {
      await api.delete(`/notes/${id}`);
      loadNotes();
    } catch (error) {
      alert("Ошибка удаления");
    }
  };

  const handleSave = async () => {
    if (!selectedNote) return;
    try {
      await api.patch(`/notes/${selectedNote.id}`, { text: selectedNote.text });
      setNotes(notes.map(n => n.id === selectedNote.id ? selectedNote : n));
      setIsEditing(false);
    } catch (error) {
      alert("Ошибка сохранения");
    }
  };

  return (
    <div className="app-container">
      <style>{`
        :root {
          --primary: #4F46E5;
          --primary-hover: #4338CA;
          --bg-gradient: linear-gradient(135deg, #f6f8fd 0%, #f1f5f9 100%);
          --card-bg: rgba(255, 255, 255, 0.9);
          --text-main: #1e293b;
          --text-muted: #64748b;
          --border-color: #e2e8f0;
          --danger: #ef4444;
          --success: #10b981;
        }

        body {
          margin: 0;
          background: var(--bg-gradient);
          color: var(--text-main);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          min-height: 100vh;
        }

        .app-container { display: flex; flex-direction: column; min-height: 100vh; }

        /* Шапка со стеклянным эффектом */
        .header {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.3);
          padding: 0 40px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .header-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--primary); display: flex; align-items: center; gap: 10px; }
        
        .btn-logout {
          background: white; color: var(--text-main); border: 1px solid var(--border-color);
          padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 14px;
          font-weight: 600; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .btn-logout:hover { background: #f8fafc; transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }

        .main-content { max-width: 800px; width: 100%; margin: 40px auto; padding: 0 20px; box-sizing: border-box; }

        /* Зона загрузки */
        .dropzone {
          border: 2px dashed #cbd5e1; border-radius: 16px; padding: 40px; text-align: center;
          cursor: pointer; background: var(--card-bg); transition: all 0.3s ease;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 160px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
        }
        .dropzone:hover, .dropzone.active { border-color: var(--primary); background: #f0f4ff; transform: translateY(-2px); }
        .dropzone-text { font-size: 16px; color: var(--text-muted); margin: 10px 0 0 0; font-weight: 500; }

        /* Список файлов */
        .files-title { margin: 40px 0 20px 0; font-size: 20px; font-weight: 700; color: var(--text-main); }
        .file-list { padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .file-item {
          display: flex; justify-content: space-between; align-items: center;
          background: var(--card-bg); padding: 16px 20px; border: 1px solid var(--border-color);
          border-radius: 12px; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          backdrop-filter: blur(10px);
        }
        .file-item:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border-color: #cbd5e1; }
        .file-item.clickable { cursor: pointer; }
        .file-info { display: flex; align-items: center; gap: 15px; font-weight: 600; font-size: 15px; }
        
        .status-badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
        .status-done { background: #dcfce7; color: #166534; }
        .status-pending { background: #fef08a; color: #854d0e; }

        /* Кнопки */
        .btn-icon { background: none; border: none; cursor: pointer; font-size: 18px; padding: 8px; border-radius: 8px; transition: all 0.2s; }
        .btn-icon:hover { background: #fee2e2; transform: scale(1.1); }
        .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3); }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
        .btn-secondary { background: white; color: var(--text-main); border: 1px solid var(--border-color); padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-secondary:hover { background: #f8fafc; }

        /* Модальное окно */
        .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 50; padding: 20px; }
        .modal-content { background: white; padding: 24px; border-radius: 20px; width: 100%; max-width: 800px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 16px; max-height: 90vh; animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        
        .modal-header { display: flex; justify-content: space-between; align-items: center; }
        .modal-title { margin: 0; font-size: 22px; font-weight: 700; }
        .modal-textarea { width: 100%; height: 400px; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); font-family: 'Fira Code', monospace; font-size: 14px; line-height: 1.6; resize: vertical; box-sizing: border-box; transition: all 0.2s; background: #f8fafc; }
        .modal-textarea:focus { outline: none; border-color: var(--primary); background: white; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
        .modal-textarea.readonly { background: #f1f5f9; color: var(--text-muted); cursor: default; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }

        /* Скелетоны и спиннер */
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .spinner { border: 3px solid #e2e8f0; border-top: 3px solid var(--primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 0.8s linear infinite; }
        .skeleton { background: #e2e8f0; height: 65px; border-radius: 12px; margin-bottom: 12px; animation: pulse 1.5s infinite ease-in-out; }
      `}</style>

      <header className="header">
        <div className="header-logo">📚 OCR Конспекты</div>
        <button onClick={logout} className="btn-logout">Выйти</button>
      </header>

      <main className="main-content">
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {loading ? (
            <><div className="spinner"></div><p className="dropzone-text" style={{ color: 'var(--primary)' }}>Магия распознавания...</p></>
          ) : (
            <><div style={{ fontSize: 45, marginBottom: 10 }}>✨</div><p className="dropzone-text">{isDragActive ? "Отпускайте, я готов!" : "Перетащите PDF или картинку сюда"}</p><p style={{ fontSize: 13, color: '#94a3b8', marginTop: 5 }}>или нажмите для выбора файла</p></>
          )}
        </div>

        <h3 className="files-title">История загрузок</h3>

        {isInitialLoading ? (
          <div><div className="skeleton"></div><div className="skeleton"></div><div className="skeleton"></div></div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <p>Здесь пока пусто. Загрузите свой первый конспект!</p>
          </div>
        ) : (
          <ul className="file-list">
            {notes.map((n) => (
              <li key={n.id} onClick={() => n.status === "done" && setSelectedNote(n)} className={`file-item ${n.status === "done" ? "clickable" : ""}`}>
                <div className="file-info">
                  <span style={{ color: '#334155' }}>{n.filename}</span>
                  <span className={`status-badge ${n.status === "done" ? "status-done" : "status-pending"}`}>
                    {n.status === "done" ? "Готово" : "В процессе"}
                  </span>
                </div>
                <button onClick={(e) => handleDelete(n.id, e)} className="btn-icon" title="Удалить">🗑️</button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selectedNote && (
        <div className="modal-overlay" onClick={() => { setSelectedNote(null); setIsEditing(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedNote.filename}</h2>
              <button onClick={() => { setSelectedNote(null); setIsEditing(false); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>×</button>
            </div>
            <textarea readOnly={!isEditing} value={selectedNote.text || ""} onChange={(e) => setSelectedNote({ ...selectedNote, text: e.target.value })} className={`modal-textarea ${!isEditing ? 'readonly' : ''}`} />
            <div className="modal-actions">
              {isEditing ? (
                <button onClick={handleSave} className="btn-primary">💾 Сохранить изменения</button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="btn-secondary">✏️ Редактировать</button>
              )}
              <button onClick={() => { setSelectedNote(null); setIsEditing(false); }} className="btn-secondary">Закрыть</button>
            </div>
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
