# Assets de iconos del IDE

Pack de iconos que usa el Explorador, las pestañas, el selector de modo de
lenguaje y la vista previa de archivos. Se sirve tal cual desde el servidor del
IDE (`GET /icons/<nombre>.svg`) y se consume desde `js/icons.js`.

| | |
|---|---|
| SVG | **345** |
| Lenguajes con icono propio | **261** (todos menos *Plain Text*, que usa `document.svg`) |
| Extensiones mapeadas | 65 |
| Nombres de archivo especiales | 118 (`Dockerfile`, `package.json`, `LICENSE`, `.env`…) |
| Nombres de carpeta | 157 (`src`, `tests`, `docs`, `assets`, `node_modules`…) |
| Peso total | ~1,4 MB |

Galería navegable: **`/icons.html`** (buscar, filtrar por lenguajes/archivos/carpetas,
ES · EN).

## Origen y licencia

* La mayoría son de **[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)**,
  MIT © 2025 Material Extensions. Texto completo en
  [`LICENSE-material-icon-theme.txt`](LICENSE-material-icon-theme.txt).
* Los que empiezan por **`ely-`** son propios de Ely: SVG planos de 24×24 con las
  iniciales del lenguaje y un color fijo, para los 18 lenguajes que el pack no
  incluye (Smalltalk, QML, Wren, TLA+, Toit, WebIDL, Pony, Ring, Eiffel, GAMS,
  Harbour, Io, Modelica, Motoko, OpenEdge, PowerBuilder, PureBasic, Squirrel).

Cuando Material no tiene un icono exacto se usa el más cercano semánticamente
(`gdscript → godot`, `coffeescript → coffee`, `csv → table`, `ipynb → jupyter`,
`wasm → webassembly`, `yara → lock`, `rebol → red`, `srt/vtt → video`…).

## Cómo se resuelve un icono

`js/icons.js` aplica este orden, igual que VS Code:

1. **Nombre de archivo exacto** (`BY_NAME`): `Dockerfile`, `.gitignore`, `LICENSE`…
2. **Extensión** (`BY_EXT`): `py`, `tsx`, `jpg`, `woff2`, `pem`…
3. **Lenguaje del catálogo** (`Languages.forPath()` → `BY_LANG`).
4. **Documento genérico** (`document.svg`).

Las carpetas usan `FOLDERS` por nombre (`src → folder-src`); si no hay
coincidencia, `folder.svg` / `folder-open.svg` según estén plegadas o abiertas.

```js
Icons.file("src/main.py", 16);        // <img> listo para el DOM
Icons.folder(true, 16, "tests");      // carpeta abierta con icono de tests
Icons.language("rust", 15);           // icono de un modo de lenguaje
Icons.fileUrl("foto.jpg");            // "icons/image.svg"
Icons.forLanguage("gdscript");        // "godot"
Icons.catalog;                        // mapas completos (galería y tests)
```

Todos los `<img>` salen con `alt=""`, `aria-hidden="true"`, `loading="lazy"` y un
*fallback* a `document.svg` si el asset no cargara, de modo que un icono ausente
nunca rompe la interfaz ni ensucia el árbol para lectores de pantalla.

## Añadir o actualizar iconos

1. Deja el SVG (24×24, con `viewBox`) en esta carpeta.
2. Añade la entrada en el mapa correspondiente de `js/icons.js`.
3. Comprueba que no queda ningún asset huérfano ni ninguna referencia rota:

```bash
python3 -m unittest CLI.tests.test_languages_icons
```

Ese test verifica que todo icono referenciado existe, que ningún SVG sobra, que
todos son XML válido con `viewBox`, y que cada lenguaje del catálogo tiene icono.
