# files-changed

[English](README.md)

Un mod de Claude Code que añade a cada respuesta una tarjeta con los archivos que Claude cambió en ella y las líneas agregadas y eliminadas de cada uno. Al pulsar un archivo se ve su diff.

```
4 archivos cambiados  +61 −73
▸ Hero.tsx  +38 −64  features/landing/components
▸ PhoneIcon.tsx  +14 −0  nuevo  components/ui
▸ old-logo.svg  +0 −1  eliminado  public
Fuera del proyecto (1)
▸ MEMORY.md  +9 −8  ~/.claude/memory
```

Cada respuesta conserva su propia tarjeta, así que puedes volver atrás y ver qué cambió cada una.

## Instalación

En una sesión de Claude Code en la terminal, escribe:

```
/plugin install files-changed --marketplace arguerrdelgado/files-changed
```

Responde `y` para agregar el marketplace y luego elige el alcance.

Desde una terminal:

```
claude plugin install files-changed --marketplace arguerrdelgado/files-changed
```

En la app de escritorio, donde `/plugin` no funciona: pulsa **+** junto al cuadro de texto, luego **Plugins**, **Add marketplace** con `arguerrdelgado/files-changed` y después **Add plugin**.

## Idioma

La tarjeta está en inglés por defecto y también viene en español. Para cambiarla, abre `/config` en Claude Code y en files-changed pon **Card language** en `es` (o `en` para inglés). Se guarda en tu configuración como `pluginConfigs["files-changed"].options.language`.

## Qué cuenta

- **Edit y Write**: cada archivo que Claude edita o crea, con el parche exacto que aplicó la herramienta. Varias ediciones al mismo archivo en una respuesta se suman en una sola fila.
- **Bash, dentro de un repositorio git**: antes y después de cada comando, el mod registra el árbol de trabajo con `git stash create`, que deja como estaban tus archivos, ramas, el contenido del índice y la lista de stash. Comparar los dos muestra exactamente lo que cambió ese comando, no los cambios que ya estaban sin confirmar. También cuenta los archivos nuevos sin seguimiento (respetando `.gitignore`). [ARCHITECTURE.md](ARCHITECTURE.md#what-the-mod-runs-on-your-machine) lista cada comando de git que ejecuta el mod.
- **Subagentes**: lo que cambian cuenta en la respuesta que los lanzó. Aunque varios corran a la vez, cada cambio se cuenta una sola vez.
- **Archivos fuera del proyecto**: también aparecen, en su propio grupo y con `~` para tu carpeta personal, así ves cada vez que Claude escribe fuera de la carpeta en la que trabajas.
- Cada archivo se marca como **nuevo**, **eliminado** o **binario** cuando corresponde. Un archivo binario aparece sin conteo de líneas ni diff.

## Limitaciones

- Los cambios hechos con Bash solo se cuentan dentro de un repositorio git con al menos un commit.
- Los comandos que corren en segundo plano no se vigilan.
- Un archivo sin seguimiento que ya existía y un comando modifica no se cuenta.
- Si un comando crea más de 50 archivos sin seguimiento, se listan los primeros 50 y el resto se cuenta en una línea "y N archivos más".
- Un archivo renombrado aparece como dos filas: el nombre viejo eliminado y el nuevo como nuevo.
- Si un Edit o Write de un subagente y un comando de Bash de otro cambian el mismo archivo al mismo tiempo, la parte del comando de Bash en ese archivo no se cuenta.
- La API de plugins no marca qué bloque de texto cierra una respuesta, así que la tarjeta va en el bloque cuyo texto coincide con el final de la respuesta. Una respuesta que termina en una herramienta sin texto después no lleva tarjeta.
- En la extensión de VS Code, lo que un mod dibuja en un mensaje aparece encima del texto de ese mensaje, así que la tarjeta queda justo arriba del último bloque de la respuesta.

## Desarrollo

El código está dividido en un núcleo puro, adaptadores y la tarjeta: [ARCHITECTURE.md](ARCHITECTURE.md) (en inglés) explica cómo encajan las partes y cómo extenderlas. [CHANGELOG.md](CHANGELOG.md) lista los cambios de cada versión.

```
claude plugin validate .
claude plugin test .
```

Para usarlo desde esta carpeta sin instalarlo, inicia Claude Code con `claude --plugin-dir /ruta/a/files-changed`, o agrega la carpeta a la variable de entorno `CLAUDE_CODE_PLUGIN_DIRS`. Claude Code escribe entonces los tipos de su API de plugins en `.claude-plugin/types/`, y `npx --package typescript tsc -p .` revisa los tipos del código.

La API de plugins está en acceso anticipado y puede cambiar entre versiones de Claude Code.

## Hecho con Claude Code

Este proyecto se desarrolló con [Claude Code](https://claude.com/claude-code).

## Licencia

[MIT](LICENSE)
