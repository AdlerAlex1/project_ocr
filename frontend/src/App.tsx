import { useEffect, useState } from "react";
import axios from "axios";
import { useDropzone } from "react-dropzone";

const API = "http://localhost:8000/api";

type Note = { id: string; filename: string; status: string; text: string | null };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null); // Для модалки

  const loadNotes = () => {
    axios.get<Note[]>(`${API}/notes`).then((res) => setNotes(res.data));
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [], "application/pdf": [] },
    onDrop: async (files) => {
      if (!files.length) return;
      setLoading(true);
      
      const formData = new FormData();
      formData.append("file", files[0]);

      try {
        await axios.post(`${API}/notes`, formData);
        loadNotes();
      } catch (error) {
        console.error("Ошибка загрузки:", error);
        alert("Не удалось загрузить файл");
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Конспекты + OCR</h1>
      
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? "#4CAF50" : "#888"}`,
          background: isDragActive ? "#f0fff0" : "transparent",
          padding: 40,
          textAlign: "center",
          cursor: "pointer",
          borderRadius: 8,
          transition: "0.2s",
        }}
      >
        <input {...getInputProps()} />
        {loading ? (
          <p>Загрузка и распознавание... (займет пару секунд)</p>
        ) : isDragActive ? (
          <p>Отпускай файл сюда!</p>
        ) : (
          <p>Перетащи фото конспекта сюда или кликни, чтобы выбрать</p>
        )}
      </div>

      <h3 style={{ marginTop: 40 }}>Загруженные файлы:</h3>
      {notes.length === 0 ? (
        <p style={{ color: "#888" }}>Пока пусто</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {notes.map((n) => (
            <li 
              key={n.id} 
              style={{ 
                marginBottom: 10, padding: 10, border: "1px solid #ddd", borderRadius: 4,
                cursor: n.status === "done" ? "pointer" : "default",
                background: n.status === "done" ? "#f9f9f9" : "transparent"
              }}
              onClick={() => {
                if (n.status === "done") setSelectedNote(n);
              }}
            >
              <strong>{n.filename}</strong> — статус: 
              <span style={{ color: n.status === "done" ? "green" : n.status === "error" ? "red" : "orange", marginLeft: 5 }}>
                {n.status}
              </span>
              {n.status === "done" && <span style={{ color: "#888", fontSize: 12, marginLeft: 10 }}>(нажми, чтобы прочитать)</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Модальное окно для просмотра текста */}
      {selectedNote && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div style={{
            background: "white", padding: 20, borderRadius: 8, width: "80%", maxWidth: 800, maxHeight: "80%", display: "flex", flexDirection: "column"
          }}>
            <h2 style={{ marginTop: 0 }}>{selectedNote.filename}</h2>
            <textarea 
              readOnly 
              value={selectedNote.text || ""}
              style={{ flex: 1, minHeight: 300, padding: 10, fontFamily: "monospace", fontSize: 14, resize: "none" }}
            />
            <button 
              onClick={() => setSelectedNote(null)}
              style={{ marginTop: 10, padding: "8px 16px", cursor: "pointer", alignSelf: "flex-end" }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}