import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CircleHelp } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./Login";
import FAQ from "./components/FAQ";
import DocumentEditor from "./components/editor/DocumentEditor";
import type { Note } from "./components/editor/editor.types";

const API = "http://localhost:8000/api";

function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showOcrEditor, setShowOcrEditor] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const api = useMemo(
    () =>
      axios.create({
        baseURL: API,
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );

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

  const closeViewer = () => {
    if (selectedPdfUrl) URL.revokeObjectURL(selectedPdfUrl);
    setSelectedPdfUrl(null);
    setSelectedNote(null);
    setIsEditing(false);
    setShowOcrEditor(false);
  };

  const handleOpenNote = async (note: Note) => {
    const isPdf = note.filename.toLowerCase().endsWith(".pdf");
    setIsEditing(false);
    setShowOcrEditor(!isPdf);
    setSelectedNote(note);

    if (isPdf) {
      try {
        const response = await api.get(`/notes/${note.id}/file`, {
          responseType: "blob",
        });
        const url = URL.createObjectURL(response.data);
        setSelectedPdfUrl((oldUrl) => {
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          return url;
        });
      } catch (error) {
        setSelectedNote(null);
        alert("Не удалось открыть PDF-файл");
      }
    } else {
      if (selectedPdfUrl) URL.revokeObjectURL(selectedPdfUrl);
      setSelectedPdfUrl(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    onDrop: async (files) => {
      if (!files.length) return;
      setLoading(true);
      const formData = new FormData();
      formData.append("file", files[0]);
      try {
        await api.post("/notes", formData);
        loadNotes();
      } catch (error: any) {
        alert(error.response?.data?.detail || "Ошибка загрузки файла");
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
      if (selectedNote?.id === id) closeViewer();
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
    --primary: #818cf8;
    --primary-hover: #6366f1;
    --bg-gradient: linear-gradient(135deg, #0f172a 0%, #111827 100%);
    --card-bg: #1e293b;
    --text-main: #f1f5f9;
    --text-muted: #cbd5e1;
    --border-color: #334155;
    --danger: #f87171;
    --success: #34d399;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #0f172a;
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-gradient);
    color: var(--text-main);
  }

  .header {
    background: rgba(30, 41, 59, 0.95);
    border-bottom: 1px solid #334155;
    padding: 0 40px;
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }

  .header-logo {
    font-size: 22px;
    font-weight: 800;
    color: #a5b4fc;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-logout {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    padding: 9px 18px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: 0.2s;
  }

  .btn-logout:hover {
    background: #475569;
  }

  .main-content {
    max-width: 800px;
    width: 100%;
    margin: 40px auto;
    padding: 0 20px;
  }

  .dropzone {
    border: 2px dashed #64748b;
    border-radius: 16px;
    padding: 40px;
    text-align: center;
    cursor: pointer;
    background: #1e293b;
    transition: 0.3s;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.15);
  }

  .dropzone:hover,
  .dropzone.active {
    border-color: #818cf8;
    background: #263653;
    transform: translateY(-2px);
  }

  .dropzone-text {
    font-size: 16px;
    color: #cbd5e1;
    margin: 10px 0 0;
    font-weight: 500;
  }

  .files-title {
    margin: 40px 0 20px;
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
  }

  .file-list {
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #1e293b;
    padding: 16px 20px;
    border: 1px solid #334155;
    border-radius: 12px;
    transition: 0.2s;
    box-shadow: 0 3px 10px rgba(0,0,0,0.15);
  }

  .file-item:hover {
    transform: translateY(-2px);
    border-color: #64748b;
  }

  .file-item.clickable {
    cursor: pointer;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 15px;
    font-weight: 600;
    font-size: 15px;
    color: #f1f5f9;
  }

  .file-info span {
    color: #f1f5f9 !important;
  }

  .status-badge {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .status-done {
    background: #064e3b;
    color: #6ee7b7;
  }

  .status-pending {
    background: #713f12;
    color: #fde68a;
  }

  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 18px;
    padding: 8px;
    border-radius: 8px;
    transition: 0.2s;
  }

  .btn-icon:hover {
    background: #7f1d1d;
  }

  .btn-primary {
    background: #6366f1;
    color: white;
    border: none;
    padding: 11px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.2s;
  }

  .btn-primary:hover {
    background: #818cf8;
  }

  .btn-secondary {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.2s;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 50;
    padding: 20px;
  }

  .modal-content {
    background: #1e293b;
    color: #f8fafc;
    padding: 24px;
    border: 1px solid #475569;
    border-radius: 20px;
    width: 100%;
    max-width: 800px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 90vh;
    animation: modalIn 0.3s ease;
  }

  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .modal-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .modal-header-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-shrink: 1;
  }

  .faq-header-button {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    place-items: center;
    color: #f8fafc;
    background: #334155;
    border: 1px solid #475569;
    border-radius: 8px;
    cursor: pointer;
  }

  .faq-header-button:hover {
    background: #475569;
  }

  .modal-title {
    flex: 1 1 180px;
    min-width: 0;
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #f8fafc;
    overflow-wrap: anywhere;
  }

  .modal-textarea {
    width: 100%;
    height: 400px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid #475569;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    line-height: 1.7;
    resize: vertical;
    background: #0f172a;
    color: #f8fafc;
    transition: 0.2s;
  }

  .modal-textarea:focus {
    outline: none;
    border-color: #818cf8;
    box-shadow: 0 0 0 4px rgba(129,140,248,0.15);
  }

  .modal-textarea.readonly {
    background: #111827;
    color: #cbd5e1;
    cursor: default;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .spinner {
    border: 3px solid #334155;
    border-top: 3px solid #818cf8;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    100% { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .skeleton {
    background: #334155;
    height: 65px;
    border-radius: 12px;
    margin-bottom: 12px;
    animation: pulse 1.5s infinite ease-in-out;
  }

  @media (max-width: 600px) {
    .header {
      padding: 0 16px;
    }

    .header-logo {
      font-size: 18px;
    }

    .header-actions {
      gap: 8px;
    }

    .header-actions .btn-secondary,
    .header-actions .btn-logout {
      padding: 8px 10px;
      font-size: 12px;
    }

    .main-content {
      margin: 24px auto;
    }

    .dropzone {
      padding: 25px 15px;
    }

    .modal-content {
      padding: 16px;
    }

    .modal-textarea {
      height: 50vh;
    }
  }
`}</style>


      <header className="header">
        <div className="header-logo">📚 OCR Конспекты</div>
        <nav className="header-actions" aria-label="Основная навигация">
          <button type="button" onClick={() => setShowFaq(true)} className="btn-secondary">
            <CircleHelp size={17} aria-hidden="true" /> Помощь
          </button>
          <button onClick={logout} className="btn-logout">Выйти</button>
        </nav>
      </header>

      <main className="main-content">
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {loading ? (
            <><div className="spinner"></div><p className="dropzone-text" style={{ color: 'var(--primary)' }}>Загружаем файл...</p></>
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
            {notes.map((n) => {
              const isPdf = n.filename.toLowerCase().endsWith(".pdf");
              return (
                <li key={n.id} onClick={() => handleOpenNote(n)} className="file-item clickable">
                  <div className="file-info">
                    <span>{isPdf ? "📄" : "📝"} {n.filename}</span>
                    <span className={`status-badge ${isPdf || n.status === "done" ? "status-done" : "status-pending"}`}>
                      {isPdf ? "PDF" : n.status === "done" ? "Готово" : "Ошибка OCR"}
                    </span>
                  </div>
                  <button onClick={(e) => handleDelete(n.id, e)} className="btn-icon" title="Удалить">🗑️</button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {selectedNote && !selectedNote.filename.toLowerCase().endsWith(".pdf") && !showOcrEditor && (
        <DocumentEditor
          note={selectedNote}
          api={api}
          onClose={closeViewer}
          onOpenFaq={() => setShowFaq(true)}
          onReturnToOcr={() => setShowOcrEditor(true)}
        />
      )}

      {selectedNote && (selectedNote.filename.toLowerCase().endsWith(".pdf") || showOcrEditor) && (
        <div className="modal-overlay" onClick={closeViewer}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedNote.filename}</h2>
              <div className="modal-header-actions">
                {!selectedNote.filename.toLowerCase().endsWith(".pdf") && (
                  <button
                    type="button"
                    onClick={() => setShowOcrEditor(false)}
                    className="btn-secondary"
                  >
                    Редактировать изображение
                  </button>
                )}
                <button
                  type="button"
                  className="faq-header-button"
                  onClick={() => setShowFaq(true)}
                  aria-label="Открыть помощь"
                  title="Помощь"
                >
                  <CircleHelp size={19} aria-hidden="true" />
                </button>
                <button onClick={closeViewer} style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f8fafc' }}>×</button>
              </div>
            </div>
            {selectedNote.filename.toLowerCase().endsWith(".pdf") ? (
              selectedPdfUrl ? (
                <iframe
                  src={selectedPdfUrl}
                  title={selectedNote.filename}
                  style={{ width: "100%", height: "70vh", border: "1px solid #475569", borderRadius: 10, background: "white" }}
                />
              ) : (
                <div style={{ minHeight: 300, display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
                  <div className="spinner" />
                </div>
              )
            ) : (
              <textarea readOnly={!isEditing} value={selectedNote.text || ""} onChange={(e) => setSelectedNote({ ...selectedNote, text: e.target.value })} className={`modal-textarea ${!isEditing ? 'readonly' : ''}`} />
            )}
            <div className="modal-actions">
              {!selectedNote.filename.toLowerCase().endsWith(".pdf") && (
                isEditing ? (
                  <button onClick={handleSave} className="btn-primary">💾 Сохранить изменения</button>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="btn-secondary">✏️ Редактировать</button>
                )
              )}
              <button onClick={closeViewer} className="btn-secondary">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showFaq && <FAQ onClose={() => setShowFaq(false)} />}
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
