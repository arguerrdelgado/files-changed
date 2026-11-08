/** Every text the card shows. */
export type Labels = {
  filesChanged: (count: number) => string
  newFile: string
  deletedFile: string
  binaryFile: string
  outsideProject: (count: number) => string
  moreFiles: (count: number) => string
}

/** The card's languages, by the value of the `language` option. To add one, add an entry here and to `options` in plugin.json. */
const LANGUAGES = {
  en: {
    filesChanged: count => (count === 1 ? '1 file changed' : `${count} files changed`),
    newFile: 'new',
    deletedFile: 'deleted',
    binaryFile: 'binary',
    outsideProject: count => `Outside the project (${count})`,
    moreFiles: count => (count === 1 ? 'and 1 more file' : `and ${count} more files`),
  },
  es: {
    filesChanged: count => (count === 1 ? '1 archivo cambiado' : `${count} archivos cambiados`),
    newFile: 'nuevo',
    deletedFile: 'eliminado',
    binaryFile: 'binario',
    outsideProject: count => `Fuera del proyecto (${count})`,
    moreFiles: count => (count === 1 ? 'y 1 archivo más' : `y ${count} archivos más`),
  },
} satisfies Record<string, Labels>

/** The texts for a language, English when it is not one of the card's. */
export function labelsFor(language: unknown): Labels {
  return language === 'es' ? LANGUAGES.es : LANGUAGES.en
}
