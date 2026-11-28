import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type AnalysisStatus = 'draft' | 'in_progress' | 'completed';
type DocumentTextRead = {
  document_id: number;
  extracted_text: string;
  extracted_at: string;
  truncated: boolean;
};

type DocumentType = 'technical_specification' | 'commercial_offer' | 'other';

type AnalysisDocument = {
  id: number;
  analysis_id: number;
  original_name: string;
  extension: string;
  doc_type: DocumentType;
  size_bytes: number;
  uploaded_at: string;
};

type Analysis = {
  id: number;
  title: string;
  description: string | null;
  status: AnalysisStatus;
  created_at: string;
  updated_at: string;
};

const documentTypeLabels: Record<DocumentType, string> = {
  technical_specification: 'Техническое задание',
  commercial_offer: 'Коммерческое предложение',
  other: 'Другой документ',
};

const statusLabels: Record<AnalysisStatus, string> = {
  draft: 'Черновик',
  in_progress: 'В работе',
  completed: 'Завершён',
};

function App() {
  const [apiStatus, setApiStatus] = React.useState('Проверяем API…');
  const [selectedAnalysisId, setSelectedAnalysisId] = React.useState<number | null>(null);
  const [analyses, setAnalyses] = React.useState<Analysis[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [documents, setDocuments] = React.useState<AnalysisDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadDocType, setUploadDocType] = React.useState<DocumentType>('other');
  const [updatingDocTypeId, setUpdatingDocTypeId] = React.useState<number | null>(null);
  const [extractingId, setExtractingId] = React.useState<number | null>(null);
  const [extractedDocuments, setExtractedDocuments] = React.useState<Record<number, DocumentTextRead>>({});
  const [visibleTextId, setVisibleTextId] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const selectedAnalysis = analyses.find((item) => item.id === selectedAnalysisId) ?? null;

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
    setExtractedDocuments({});
      setVisibleTextId(null);
    if (selectedAnalysisId === null) {
      setDocuments([]);
      return;
    }
    let cancelled = false;
    setDocumentsLoading(true);
    fetch(`/api/analyses/${selectedAnalysisId}/documents`)
      .then((response) => {
        if (!response.ok) throw new Error('Не удалось загрузить список файлов');
        return response.json();
      })
      .then((data: AnalysisDocument[]) => { if (!cancelled) setDocuments(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки файлов'); })
      .finally(() => { if (!cancelled) setDocumentsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAnalysisId]);

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

  async function uploadDocuments(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selectedAnalysis || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('doc_type', uploadDocType);
        const response = await fetch(`/api/analyses/${selectedAnalysis.id}/documents`, {
          method: 'POST',
          body,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(`${file.name}: ${data?.detail || 'Не удалось загрузить файл'}`);
        }
      }
      const response = await fetch(`/api/analyses/${selectedAnalysis.id}/documents`);
      if (!response.ok) throw new Error('Файлы загружены, но список не обновился');
      setDocuments(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки файла');
      const response = await fetch(`/api/analyses/${selectedAnalysis.id}/documents`);
      if (response.ok) setDocuments(await response.json());
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(document: AnalysisDocument) {
    if (!selectedAnalysis) return;
    if (!window.confirm(`Удалить файл «${document.original_name}»?`)) return;
    const response = await fetch(
      `/api/analyses/${selectedAnalysis.id}/documents/${document.id}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      setError('Не удалось удалить файл');
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  async function updateDocumentType(document: AnalysisDocument, docType: DocumentType) {
    if (!selectedAnalysis || document.doc_type === docType) return;
    setUpdatingDocTypeId(document.id);
    setError('');
    try {
      const response = await fetch(
        `/api/analyses/${selectedAnalysis.id}/documents/${document.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_type: docType }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || 'Не удалось изменить тип документа');
      setDocuments((current) => current.map((item) => item.id === document.id ? data as AnalysisDocument : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения типа документа');
    } finally {
      setUpdatingDocTypeId(null);
    }
  }

  async function extractDocument(document: AnalysisDocument) {
    if (!selectedAnalysis) return;
    if (visibleTextId === document.id) {
      setVisibleTextId(null);
      return;
    }
    const cached = extractedDocuments[document.id];
    if (cached) {
      setVisibleTextId(document.id);
      return;
    }
    setExtractingId(document.id);
    setError('');
    try {
      const response = await fetch(
        `/api/analyses/${selectedAnalysis.id}/documents/${document.id}/extract`,
        { method: 'POST' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || 'Не удалось извлечь текст');
      setExtractedDocuments((current) => ({ ...current, [document.id]: data as DocumentTextRead }));
      setVisibleTextId(document.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка извлечения текста');
    } finally {
      setExtractingId(null);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  return (
    <main className="page">
      <header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); setSelectedAnalysisId(null); }}><span className="logo">T</span><strong>TenderAI</strong></a><span className="status">{apiStatus}</span></header>
      {selectedAnalysis ? <section className="detail-page">
        <button className="secondary back-button" onClick={() => setSelectedAnalysisId(null)}>← К списку анализов</button>
        <div className="detail-heading">
          <div><p className="eyebrow">АНАЛИЗ ЗАКУПКИ</p><h1>{selectedAnalysis.title}</h1>
            {selectedAnalysis.description && <p className="lead">{selectedAnalysis.description}</p>}
            <span className={`status-pill ${selectedAnalysis.status}`}>{statusLabels[selectedAnalysis.status]}</span>
          </div>
          <button className="secondary" onClick={() => { startEditing(selectedAnalysis); setSelectedAnalysisId(null); }}>Редактировать</button>
        </div>
        {error && <div className="error detail-error" role="alert">{error}</div>}
        <section className="detail-panel">
          <div className="documents-heading">
            <div><h2>Документы анализа</h2><p>Добавляйте ТЗ и коммерческие предложения. Обработка содержимого будет добавлена позже.</p></div>
            <div className="upload-controls">
              <label className="type-select-label">Тип новых файлов
                <select value={uploadDocType} onChange={(event) => setUploadDocType(event.target.value as DocumentType)} disabled={uploading}>
                  <option value="technical_specification">Техническое задание</option>
                  <option value="commercial_offer">Коммерческое предложение</option>
                  <option value="other">Другой документ</option>
                </select>
              </label>
              <label className={`primary upload-button ${uploading ? 'disabled' : ''}`}>
                {uploading ? 'Загружаем…' : '+ Добавить файлы'}
                <input type="file" multiple accept=".pdf,.docx,.xlsx,.txt" onChange={(event) => void uploadDocuments(event)} disabled={uploading} />
              </label>
            </div>
          </div>
          <p className="file-hint">Форматы: PDF, DOCX, XLSX, TXT. До 25 МБ на файл.</p>
          {documentsLoading ? <p className="empty">Загружаем список файлов…</p> : documents.length === 0 ? (
            <div className="detail-placeholder"><strong>Документы пока не добавлены</strong><span>Выберите файлы, чтобы прикрепить их к этому анализу.</span></div>
          ) : <div className="document-list">{documents.map((document) => (
            <article className="document-row" key={document.id}>
              <div className="document-icon">{document.extension.slice(1).toUpperCase()}</div>
              <div className="document-info"><strong>{document.original_name}</strong><span>{formatFileSize(document.size_bytes)} · Загружен {new Date(document.uploaded_at).toLocaleString('ru-RU')}</span><span>{documentTypeLabels[document.doc_type]}</span></div>
              <div className="document-actions">
                <select aria-label={`Тип документа ${document.original_name}`} value={document.doc_type} disabled={updatingDocTypeId === document.id} onChange={(event) => void updateDocumentType(document, event.target.value as DocumentType)}>
                  <option value="technical_specification">Техническое задание</option>
                  <option value="commercial_offer">Коммерческое предложение</option>
                  <option value="other">Другой документ</option>
                </select>
                <button className="secondary file-link" onClick={() => void extractDocument(document)} disabled={extractingId === document.id}>
                  {extractingId === document.id ? 'Извлекаем…' : visibleTextId === document.id ? 'Скрыть текст' : extractedDocuments[document.id] ? 'Показать текст' : 'Извлечь текст'}
                </button>
                <a className="secondary file-link" href={`/api/analyses/${selectedAnalysis.id}/documents/${document.id}/download`}>Скачать</a>
                <button className="danger" onClick={() => void deleteDocument(document)}>Удалить</button>
              </div>
              {visibleTextId === document.id && extractedDocuments[document.id] && (
                <div className="extracted-text">
                  <div className="extracted-text-heading"><strong>Извлечённый текст</strong><span>{extractedDocuments[document.id].truncated ? 'Текст обрезан до 1 000 000 символов' : 'Текст извлечён'}</span></div>
                  <pre>{extractedDocuments[document.id].extracted_text}</pre>
                </div>
              )}
            </article>
          ))}</div>}
        </section>
        <p className="detail-meta">Создан: {new Date(selectedAnalysis.created_at).toLocaleString('ru-RU')} · Изменён: {new Date(selectedAnalysis.updated_at).toLocaleString('ru-RU')}</p>
      </section> : <>
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
            </form> : <><h3><button className="analysis-title" onClick={() => setSelectedAnalysisId(item.id)}>{item.title}</button></h3>{item.description && <p>{item.description}</p>}</>}
            <small>Создан: {new Date(item.created_at).toLocaleString('ru-RU')} · Изменён: {new Date(item.updated_at).toLocaleString('ru-RU')}</small></div>
          <div className="analysis-actions"><label className="status-select-label">Статус<select value={item.status} onChange={(e) => void updateStatus(item, e.target.value as AnalysisStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{editingId !== item.id && <><button className="secondary" onClick={() => setSelectedAnalysisId(item.id)}>Открыть</button><button className="secondary" onClick={() => startEditing(item)}>Редактировать</button></>}<button className="danger" onClick={() => void deleteAnalysis(item)}>Удалить</button></div>
        </article>)}</div>}
      </section>
      </>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
