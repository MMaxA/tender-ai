# TenderAI

MVP для сравнения технического задания (ТЗ) с коммерческими предложениями (КП).

## Стек

- Frontend: React + TypeScript + Vite
- Backend: FastAPI
- Database: PostgreSQL
- Local development: Docker Compose

## Запуск

Требуются Docker Desktop с включённым WSL2 backend и Git.

```powershell
git clone https://github.com/MMaxA/tender-ai.git
cd tender-ai
# Распакуйте файлы стартового каркаса в корень репозитория
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/api/health
- Swagger: http://localhost:8000/docs
- PostgreSQL: localhost:5433 (контейнерный порт 5432)

## Текущая функциональность\n\n- Создание, просмотр, редактирование и удаление анализов.\n- Статусы и сохранение записей в PostgreSQL.\n- Отдельная страница анализа с рабочей областью-заглушкой под документы и результаты.\n\n## Следующие этапы

1. Загрузка ТЗ и КП.
2. Извлечение текста из PDF/DOCX/XLSX.
3. Структурирование требований и параметров предложений.
4. Детерминированное сравнение и вывод с цитатами из исходных документов.

До подключения LLM сервис не отправляет документы во внешние модели.
