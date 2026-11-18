import { useState } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegister) {
        // Регистрация
        await axios.post("http://localhost:8000/register", { email, password });
        alert("Успешно зарегистрирован! Теперь войдите.");
        setIsRegister(false);
      } else {
        // Вход (OAuth2 требует отправки данных в формате формы)
        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);
        
        const res = await axios.post("http://localhost:8000/token", formData);
        login(res.data.access_token);
        navigate("/"); // Перекидываем на главную
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || "Ошибка. Проверьте данные.");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", fontFamily: "sans-serif" }}>
      <h2>{isRegister ? "Регистрация" : "Вход в личный кабинет"}</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input 
          type="email" placeholder="Email" value={email} 
          onChange={e => setEmail(e.target.value)} required 
          style={{ padding: 8 }}
        />
        <input 
          type="password" placeholder="Пароль" value={password} 
          onChange={e => setPassword(e.target.value)} required 
          style={{ padding: 8 }}
        />
        <button type="submit" style={{ padding: 10, cursor: "pointer", background: "#007bff", color: "white", border: "none", borderRadius: 4 }}>
          {isRegister ? "Зарегистрироваться" : "Войти"}
        </button>
      </form>
      <p style={{ marginTop: 20, cursor: "pointer", color: "blue" }} onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
      </p>
    </div>
  );
}