
import { useState, FormEvent } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const API = "http://localhost:8000/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await axios.post(`${API}/register`, {
          email,
          password,
        });
      }

      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await axios.post(`${API}/token`, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      login(response.data.access_token);
      navigate("/");
    } catch (err: any) {
      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : isRegister
            ? "Не удалось зарегистрироваться. Возможно, email уже занят."
            : "Неверный email или пароль."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#f1f5f9",
      padding: 20,
      fontFamily: "Arial, sans-serif"
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "white",
          padding: 32,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
        }}
      >
        <h2 style={{ textAlign: "center", color: "#4F46E5" }}>
          📚 OCR Конспекты
        </h2>

        <h3 style={{ textAlign: "center" }}>
          {isRegister ? "Регистрация" : "Вход"}
        </h3>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />

        <label>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />

        {error && (
          <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: "#4F46E5",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 16
          }}
        >
          {loading
            ? "Подождите..."
            : isRegister
              ? "Зарегистрироваться"
              : "Войти"}
        </button>

        <p style={{ textAlign: "center", marginTop: 20 }}>
          {isRegister ? "Уже есть аккаунт?" : "Нет аккаунта?"}
          {" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={{
              border: "none",
              background: "none",
              color: "#4F46E5",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            {isRegister ? "Войти" : "Регистрация"}
          </button>
        </p>
      </form>
    </div>
  );
}
