# Local Storage

Archivos locales **administrados por perfil**. Un *perfil* es la configuración
de usuario que se desea usar (proveedor + modelo + clave, p. ej. `openai`,
`anthropic`, `local`). Cada perfil tiene su propia carpeta, de modo que lo que
se genera o se planea en el perfil **A** no aparece en el perfil **B**.

## Estructura

```
Local Storage/
└── <perfil>/
    ├── generado/   → lo que YA se generó, para acceso rápido
    │   ├── sessions.json   (conversaciones guardadas del chat)
    │   └── …               (archivos producidos)
    └── planeado/   → lo que se PLANEA tener
        ├── items.json      (notas / borradores / planes)
        └── …               (archivos de referencia)
```

Las dos categorías responden a las dos formas de tener archivos en el computador:

- **`generado/`** — acceso rápido a lo que ya existe: las conversaciones que el
  chat guarda automáticamente y cualquier archivo ya producido.
- **`planeado/`** — lo que todavía se quiere conseguir: títulos y notas de lo
  que se planea generar o tener.

## Cómo se usa

- Desde el IDE: menú **Operaciones → Local Storage**. El selector de perfil
  cambia la carpeta que se muestra; cada perfil enseña solo lo suyo.
- Las conversaciones del chat se guardan solas en `generado/sessions.json` del
  perfil activo.
- Lo planeado se añade/edita/elimina desde la propia vista (o editando
  `planeado/items.json`).
- También puedes soltar archivos a mano en `generado/` o `planeado/`; la vista
  los lista con su tamaño y fecha.

## Notas

- El contenido de cada perfil (`Local Storage/<perfil>/`) es dato de usuario y
  **no se versiona** en Git (ver `.gitignore`). Este README sí se versiona para
  documentar la estructura.
- El backend crea las carpetas automáticamente la primera vez que se usa un
  perfil (`CLI/ely_cli/storage.py`).
- Los identificadores de perfil se sanean antes de usarse como nombre de
  carpeta (sin barras ni `..`), evitando escrituras fuera de `Local Storage/`.
