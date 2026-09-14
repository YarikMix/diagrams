# Скрипты на TypeScript и API bun

Дата: 2026-09-14. Репозиторий: `YarikMix/diagrams`, ветка `feature/typescript`.
Статус: на ревью. Опирается на
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` и
`docs/superpowers/specs/2026-09-13-branch-previews-design.md`.
После утверждения план пишется скиллом `writing-plans`.

## 1. Цель

Скрипты `scripts/*.mjs` и их тесты переходят на TypeScript и идиоматичные API
bun. Поведение, коды выхода и тексты сообщений не меняются. Появляются типы
документа диаграммы и строгая проверка типов в CI.

## 2. Проверенные факты

Проверено 2026-09-14 на Windows 11 в песочнице, bun 1.4.2 локально и bun
1.3.13 из CI (`bunx bun@1.3.13`); результаты на обеих версиях совпали.

| API | Результат |
| --- | --- |
| `Bun.spawnSync(cmd, { timeout: 1000, killSignal: "SIGKILL", stdio: ["inherit", "inherit", "inherit"] })` на зависающем процессе | возврат через ~1 с, `exitCode: null`, `signalCode: "SIGKILL"`, `success: false`, `exitedDueToTimeout: true` |
| `Bun.spawnSync(["definitely-not-a-binary-xyz"])` | исключение, `code: "ENOENT"`, сообщение `Executable not found in $PATH: ...` |
| `Bun.spawnSync(["node", "-e", "process.stdout.write(process.versions.bun ? 'bun' : 'node')"])` | `exitCode: 0`, `stdout` `node` |
| `new Bun.Glob("*.ts").scanSync(dir)` | имена файлов без каталога |
| `import.meta.main`, `import.meta.dir` | `true` для запущенного файла, строка каталога |
| `Bun.write("out/nested/deep/index.html", ...)` | родительские каталоги создаются сами |
| `Bun.resolveSync("@eraserlabs/diagrams-cli/package.json", repoDir)` | абсолютный путь к `package.json` CLI |
| `Bun.deepEquals` | структурное сравнение |
| `Bun.file(path).json()`, `.text()`, `.exists()` | чтение JSON и текста, проверка файла |
| `bun:test`: `test`, `expect(...).toEqual/toMatch/toBe`, `afterEach` | работает |
| `tsc` из `typescript` 7.0.2 со `strict`, `noUncheckedIndexedAccess`, `types: ["bun"]` | проверяет код с API bun; `exitedDueToTimeout` есть в типах `@types/bun` 1.4.2 |

Для копирования и удаления каталогов, временных каталогов, `existsSync` по
каталогу и дописывания в файл у bun нет своих API: там остаётся `node:fs`.

Типы движка (`@eraserlabs/resolve`, `AuthoredEntity`, `AuthoredConnection`,
`DiagramInput`) общие: кроме базовых полей всё `unknown`, пакет только
транзитивная зависимость CLI. Их не используем.

## 3. Инструменты

- `devDependencies`: `"typescript": "7.0.2"`, `"@types/bun": "1.4.2"`, без `^`;
  `"@eraserlabs/diagrams-cli": "0.1.0"` без изменений. Runtime-зависимостей нет.
- `package.json` `scripts`: все `bun scripts/<имя>.mjs` становятся
  `bun scripts/<имя>.ts`; новый `"typecheck": "tsc"`.
- `tsconfig.json` в корне:

  ```json
  {
    "compilerOptions": {
      "target": "ESNext",
      "lib": ["ESNext"],
      "module": "Preserve",
      "moduleResolution": "bundler",
      "moduleDetection": "force",
      "allowImportingTsExtensions": true,
      "verbatimModuleSyntax": true,
      "noEmit": true,
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "skipLibCheck": true,
      "types": ["bun"]
    },
    "include": ["scripts/**/*.ts"]
  }
  ```

- Импорты между скриптами пишутся с расширением `.ts`.
- Точка входа каждого скрипта: `if (import.meta.main)`.

## 4. Типы документа, `scripts/diagram.ts`

Только типы, без кода.

- `PaletteColor = "blue" | "purple" | "green" | "orange" | "red" | "black" | "yellow" | "white"`
- `ZoneColor = "blue" | "purple" | "green"`
- `LineStyle = "solid" | "dashed" | "dotted"`
- `StyleMode = "plain" | "shadow" | "watercolor"`
- `EntityBase`: `id: string`, `x: number`, `y: number`, `width?: number`,
  `height?: number`, `containerId?: string`, `color?: PaletteColor`,
  `[prop: string]: unknown`.
- `GroupEntity extends EntityBase`: `tag: "Group"`, `styleMode?: StyleMode`,
  `title?: { text: string; icon?: string }`, `isContainer?: boolean`.
- `IconEntity extends EntityBase`: `tag: "Icon"`, `icon: string`,
  `texts?: { text: string }[]`.
- `ActivityEntity extends EntityBase`: `tag: "Activity"`, `texts?: { text: string }[]`.
- `TextboxEntity extends EntityBase`: `tag: "Textbox"`, `text: string`.
- `LegendEntry = { text: string; color: string }`.
- `LegendEntity extends EntityBase`: `tag: "Legend"`, `entries: LegendEntry[]`,
  `styleMode?: StyleMode`.
- `Entity = GroupEntity | IconEntity | ActivityEntity | TextboxEntity | LegendEntity`.
- `Relationship`: `tag?: "Relationship"`, `from: string`, `to: string`,
  `label?: string`, `color?: PaletteColor`, `lineStyle?: LineStyle`,
  `[prop: string]: unknown`.
- `DiagramDoc = { entities: Entity[]; connections: Relationship[] }`.
- Документ читается `Bun.file(path).json()` и приводится к `DiagramDoc` без
  проверки во время выполнения: схему гарантирует `bun run validate`, а
  `check-colors` обязан ловить неверные значения цветов и стилей даже при
  правильных типах.

## 5. Модули

Порядок перевода от листьев к корню. На каждом шаге модуль и его тест
переходят на `.ts`, старые `.mjs` удаляются.

| # | Модуль | Изменения |
| --- | --- | --- |
| 1 | `diagram.ts` (новый), `colors.ts` | типы §4; `flowOf(connection: Relationship, entitiesById: Record<string, Entity>)`, `expectedLegend(doc: DiagramDoc)`, `indexById(doc: DiagramDoc)`; тест палитры: динамический импорт `palette.js` движка, тест `DEFAULT_EDGE_HEX` читает `normalizers.js` через `Bun.file().text()` |
| 2 | `check-colors.ts` | список `Bun.Glob("*.json").scanSync("diagrams")` по алфавиту; `Bun.file().json()`; `Bun.deepEquals` для легенды; `main()` асинхронная, `process.exit(await main())` |
| 3 | `build-index.ts` | `diagramNames(dir)` через `Bun.Glob`; запись `Bun.write("dist/index.html", ...)` без `mkdirSync` |
| 4 | `fetch-icons.ts` | `fetch` без изменений; `Bun.write("icons.txt", ...)`; тип подменяемого `fetch`: `(url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>` |
| 5 | `eraser.ts` | `listDiagrams(dir)` через `Bun.Glob` с `join(dir, name)`; `cliEntry(): Promise<string>` через `Bun.resolveSync` и `Bun.file().json()`; запуск рендерера и проба node через `Bun.spawnSync`; `nodeProbeVerdict` принимает `{ error: { code?: string; message: string } } \| { exitCode: number \| null; stdout: string }` и возвращает `"ok" \| "missing" \| "bun" \| "failed"` по прежним правилам |
| 6 | `build-site.ts` | `run()` на `Bun.spawnSync` с `timeout`, `killSignal: "SIGKILL"`, `stdio: ["inherit", "inherit", "inherit"]`, `cwd`; исход `"timeout"` по `exitedDueToTimeout`, `"failed"` по исключению или ненулевому коду; вывод `git rev-parse` и `git for-each-ref` из `stdout`; индексы через `Bun.write`; `cpSync`, `rmSync`, `mkdtempSync`, `existsSync`, `appendFileSync` остаются на `node:fs` |

Экспортируемые имена, сигнатуры (кроме асинхронной `cliEntry` и входа
`nodeProbeVerdict`), тексты сообщений, коды выхода и порядок шагов
`build-site` не меняются.

## 6. Тесты

- Все шесть тестовых файлов переходят на `bun:test`: `assert.equal` →
  `expect().toBe`, `assert.deepEqual` → `expect().toEqual`, `assert.match` →
  `expect().toMatch`, `assert.doesNotMatch` → `expect().not.toMatch`,
  `assert.rejects` → `expect(promise).rejects.toThrow`, `assert.ok` →
  `expect().toBe(true)`; `t.after` → `afterEach` с уборкой временных каталогов.
- Сценарии и имена тестов сохраняются; всего 52 теста.
- `bun run typecheck` проверяет и тестовые файлы.

## 7. CI

В `.github/workflows/ci.yml` и в job `build` в `.github/workflows/pages.yml`
сразу после `bun install --frozen-lockfile` добавляется шаг
`- run: bun run typecheck`. Остальное без изменений.

## 8. Документация

- `.claude/skills/eraser-diagrams/SKILL.md`: `scripts/colors.mjs` →
  `scripts/colors.ts` (две ссылки); шаг «Перед коммитом» дополняется
  `bun run typecheck`.
- `README.md`: в списке команд `bun run typecheck   # строгая проверка типов скриптов`.
- Прежние спеки и планы не меняются.

## 9. Приёмка

До слияния:

- `bun run typecheck` без ошибок.
- `bun run test`: 52 pass, 0 fail.
- `git ls-files 'scripts/*.mjs'` пусто.
- `bun run build`: 4 схемы, `colors ok: 4 diagrams`, `dist/index.html: 4 diagrams`.
- `bun run site` против временного bare-репозитория в роли `origin`, как в
  плане превью: выход 0, текущая ветка и ветка эпохи npm собраны, ветка без
  `package.json` `не собралась: bun run build`, история клона не обрезана.
- `bun run site --main-built` без `dist/index.html`: сообщение и выход 1.
- CI в PR зелёный, в логе шаг `bun run typecheck` успешен.

После слияния: запуск `Pages` на `main` зелёный,
`https://yarikmix.github.io/diagrams/branches/` открывается.

## 10. Вне scope

- Проверка документа диаграммы во время выполнения по типам (zod и подобное).
- Типы из JSON Schema движка.
- Изменение логики, сообщений или поведения скриптов.
- Изоляция сборки веток в отдельный job.

## 11. Риски

- **TypeScript 7.** Новый нативный компилятор. Если он не принимает опцию
  `tsconfig` или ведёт себя иначе, откат на последнюю 5.x одной строкой в
  `package.json`.
- **`@types/bun` новее bun в CI.** Типы 1.4.2 описывают API, которых может не
  быть в 1.3.13. Все используемые API проверены на 1.3.13 (§2), тесты в CI
  идут на 1.3.13.
- **Скрипты только под bun.** Под node они больше не запускаются; вызовы в
  `package.json` и CI уже идут через bun.
- **Превью старых веток.** Каждая ветка собирается своими скриптами, ветки со
  старыми `.mjs` продолжают собираться как раньше.
