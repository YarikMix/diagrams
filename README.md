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

Нужны bun ≥ 1.3, Node ≥ 22.12 и Google Chrome (или другой Chromium; путь в
переменной `CHROMIUM_PATH`). bun ставит зависимости и запускает скрипты и
тесты. Рендерер eraser-diagrams запускается под Node: под bun он зависает
на запуске Chrome.

bun ставится с https://bun.sh. Без настоящего Node в PATH `bun run render`
и `bun run build` останавливаются с ошибкой, а не зависают.

```bash
bun install
bun run validate   # схема и иконки, без браузера
bun run check      # цветовая конвенция и легенды, без браузера
bun run render     # dist/<name>.html и dist/<name>.png
bun run build      # validate + check + render + dist/index.html
bun run site       # build + превью всех веток origin в dist/branches/
bun run icons      # обновить icons.txt из каталога иконок Eraser
bun run test
```

## Как править

Диаграммы правит агент Claude Code по скиллу
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `bun run validate`,
`bun run check`, `bun run render`, посмотреть PNG, поправить координаты.
Цвета групп и стрелок задаёт конвенция, её проверяет `bun run check`. Координаты
абсолютные, автораскладки узлов нет. Имена иконок в `icons.txt`.
Рендер автономен: в `dist/*.html` нет `file://` и внешних `src`,
`<link>`, `@import`, `url()`; ссылки `https://…` допустимы только внутри
`<a href>` (CLI делает их из подписей стрелок).

CI на pull request валидирует и рендерит схемы, артефакт `diagrams`
содержит `dist/`. Push в `main` публикует `dist/` на Pages. Один раз
вручную: Settings → Pages → Build and deployment → Source → GitHub
Actions, иначе job `deploy` падает с «Get Pages site failed».

## Превью веток

Push в любую ветку публикует её схемы по адресу
`https://yarikmix.github.io/diagrams/branches/<slug>/`, где slug это имя
ветки, в котором всё, кроме латиницы, цифр, `.`, `_` и `-`, заменено на
`-`: `feature/new-vps` становится `feature-new-vps`. Список всех превью:
**https://yarikmix.github.io/diagrams/branches/**
Точный адрес ищи в этом списке: при совпадении имён к slug добавляется
короткий SHA.

Push в ветку запускает workflow Pages на `main`. Тот собирает `main` и все
ветки их собственными скриптами (`bun run site`) и публикует единым
сайтом, поэтому превью появляется через несколько минут. После удаления
ветки её превью исчезает при следующем запуске. Ветка, которая не
собралась, остаётся в списке с пометкой «не собралась» и шагом, на котором
упала. Слитые ветки лучше удалять: каждая добавляет время сборки.

Ветка, созданная до появления этого workflow в `main`, начнёт обновлять
превью только после того, как в неё попадёт свежий
`.github/workflows/pages.yml` из `main`.

Сборка превью выполняет код каждой ветки в том же job, который публикует
сайт. Поэтому ветка может изменить весь опубликованный сайт до следующего
деплоя из `main`. Писать ветки в репозиторий могут только участники с
правом push. Локально `bun run site` делает `git fetch --prune` всех веток
`origin`.

Дизайн: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`,
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`,
`docs/superpowers/specs/2026-09-13-branch-previews-design.md`.
