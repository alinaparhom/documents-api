# PROJECT_OVERVIEW.md
## Документооборот + AI (Web + Telegram Mini App)

---

## 1) Что это за проект

Проект автоматизирует работу с документами:

- показывает список документов;
- открывает вложения (PDF/изображения/файлы);
- помогает сформировать ответ через ИИ;
- подставляет текст ИИ в DOCX/PDF шаблон;
- отдаёт готовый файл пользователю.

Поддерживаются:
- Web-версия,
- Telegram Mini App (Android / iOS / Web).

---

## 2) Архитектура простыми словами

### Frontend
- Web UI: `docs.js`, `docs-ai-response-modal.js`, `docssettings.js`
- Telegram UI: `app/telegram-appdosc.html`, `app/telegram-appdosc.js`, `app/telegram-ai-response-dialog.js`
- Просмотр PDF: `app/apppdf.js` + `pdf/pdf.min.js` + `pdf/pdf.worker.min.js`

### Backend
- Главный API и бизнес-логика: `docs.php`
- AI генерация/шаблоны: `api-docs.php`
- VIP/Groq AI: `api-groq-paid.php`

---

## 3) Ключевые файлы и за что отвечают

### Backend
- `docs.php` — основной backend API для документов, задач, логов, Telegram-сценариев.
- `api-docs.php` — AI endpoint для анализа/генерации и сборки DOCX/PDF из шаблонов.
- `api-groq-paid.php` — VIP AI endpoint (Groq), обработка файлов/текста/аудио.

### Frontend Web
- `docs.js` — основной интерфейс таблицы документов и действий.
- `docs-ai-response-modal.js` — модалка “Ответ с помощью ИИ”.
- `docssettings.js` — интерфейс настроек таблицы/колонок/поведения.

### Telegram Mini App
- `app/telegram-appdosc.html` — входная HTML-страница Mini App.
- `app/telegram-appdosc.js` — основная логика Mini App (задачи, файлы, ИИ, логи).
- `app/telegram-ai-response-dialog.js` — Telegram AI диалог.
- `app/ai-short_repsonse.js` — быстрый (краткий) AI режим.
- `app/apppdf.js` — просмотр PDF/медиа с zoom и mobile-поведением.

### Шаблоны и служебные
- `app/templates/template.docx` — базовый шаблон DOCX.
- `pdf/pdf.min.js`, `pdf/pdf.worker.min.js` — библиотека PDF.js.
- `app/env.txt` — локальные переменные окружения (секреты не хранить в Git).
- `pdf/desktop.ini` — служебный файл Windows.

---

## 4) Где хранятся сгенерированные файлы

Когда ИИ вернул текст и система собрала документ:

- файл сохраняется во временную папку  
  **`/app/tmp/generated/`**;
- имя генерируется как  
  **`generated-YYYYmmdd-HHMMSS-<random>.docx`** (или `.pdf`);
- клиент получает публичный URL вида  
  **`/app/tmp/generated/<fileName>`**;
- старые временные файлы автоматически удаляются (TTL ~2 часа).

---

## 5) Где лежат шаблоны документов организации

При генерации backend сначала ищет шаблон организации:

- **`/documents/{организация}/{организация}_template.docx`**

Пример:
- организация `acme`
- путь: `/documents/acme/acme_template.docx`

Если не найден — используются fallback-шаблоны (`template.docx` из стандартных директорий шаблонов).

---

## 6) Системный промпт ИИ: где хранится

Системные инструкции для ответа ИИ лежат в коде клиента (несколько режимов):

1. **Web модалка**  
   `docs-ai-response-modal.js` → `DEFAULT_AI_BEHAVIOR`
2. **Telegram диалог**  
   `app/telegram-ai-response-dialog.js` →  
   `RESPONSE_OUTPUT_DIRECTIVE` + `SYSTEM_TONE_PROMPTS`
3. **VIP DOCX режим**  
   `docx-ai-paid.js` →  
   `RESPONSE_OUTPUT_DIRECTIVE` + `SYSTEM_TONE_PROMPTS`

То есть “системное поведение” задаётся прямо в JS-константах, а затем добавляется в итоговый prompt перед отправкой на API.

---

## 7) Полный путь: от выбора файла до ответа ИИ

1. Пользователь выбирает документ(ы) и пишет задачу.
2. Клиент собирает `FormData` (в т.ч. `action=ai_response_analyze`, prompt, параметры, вложения).
3. К prompt добавляются системные директивы (тон, правила формата ответа).
4. Запрос отправляется в `api-docs.php` (или VIP `api-groq-paid.php`).
5. Backend получает AI-текст.
6. Backend подставляет текст в шаблон DOCX/PDF.
7. Готовый файл сохраняется в `/app/tmp/generated/`.
8. Клиент получает URL и открывает предпросмотр/скачивание.

---

## 8) Метки (placeholders) в шаблоне DOCX

### Обязательная метка
- **`[ОТВЕТ ИИ]`** — обязательно должна быть в шаблоне.

Если её нет:
- генерация DOCX завершится ошибкой:  
  “проверьте, что в шаблоне есть метка [ОТВЕТ ИИ]”.

### Дополнительные метки (необязательные)
- `[DOCUMENT_TITLE]`
- `[ДЕНЬ]`
- `[МЕСЯЦ]`
- `[НОМЕР]`
- `[АДРЕСАТ]`

### Что будет, если поля не заполнить
- Для `[ДЕНЬ]`, `[МЕСЯЦ]`, `[НОМЕР]`, `[АДРЕСАТ]`:
  - если поле пустое, backend просто не добавляет замену для этой метки;
  - в результате метка может остаться в шаблоне как есть.
- Для `[ОТВЕТ ИИ]`:
  - если метка отсутствует в шаблоне — DOCX не соберётся (ошибка).

---

## 9) Важные заметки по эксплуатации

- Не хранить токены/секреты в репозитории (`app/env.txt` и `.env`).
- Для стабильной работы Mini App держать единые версии ассетов (кэш-версионирование уже реализовано).
- Для шаблонов организации использовать единый нейминг:  
  `{organization}_template.docx`.

---

## 10) Короткий чек-лист перед релизом

- [ ] В шаблоне есть `[ОТВЕТ ИИ]`
- [ ] Проверен путь шаблона организации `/documents/{org}/{org}_template.docx`
- [ ] Папка `/app/tmp/generated/` доступна на запись
- [ ] Секреты вынесены из репозитория
- [ ] Проверены сценарии Web + Telegram Android + Telegram iOS + Telegram Web
