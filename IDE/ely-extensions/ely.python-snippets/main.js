/* Snippets de Python · proveedor de autocompletado aceptado con Tab.
 * El host llama a provideCompletionItems({text, line, prefix, language, lineIndex})
 * y espera [{label, insertText, detail, kind}]. */
const SNIPPETS = [
  { label: "def", detail: ["función", "function"], insertText: "def nombre(arg):\n    return arg\n" },
  { label: "class", detail: ["clase", "class"], insertText: "class Nombre:\n    def __init__(self):\n        pass\n" },
  { label: "ifmain", detail: ["punto de entrada", "entry point"], insertText: "if __name__ == \"__main__\":\n    main()\n" },
  { label: "for", detail: ["bucle for", "for loop"], insertText: "for elemento in elementos:\n    print(elemento)\n" },
  { label: "while", detail: ["bucle while", "while loop"], insertText: "while condicion:\n    break\n" },
  { label: "try", detail: ["try/except", "try/except"], insertText: "try:\n    pass\nexcept Exception as exc:\n    print(exc)\n" },
  { label: "with", detail: ["gestor de contexto", "context manager"], insertText: "with open(ruta, \"r\", encoding=\"utf-8\") as fh:\n    data = fh.read()\n" },
  { label: "dataclass", detail: ["dataclass", "dataclass"], insertText: "from dataclasses import dataclass\n\n\n@dataclass\nclass Dato:\n    nombre: str\n" },
  { label: "main", detail: ["función main", "main function"], insertText: "def main() -> None:\n    pass\n\n\nif __name__ == \"__main__\":\n    main()\n" },
  { label: "pytest", detail: ["test", "test"], insertText: "def test_algo():\n    assert True\n" },
  { label: "lambda", detail: ["función anónima", "anonymous function"], insertText: "lambda x: x" },
  { label: "print", detail: ["imprimir", "print"], insertText: "print()" },
  { label: "import", detail: ["importar módulo", "import module"], insertText: "import " },
  { label: "from", detail: ["importar desde", "import from"], insertText: "from  import " },
  { label: "async", detail: ["función asíncrona", "async function"], insertText: "async def nombre():\n    await algo()\n" },
  { label: "listcomp", detail: ["lista por comprensión", "list comprehension"], insertText: "[x for x in elementos]" },
  { label: "dictcomp", detail: ["diccionario por comprensión", "dict comprehension"], insertText: "{k: v for k, v in pares}" }
];

async function activate(ely) {
  await ely.languages.registerCompletionItemProvider(["python"], {
    label: ely.l10n("Snippets Python", "Python snippets"),
    provideCompletionItems(ctx) {
      const prefix = (ctx.prefix || "").toLowerCase();
      if (!prefix) return [];
      return SNIPPETS
        .filter((s) => s.label.startsWith(prefix) && s.label !== prefix)
        .slice(0, 8)
        .map((s) => ({
          label: s.label,
          insertText: s.insertText,
          detail: Array.isArray(s.detail) ? ely.l10n(s.detail[0], s.detail[1]) : s.detail,
          kind: "snippet",
          /* El snippet sustituye el prefijo ya escrito. */
          replacePrefix: true
        }));
    }
  }, ["."]);
  ely.on("language", () => ely.log(ely.l10n("snippets de Python registrados", "python snippets ready")));
  ely.log(ely.l10n("snippets de Python registrados", "python snippets ready"));
}
