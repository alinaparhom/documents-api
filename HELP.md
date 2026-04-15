# SHORT_ONBOARDING.md
## Быстрый старт для нового разработчика (documents-api)

---

## 1) Что это за проект

`documents-api` — это документооборот с:
- Web интерфейсом;
- Telegram Mini App (Android / iOS / Web);
- AI-генерацией ответов по документам;
- сборкой итогового DOCX/PDF.

---

## 2) Ключевые точки входа

### Backend
- `docs.php` — главный API (документы, задачи, логи, доступы).
- `api-docs.php` — AI + сборка итогового DOCX/PDF.
- `api-groq-paid.php` — VIP AI (Groq).

### Frontend (Web)
- `docs.js` — основной интерфейс.
- `docs-ai-response-modal.js` — AI-модалка.
- `docssettings.js` — настройки UI.

### Telegram Mini App
- `app/telegram-appdosc.html` — входная страница Mini App.
- `app/telegram-appdosc.js` — основная логика Mini App.
- `app/telegram-ai-response-dialog.js` — Telegram AI-диалог.
- `app/apppdf.js` — просмотр PDF.

---

## 3) Где что хранится

- Базовый шаблон: `app/templates/template.docx`
- Шаблон организации: `/documents/{org}/{org}_template.docx`
- Готовые AI-файлы: `/app/tmp/generated/`
- PDF библиотека: `pdf/pdf.min.js`, `pdf/pdf.worker.min.js`
- Локальные env: `.env`, `app/.env`, `app/env.txt`

⚠️ Не коммитить секреты (токены, API ключи).

---

## 4) Как проходит AI-цепочка

1. Пользователь выбирает файл и пишет задачу.
2. Клиент отправляет `action=ai_response_analyze`.
3. Backend получает AI-ответ.
4. Подставляет ответ в DOCX/PDF шаблон.
5. Сохраняет файл в `/app/tmp/generated/`.
6. Возвращает URL для предпросмотра/скачивания.

---

## 5) Метки шаблона DOCX (важно)

### Обязательно
- `[ОТВЕТ ИИ]` — без неё DOCX-сборка упадёт.

### Опционально
- `[DOCUMENT_TITLE]`
- `[ДЕНЬ]`
- `[МЕСЯЦ]`
- `[ГОД]`
- `[НОМЕР]`
- `[АДРЕСАТ]`

Если опциональные поля не заполнены:
- замена не выполняется;
- метка остаётся в документе.

---

## 6) Где править, если “что-то сломалось”

### Не открывается файл / PDF
- `app/apppdf.js`
- `pdf/pdf.min.js`, `pdf/pdf.worker.min.js`
- логи Mini App в `docs.php` (соответствующие action)

### Не работает AI
- `docs-ai-response-modal.js` (Web)
- `app/telegram-ai-response-dialog.js` (Telegram)
- `api-docs.php`, `api-groq-paid.php` (backend)
- проверь API ключи/модели в env

### Не собирается DOCX
- проверь наличие `[ОТВЕТ ИИ]` в шаблоне
- проверь путь шаблона организации
- проверь права записи в `/app/tmp/generated/`

### Не применяются настройки UI
- `docssettings.js`
- соответствующие action в `docs.php`

---

## 7) Мини-чек перед деплоем

- [ ] AI отвечает в Web и Telegram
- [ ] DOCX/PDF генерируются
- [ ] Шаблон организации находится корректно
- [ ] `/app/tmp/generated/` writable
- [ ] Секреты не попали в Git
- [ ] Проверено в Telegram Android + iOS + Web

---

## 8) Полезные рабочие правила

- Сначала проверяй endpoint и `action`, потом UI.
- Для Mini App всегда тестируй мобильный сценарий.
- Любые изменения AI-подсказок фиксируй в одном месте и документируй.
- Если добавил новую метку в DOCX — сразу допиши её в документацию.
