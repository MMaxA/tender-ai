import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [apiStatus, setApiStatus] = React.useState('Проверяем API…');

  React.useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API недоступен');
        return response.json();
      })
      .then((data) => setApiStatus(`API: ${data.status}`))
      .catch(() => setApiStatus('API: нет соединения'));
  }, []);

  return (
    <main className="page">
      <header className="topbar"><span className="logo">T</span><strong>TenderAI</strong><span className="status">{apiStatus}</span></header>
      <section className="hero">
        <p className="eyebrow">АНАЛИЗ ЗАКУПОЧНЫХ ДОКУМЕНТОВ</p>
        <h1>Сравнивайте КП<br />с требованиями ТЗ</h1>
        <p className="lead">Загрузите техническое задание и коммерческие предложения, чтобы выявить соответствия, расхождения и вопросы для проверки.</p>
        <button disabled>Новый анализ — следующий этап</button>
      </section>
      <section className="steps" aria-label="Этапы анализа">
        <article><span>01</span><h2>Техническое задание</h2><p>Выделяем требования и обязательные параметры.</p></article>
        <article><span>02</span><h2>Коммерческие предложения</h2><p>Собираем данные поставщиков в единую структуру.</p></article>
        <article><span>03</span><h2>Сравнение и вывод</h2><p>Показываем различия с указанием источников.</p></article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
