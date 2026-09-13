# diagrams

Архитектурные схемы как код. Исходники в `diagrams/*.json` в формате
[eraser-diagrams](https://github.com/eraserlabs/eraser-diagrams), рендер
в HTML и PNG, публикация на GitHub Pages:
**https://yarikmix.github.io/diagrams/**

| Схема | Что показывает |
| --- | --- |
| [deployment](https://yarikmix.github.io/diagrams/deployment.html) | VPS в Selectel, S3/CDN, клиент |
| [ci](https://yarikmix.github.io/diagrams/ci.html) | GitHub-репозитории, CI-пайплайны и их цели |
| [cd](https://yarikmix.github.io/diagrams/cd.html) | CD-пайплайны на VPS 5 / ARC и VPS 7 / Coolify |
| [integrations](https://yarikmix.github.io/diagrams/integrations.html) | Внешние сервисы и кто с ними говорит |

Таблица ведётся вручную: добавил файл в `diagrams/`, добавь строку сюда.
`dist/index.html` собирается автоматически.

## Локально

Нужны Node ≥ 22.12 и Google Chrome (или другой Chromium; путь в
переменной `CHROMIUM_PATH`).

```bash
npm ci
npm run validate   # схема и иконки, без браузера
npm run render     # dist/<name>.html и dist/<name>.png
npm run build      # validate + render + dist/index.html
npm run icons      # обновить icons.txt из каталога иконок Eraser
npm test
```

## Как править

Диаграммы правит агент Claude Code по скиллу
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `npm run validate`,
`npm run render`, посмотреть PNG, поправить координаты. Координаты
абсолютные, автораскладки узлов нет. Имена иконок в `icons.txt`.
Рендер автономен: в `dist/*.html` нет `file://` и внешних `src`,
`<link>`, `@import`, `url()`; ссылки `https://…` допустимы только внутри
`<a href>` (CLI делает их из подписей стрелок).

CI на pull request валидирует и рендерит схемы, артефакт `diagrams`
содержит `dist/`. Push в `main` публикует `dist/` на Pages. Один раз
вручную: Settings → Pages → Build and deployment → Source → GitHub
Actions, иначе job `deploy` падает с «Get Pages site failed».

Дизайн: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`.
