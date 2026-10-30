# 🎓 Programa de Capacitación: Arquitectura Hexagonal, Clean Architecture y NestJS Avanzado (SisDoc)

Bienvenido a tu centro de entrenamiento personalizado basado 100 % en el código real de **`@backend` (`sisdoc-backend`)**.

El objetivo de esta carpeta (`capacitacion/`) es que pases de solo "escribir código que funciona en NestJS" a **pensar y diseñar como un Arquitecto de Software**, dominando la **Arquitectura Hexagonal (Puertos y Adaptadores)**, **Clean Architecture (Arquitectura Limpia)**, el patrón **Monolito Modular** y las características avanzadas de **NestJS**.

---

## 🗺️ Estructura de la Capacitación y Orden de Estudio Recomendado

Te recomiendo seguir los documentos en orden numérico. Cada módulo construye sobre el anterior:

1. **[01 - Arquitectura Limpia y Hexagonal](./01-ARQUITECTURA-LIMPIA-Y-HEXAGONAL.md)**
   - ¿Qué es Clean Architecture, Arquitectura Hexagonal y Monolito Modular?
   - ¿Para qué sirve realmente? (Desacoplamiento, pruebas ultrarrápidas, mantenibilidad).
   - Las 4 capas de SisDoc (`domain`, `application`, `infrastructure`, `presentation`).
   - La Regla de Dependencia y cómo `architecture.spec.ts` la protege automáticamente.
   - Puertos (`Symbol` + `interface`) vs. Adaptadores (`@Injectable()`) y Capa Anticorrupción.

2. **[02 - Dominando NestJS en SisDoc](./02-DOMINANDO-NESTJS-EN-SISDOC.md)**
   - Anatomía del ciclo de vida de una petición en NestJS dentro de este proyecto.
   - Inyección de Dependencias avanzada: inversión de control con `Symbol()` y `@Inject()`.
   - Seguridad profesional: Cookies `HttpOnly`/`__Host-`, CSRF Middleware, `JwtCookieGuard` + `Reflector` y `ValidationPipe`.
   - Manejo limpio de errores: de `DomainError` a HTTP mediante `DomainErrorFilter`.
   - WebSockets (`ChatGateway`) y Eventos de Dominio (`EventEmitter2`).

3. **[03 - Mapa Completo Archivo por Archivo](./03-MAPA-COMPLETO-ARCHIVO-POR-ARCHIVO.md)**
   - Radiografía detallada de **todos y cada uno de los archivos** del `backend/`.
   - Qué hace cada archivo, en qué capa está, por qué está ahí y qué trucos de seguridad o diseño implementa.

4. **[04 - Guía Paso a Paso: Cómo Construir un Módulo desde Cero](./04-GUIA-PASO-A-PASO-CONSTRUIR-MODULO.md)**
   - Receta práctica en 6 pasos para crear un módulo nuevo (ej. `notifications`) sin romper ni una sola regla hexagonal.
   - Plantillas mentales y checklist de verificación.

5. **[05 - Estrategia de Testing Profesional](./05-ESTRATEGIA-DE-TESTING.md)**
   - Cómo funcionan los 3 anillos de pruebas de SisDoc:
     1. Tests de Arquitectura (`architecture.spec.ts`)
     2. Tests Unitarios de Dominio y Casos de Uso con **Fakes en Memoria** (`fakes.ts`)
     3. Tests E2E con Supertest y PostgreSQL (`test/*.e2e-spec.ts`)

6. **[06 - Exámenes y Retos Prácticos](./06-EXAMENES-Y-RETOS-PRACTICOS.md)**
   - **Examen Nivel 1:** Fundamentos de Arquitectura Limpia y Hexagonal.
   - **Examen Nivel 2:** Dominio de NestJS e Inyección de Dependencias.
   - **Examen Nivel 3:** "Caza el Bug Arquitectónico" (detectar violaciones de capas y seguridad).
   - **Retos Prácticos de Código:** Ejercicios reales para programar sobre `backend/`.

7. **[07 - Solucionario y Explicaciones de Exámenes](./07-SOLUCIONARIO-EXAMENES.md)**
   - Respuestas detalladas con justificación arquitectónica para cada pregunta y guía de resolución de los retos prácticos. *(¡Intenta resolver el archivo 06 antes de abrir este!)*

8. **[08 - Evaluación Arquitectónica a Futuro: Escalabilidad, Resiliencia y los 4 Nuevos Módulos](./08-ARQUITECTURA-FUTURA-ESCALABILIDAD-Y-RESILIENCIA.md)**
   - Cómo integrar **Firmador de Documentos (Builder + BullMQ)**, **Correspondencia con Mapa en Vivo (estilo PedidosYa con Redis)**, **Asistencia en Recinto/Frontera Avaroa (Geocercas + Biometría WebAuthn)** y **Encuestas/Capacitaciones** sin que el sistema se ralentice ni un fallo en un módulo afecte a los demás.

9. **[09 - Cómo Dividir el Sistema en Varios Servidores](./09-COMO-DIVIDIR-EL-SISTEMA-POR-SERVIDORES.md)**
   - Ejemplo práctico paso a paso de cómo dejar **solo Mensajería (`ChatModule`) en el servidor actual** y mover el resto de módulos a otro servidor usando `SERVER_ROLE` + Nginx o cambiando 1 línea del adaptador en `chat.module.ts`.

10. **[10 - Edición en Tiempo Real de Documentos Word/Excel/PowerPoint (OnlyOffice)](./10-EDICION-EN-TIEMPO-REAL-ONLYOFFICE.md)**
    - Guía completa de la integración con **OnlyOffice Document Server** en el módulo `files`: variables `.env`, `docker-compose.yml`, flujo de seguridad con doble token JWT, protección anti-SSRF, guardado automático de versiones inmutables (`v2, v3...`) y ejemplo de uso desde el Frontend.

---

## 🛠️ Comandos Útiles mientras Estudias

Ejecuta estos comandos dentro de `c:\sistemas\sisdoc\backend` mientras lees las guías para experimentar en vivo:

```powershell
# 1. Ejecutar las pruebas unitarias y la prueba de arquitectura (no requiere BD, tarda ~2 segundos)
npm test

# 2. Ejecutar únicamente el guardián de arquitectura hexagonal
npx jest src/architecture.spec.ts

# 3. Ejecutar las pruebas de políticas de dominio o de login en memoria
npx jest src/modules/auth/domain/domain-policies.spec.ts
npx jest src/modules/auth/application/login.use-case.spec.ts

# 4. Ejecutar las pruebas End-to-End (requiere PostgreSQL de pruebas activo)
npm run test:e2e
```

