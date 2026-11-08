# files-changed

[English](README.md)

Un mod de Claude Code que añade a cada respuesta una tarjeta con los archivos que Claude cambió en ella y las líneas agregadas y eliminadas de cada uno. Al pulsar un archivo se ve su diff.

```
3 archivos cambiados  +61 −72
▸ Hero.tsx        +38 −64  features/landing/components
▸ PhoneIcon.tsx   nuevo  +14 −0  components/ui
▸ WhatsAppIcon.tsx  +3 −2  components/ui
```

Cada respuesta conserva su propia tarjeta, así que puedes volver atrás y ver qué cambió cada una.

## Instalación

En una sesión de Claude Code en la terminal, escribe:

```
/plugin install files-changed --marketplace OWNER/files-changed
```

Responde `y` para agregar el marketplace y luego elige el alcance.

## Qué cuenta

- **Edit y Write**: cada archivo que Claude edita o crea, con el parche exacto que aplicó la herramienta. Varias ediciones al mismo archivo en una respuesta se suman en una sola fila.
- **Bash, dentro de un repositorio git**: antes y después de cada comando, el mod registra el árbol de trabajo con `git stash create`, que escribe un objeto commit sin tocar referencias, el índice, la lista de stash ni ningún archivo. Comparar los dos muestra exactamente lo que cambió ese comando, no los cambios que ya estaban sin confirmar. También cuenta los archivos nuevos sin seguimiento (respetando `.gitignore`).

## Limitaciones

- Los cambios hechos con Bash solo se cuentan dentro de un repositorio git.
- Los comandos que corren en segundo plano no se vigilan.
- Un archivo sin seguimiento que ya existía y un comando modifica no se cuenta.
- La API de plugins no marca qué bloque de texto cierra una respuesta, así que la tarjeta va en el bloque cuyo texto coincide con el final de la respuesta. Una respuesta que termina en una herramienta sin texto después no lleva tarjeta.
- En la extensión de VS Code, lo que un mod dibuja en un mensaje aparece encima del texto de ese mensaje, así que la tarjeta queda justo arriba del último bloque de la respuesta.

## Desarrollo

```
claude plugin validate .
claude plugin test .
```

Para usarlo desde esta carpeta sin instalarlo, inicia Claude Code con `claude --plugin-dir /ruta/a/files-changed`, o agrega la carpeta a la variable de entorno `CLAUDE_CODE_PLUGIN_DIRS`.

La API de plugins está en acceso anticipado y puede cambiar entre versiones de Claude Code.

## Licencia

[MIT](LICENSE)
