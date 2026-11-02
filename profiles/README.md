# Perfiles de Ely Cowork

Cada archivo `.json` de esta carpeta describe **un proveedor real**. El servidor
los carga al arrancar; el perfil marcado como predeterminado se usa cuando la
petición no especifica otro.

```json
{
  "id": "openai",                       // identificador único (= nombre del archivo)
  "label": "OpenAI",                    // nombre visible en el IDE
  "provider": "openai",                 // "openai" (Chat Completions) | "anthropic"
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini",
  "key_var": "OPENAI_API_KEY",          // variable que contiene la clave
  "color": "#10a37f",
  "max_tokens": 1024,
  "temperature": 0.6,
  "timeout": 60,
  "headers": {},                        // cabeceras extra opcionales
  "rates": { "input_per_mtok": 0.15, "output_per_mtok": 0.60 }   // opcional, para /api/costs
}
```

Notas:

- `base_url` puede ser la raíz del API (`https://api.openai.com/v1`) o la URL
  completa (`.../chat/completions`). Si termina en `/chat/completions`,
  `/messages` o `/responses` se usa tal cual.
- Los valores con `{VARIABLE}` se sustituyen desde el entorno/archivos de clave
  al cargar el perfil (útil para `local`).
- `provider: "anthropic"` cambia el formato: cabecera `x-api-key`, `system`
  separado y ruta `/messages`.
- La clave **nunca** se guarda aquí. Se busca en `OPENAI_API_KEY`, etc., con esta
  prioridad: variables de entorno → `.ely/keys.env` → `profiles/test-keys.env`.

## Claves de prueba

`test-keys.env` contiene `APikeyexample-1` … `APikeyexample-11` (una por perfil).
No autentican en ningún proveedor: existen para comprobar que Ely construye bien
la URL y la cabecera `Authorization`. Para conexiones reales, usa `.ely/keys.env`.
