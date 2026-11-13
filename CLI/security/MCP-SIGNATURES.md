# Verificación de firmas MCP

Ely puede verificar manifiestos JSON MCP con **Ed25519** antes de descubrir,
conectar o llamar sus herramientas. OpenSSL (`openssl pkeyutl`) debe estar
instalado. Sin política obligatoria, los manifiestos sin firma siguen
permitidos por compatibilidad; una firma presente que sea inválida siempre se
rechaza.

## Confiar una clave y exigir firmas

1. Obtén la clave pública de un administrador por un canal confiable y guárdala
   como `.ely/mcp-trust/<key-id>.pub.pem`. El `key-id` solo admite letras,
   números, punto, guion y guion bajo.
2. Activa el requisito local en `.ely/mcp-policy.json`:

   ```json
   { "require_signatures": true }
   ```

3. El administrador firma el JSON con una clave privada Ed25519 que debe
   permanecer fuera del repositorio y del equipo de Ely:

   ```sh
   openssl genpkey -algorithm ED25519 -out mcp-signing-key.pem
   openssl pkey -in mcp-signing-key.pem -pubout -out team.pub.pem
   # Distribuir team.pub.pem por canal confiable y dejar la clave privada offline.
   python3 CLI/tools/sign_mcp_manifest.py MCPs/mcp.json \
     --key-id team --private-key mcp-signing-key.pem
   ```

La firma cubre el documento JSON completo excepto el campo `_ely_signature`,
serializado UTF-8 con claves ordenadas y separadores compactos. El verificador
rechaza firmas malformadas, claves no confiables, manifiestos modificados y
políticas de seguridad ilegibles. La clave pública en `.ely/mcp-trust/` es la
raíz de confianza local; protege esa carpeta como configuración administrativa.

La firma valida **el manifiesto**: no demuestra por sí sola que el programa
externo invocado siga siendo idéntico al aprobado. Usa rutas y versiones de
servidor confiables, protege sus archivos de programa y fija hashes de artefactos
cuando el método de instalación los permita. Servidores YAML/TOML no son
aceptados por el verificador actual.
