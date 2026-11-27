import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type AnalysisStatus = 'draft' | 'in_progress' | 'completed';
type Analysis = {
  id: number;
  title: string;
  description: string | null;
  status: AnalysisStatus;
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<AnalysisStatus, string> = {
  draft: 'Черновик',
  in_progress: 'В работе',
  completed: 'Завершён',
};

function App() {
  const [apiStatus, setApiStatus] = React.useState('Проверяем API…');
  const [analyses, setAnalyses] = React.useState<Analysis[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');

  const loadAnalyses = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analyses');
      if (!response.ok) throw new Error('Не удалось загрузить список анализов');
      setAnalyses(await response.json());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API недоступен');
        return response.json();
      })
      .then((data) => setApiStatus(`API: ${data.status}`))
      .catch(() => setApiStatus('API: нет соединения'));
    void loadAnalyses();
  }, [loadAnalyses]);

  async function createAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || 'Не удалось создать анализ');
      }
      setTitle('');
      setDescription('');
      setShowForm(false);
      await loadAnalyses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  }

  function startEditing(item: Analysis) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description ?? '');
    setError('');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>, item: Analysis) {
    event.preventDefault();
    if (!editTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/analyses/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription.trim() || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || 'Не удалось сохранить изменения');
      }
      cancelEditing();
      await loadAnalyses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Analysis, status: AnalysisStatus) {
    const response = await fetch(`/api/analyses/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) { setError('Не удалось изменить статус'); return; }
    await loadAnalyses();
  }

  async function deleteAnalysis(item: Analysis) {
    if (!window.confirm(`Удалить анализ «${item.title}»?`)) return;
    const response = await fetch(`/api/analyses/${item.id}`, { method: 'DELETE' });
    if (!response.ok) { setError('Не удалось удалить анализ'); return; }
    await loadAnalyses();
  }

  return (
    <main className="page">
      <header className="topbar"><a className="brand" href="/"><span className="logo">T</span><strong>TenderAI</strong></a><span className="status">{apiStatus}</span></header>
      <section className="hero">
        <p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p>
        <h1>Анализы закупок</h1>
        <p className="lead">Создавайте анализы, чтобы собрать ТЗ и предложения поставщиков в одном месте. Загрузка документов появится следующим этапом.</p>
        <button className="primary" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Отмена' : '+ Новый анализ'}</button>
      </section>

      {showForm && <section className="form-panel">
        <h2>Новый анализ</h2>
        <form onSubmit={createAnalysis}>
          <label>Название анализа<input autoFocus maxLength={200} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Закупка диагностического оборудования" /></label>
          <label>Описание <span className="muted">(необязательно)</span><textarea maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Краткая заметка для команды" /></label>
          <button className="primary" type="submit" disabled={saving || !title.trim()}>{saving ? 'Создаём…' : 'Создать анализ'}</button>
        </form>
      </section>}

      {error && <div className="error" role="alert">{error}</div>}
      <section className="workspace">
        <div className="section-heading"><div><h2>Ваши анализы</h2><p>Сохранённые рабочие записи</p></div><button className="secondary" onClick={() => void loadAnalyses()} disabled={loading}>Обновить</button></div>
        {loading ? <p className="empty">Загружаем список…</p> : analyses.length === 0 ? <div className="empty-state"><div className="empty-icon">＋</div><h3>Пока нет анализов</h3><p>Создайте первую запись. Документы можно будет добавить позже.</p><button className="secondary" onClick={() => setShowForm(true)}>Создать анализ</button></div> : <div className="analysis-list">{analyses.map((item) => <article className="analysis-card" key={item.id}>
          <div className="analysis-main"><span className={`status-pill ${item.status}`}>{statusLabels[item.status]}</span>
            {editingId === item.id ? <form className="edit-form" onSubmit={(event) => void saveEdit(event, item)}>
              <label>Название анализа<input autoFocus required maxLength={200} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
              <label>Описание <span className="muted">(необязательно)</span><textarea rows={3} maxLength={2000} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></label>
              <div className="edit-form-actions"><button className="primary" type="submit" disabled={saving || !editTitle.trim()}>{saving ? 'Сохраняем…' : 'Сохранить'}</button><button className="secondary" type="button" onClick={cancelEditing} disabled={saving}>Отмена</button></div>
            </form> : <><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</>}
            <small>Создан: {new Date(item.created_at).toLocaleString('ru-RU')} · Изменён: {new Date(item.updated_at).toLocaleString('ru-RU')}</small></div>
          <div className="analysis-actions"><label className="status-select-label">Статус<select value={item.status} onChange={(e) => void updateStatus(item, e.target.value as AnalysisStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{editingId !== item.id && <button className="secondary" onClick={() => startEditing(item)}>Редактировать</button>}<button className="danger" onClick={() => void deleteAnalysis(item)}>Удалить</button></div>
        </article>)}</div>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
