/**
 * ÚNICO punto de contacto del módulo `files` con el resto del sistema.
 * Otros módulos (chat, posts...) importan SOLO este archivo, nunca el interior de files/.
 */
export * from './files.contract';
export { FilesModule } from './files.module';
