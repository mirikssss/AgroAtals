# Деплой на Vercel и управление версиями через GitHub

Пошаговая инструкция: как задеплоить проект на Vercel и настроить автоматическое обновление при пуше в GitHub.

---

## 1. Репозиторий на GitHub

### Если репозитория ещё нет

1. Создайте репозиторий на [github.com](https://github.com/new):
   - Название, например: `agro-atlas` или `ruo`
   - Public
   - **Не** добавляйте README, .gitignore, license — они уже есть в проекте

2. В корне проекта выполните:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Подставьте вместо `YOUR_USERNAME` и `YOUR_REPO` свои данные.

### Если репозиторий уже есть

Убедитесь, что текущая ветка (например, `main`) запушена:

```bash
git status
git push origin main
```

---

## 2. Деплой на Vercel

1. Зайдите на [vercel.com](https://vercel.com) и войдите через **GitHub** (Sign in with GitHub).

2. Нажмите **Add New…** → **Project**.

3. **Import** репозитория:
   - Выберите нужный репозиторий (если его нет — нажмите **Configure GitHub App** и дайте доступ к репозиторию).
   - Нажмите **Import**.

4. Настройки проекта (обычно менять не нужно):
   - **Framework Preset:** Next.js (определится автоматически)
   - **Root Directory:** `./` (корень репозитория)
   - **Build Command:** `next build`
   - **Output Directory:** оставить по умолчанию

5. **Environment Variables** (важно для AI-рекомендаций):
   - Добавьте переменную:
     - **Name:** `GEMINI_API_KEY` или `NEXT_PUBLIC_GEMINI_API_KEY`
     - **Value:** ваш ключ API Gemini (из [Google AI Studio](https://aistudio.google.com/apikey))
   - Без ключа приложение соберётся, но рекомендации будут работать в режиме mock.

6. Нажмите **Deploy**. Дождитесь окончания сборки.

После деплоя Vercel выдаст URL вида: `https://your-project.vercel.app`.

---

## 3. Управление версиями: push → обновление деплоя

После того как проект подключён к GitHub:

- **Каждый push в ветку по умолчанию** (чаще всего `main`) **запускает новый деплой**.
- В [Dashboard Vercel](https://vercel.com/dashboard) → ваш проект → вкладка **Deployments** видны все сборки и их статус.

Типичный цикл:

1. Вносите изменения локально.
2. Коммит и пуш:
   ```bash
   git add .
   git commit -m "Описание изменений"
   git push origin main
   ```
3. Vercel автоматически собирает и деплоит новую версию.
4. Просмотр логов и статуса: Vercel Dashboard → проект → Deployments.

---

## 4. Дополнительно

- **Preview-деплои:** для каждой ветки и pull request Vercel создаёт отдельный preview-URL (удобно для проверки перед слиянием в `main`).
- **Переменные окружения:** изменить или добавить переменные можно в Vercel: **Project → Settings → Environment Variables**. После изменения нужно сделать **Redeploy** последнего деплоя.
- **Домен:** в **Project → Settings → Domains** можно привязать свой домен к проекту.

---

## Краткий чеклист

| Шаг | Действие |
|-----|----------|
| 1 | Репозиторий на GitHub создан, код запушен в `main` |
| 2 | На Vercel импортирован проект из этого репозитория |
| 3 | Добавлена переменная `GEMINI_API_KEY` (или `NEXT_PUBLIC_GEMINI_API_KEY`) |
| 4 | Первый деплой прошёл успешно |
| 5 | После каждого `git push origin main` деплой обновляется автоматически |
