# INVENTARIO.md — Todo lo que una persona puede llegar a ver

Se genera de las escenas de `web/e2e-diseno/escenas-*.ts` con `npm run diseno:inventario -- --escribir`. No se edita a mano. `npm run diseno:inventario` lo coteja contra las rutas de `app.tsx`,
contra cada uso de diálogo, aviso y barra de guardado, y contra las clases de `base.css`. Las capturas están en `docs/diseno/capturas/antes/` y `docs/diseno/capturas/despues/`
(`<id>-escritorio.jpg`, 1366 px, y `<id>-celular.jpg`, 390 px). ✔ = existe la captura; · = no aplica a esa vista; ✘ = falta.

Filas: **1014**.

## Acceso y cuenta (47)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `acceso-inicio-de-sesion` | anonimo | pantalla | Inicio de sesión | `/` | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-con-datos` | anonimo | estado | Inicio de sesión con el correo y la contraseña escritos (el botón «Entrar» habilitado) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-entrando` | anonimo | estado | Inicio de sesión con el botón «Entrar» ocupado (esperando al servidor) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-error-401` | anonimo | estado | Inicio de sesión con error 401: «Correo o contraseña incorrectos.» |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-error-429-minutos` | anonimo | estado | Inicio de sesión bloqueado por demasiados intentos (429): «Espera 10 minutos» |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-error-429-segundos` | anonimo | estado | Inicio de sesión bloqueado por demasiados intentos (429): «Espera 45 segundos» |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-error-servidor` | anonimo | estado | Inicio de sesión con error del servidor (500) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-error-de-red` | anonimo | estado | Inicio de sesión sin conexión con el servidor («No hay conexión…») |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-sesion-expirada` | asesor | estado | Inicio de sesión con el aviso «Tu sesión terminó» (la sesión venció con la pantalla abierta) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-inicio-de-sesion-cerro-sesion` | asesor | estado | Inicio de sesión con el aviso «Cerraste tu sesión.» (después de pulsar «Salir») |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-abriendo-la-aplicacion` | anonimo | estado | Pantalla inicial «Abriendo la aplicación…» (la sesión todavía se está comprobando) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-sin-acceso-maestro` | maestro | estado | «Sin acceso» del maestro (ejemplo: /embudo; igual en las demás rutas que no son suyas) | `/embudo /tareas /leads/:id /leads/:id/convertir /pagos /cuenta /cuenta/:tutorId /uniformes /ventas /corte /familias /familias/un-solo-hijo /familias/:tutorId /tableros /admin /admin/verticales /admin/sucursales /admin/programas /admin/grupos /admin/instructores /admin/precios /admin/promociones /admin/canales /admin/campanas /admin/configuracion /admin/plantillas /admin/automatizaciones /admin/usuarios /admin/modulos /admin/textos /admin/etapas /admin/catalogo /admin/motivos /admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `acceso-sin-acceso-asesor` | asesor | estado | «Sin acceso» del asesor (ejemplo: /pagos; igual en /pase /uniformes /ventas /corte /alumnos/:id/salud y la administración) | `/pase /pagos /uniformes /ventas /corte /alumnos/:id/salud /admin /admin/verticales /admin/sucursales /admin/programas /admin/grupos /admin/instructores /admin/precios /admin/promociones /admin/canales /admin/campanas /admin/configuracion /admin/plantillas /admin/automatizaciones /admin/usuarios /admin/modulos /admin/textos /admin/etapas /admin/catalogo /admin/motivos /admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `acceso-sin-acceso-recepcion` | recepcion | estado | «Sin acceso» de recepción (ejemplo: /embudo; igual en /hoy /clases/:id/registro /tareas /leads/:id /tableros /alumnos/:id/salud y la administración) | `/hoy /clases/:id/registro /embudo /tareas /leads/:id /leads/:id/convertir /alumnos/:id/salud /tableros /admin /admin/verticales /admin/sucursales /admin/programas /admin/grupos /admin/instructores /admin/precios /admin/promociones /admin/canales /admin/campanas /admin/configuracion /admin/plantillas /admin/automatizaciones /admin/usuarios /admin/modulos /admin/textos /admin/etapas /admin/catalogo /admin/motivos /admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-captacion` | administrador | estado | «No disponible» con el módulo de captación apagado (administrador: dice dónde activarlo) | `/embudo /tareas /leads/:id /admin /admin/verticales /admin/sucursales /admin/programas /admin/grupos /admin/instructores /admin/precios /admin/promociones /admin/canales /admin/campanas /admin/configuracion /admin/plantillas /admin/automatizaciones /admin/usuarios /admin/modulos /admin/textos /admin/etapas /admin/catalogo /admin/motivos /admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-clase-muestra` | administrador | estado | «No disponible» con el módulo de clase muestra apagado | `/hoy /clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-operacion` | administrador | estado | «No disponible» con el módulo de operación apagado (pase de lista) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-inscripcion` | administrador | estado | «No disponible» con el módulo de inscripción apagado (alumnos, familias, conversión) | `/leads/:id/convertir /alumnos /alumnos/:id /alumnos/:id/salud /familias /familias/un-solo-hijo /familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-finanzas` | administrador | estado | «No disponible» con el módulo de finanzas apagado (pagos, estado de cuenta, uniformes, ventas, cierre) | `/pagos /cuenta /cuenta/:tutorId /uniformes /ventas /corte` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-tableros` | administrador | estado | «No disponible» con el módulo de tableros apagado | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `acceso-modulo-apagado-no-administrador` | maestro | estado | «No disponible» para quien no administra (maestro, pase de lista): pide que se lo active la persona que administra | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `acceso-no-encontrada-administrador` | administrador | estado | «Página no encontrada» (dirección que no existe) del administrador | `*` | ✔ · ✔ | ✔ · ✔ |
| `acceso-no-encontrada-asesor` | asesor | estado | «Página no encontrada» (dirección que no existe) del asesor | `*` | ✔ · ✔ | ✔ · ✔ |
| `acceso-no-encontrada-maestro` | maestro | estado | «Página no encontrada» (dirección que no existe) del maestro | `*` | ✔ · ✔ | ✔ · ✔ |
| `acceso-no-encontrada-recepcion` | recepcion | estado | «Página no encontrada» (dirección que no existe) del recepción | `*` | ✔ · ✔ | ✔ · ✔ |
| `acceso-error-de-carga-500` | asesor | estado | Error de carga genérico (500) con el botón «Reintentar» (ejemplo: Tareas) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-error-de-carga-404` | asesor | estado | Error de carga «No se encontró lo que buscas» (404) con el botón «Ir a mi inicio» (ejemplo: Tareas) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-mas-administrador` | administrador | pantalla | «Más» / mi cuenta del administrador: sus secciones y su sesión | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-mas-asesor` | asesor | pantalla | «Más» / mi cuenta del asesor: sus secciones y su sesión | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-mas-maestro` | maestro | pantalla | «Más» / mi cuenta del maestro: sus secciones y su sesión | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-mas-recepcion` | recepcion | pantalla | «Más» / mi cuenta del recepción: sus secciones y su sesión | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-mas-sin-secciones` | recepcion | estado | «Más» sin ninguna sección activa (la escuela apagó todo): «Todavía no tienes secciones activas» | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-vacio` | asesor | flotante | Diálogo «Cambiar mi contraseña» vacío | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-validacion` | asesor | flotante | Diálogo «Cambiar mi contraseña» con errores de validación (nueva corta, repetición distinta) | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-vacia-enviada` | asesor | flotante | Diálogo «Cambiar mi contraseña» enviado vacío («Escribe tu contraseña actual») | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-error-servidor` | asesor | flotante | Diálogo «Cambiar mi contraseña» con el error del servidor («La contraseña actual no es correcta») | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-demasiados-intentos` | asesor | flotante | Diálogo «Cambiar mi contraseña» bloqueado por demasiados intentos (429, «Intenta de nuevo en 600 s») | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-cambiar-contrasena-sin-conexion` | asesor | flotante | Diálogo «Cambiar mi contraseña» sin conexión («No hay conexión con el servidor…») | `/mas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-administrador` | administrador | global | Marco del administrador: muchas secciones (barra lateral larga; en celular, barra inferior de cuatro secciones y «Más»), contenido corto | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-asesor` | asesor | global | Marco del asesor: una sola sucursal (su nombre en la cabecera, sin selector), contenido corto |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-maestro` | maestro | global | Marco del maestro: pocas secciones, contenido corto |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-recepcion` | recepcion | global | Marco de recepción: varias sucursales (selector «Todas mis sucursales» en la cabecera) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-sucursal-elegida` | recepcion | global | Marco de recepción con una sucursal elegida en el selector de la cabecera |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-saltar-al-contenido` | asesor | global | Marco con el enlace «Saltar al contenido» enfocado (primer Tab) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-marco-con-teclado` | recepcion | global | Marco en celular con el teclado abierto (clase `con-teclado`: la barra inferior se esconde; el achicamiento del teclado se simula en `visualViewport`) |  | · · ✔ | · · ✔ |
| `acceso-marco-impresion` | administrador | impresion | Marco al imprimir: solo el contenido y el marcador «escuela · impreso el … por …» (sin barras ni cabecera) |  | ✔ · ✔ | ✔ · ✔ |
| `acceso-aviso-ya-quedo` | asesor | flotante | Aviso global «ya quedó» sobre la pantalla (al cambiar la contraseña; la API se simula, la contraseña no cambia) | `/mas` | ✔ · ✔ | ✔ · ✔ |

## Administración, catálogo (185)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `adminc-inicio-con-datos` | administrador | pantalla | Inicio de Administración con «Para empezar» (3 de 8 pasos hechos, «Lo que sigue», lista de pasos abierta) y el menú de cada área | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-escuela-lista` | administrador | estado | Inicio de Administración con la escuela lista: «Para empezar» plegado a una línea («Ver los pasos») | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-pasos-abiertos-lista` | administrador | estado | Inicio de Administración con la escuela lista y «Ver los pasos» abierto (todos con «Listo») | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-sin-hechos` | administrador | estado | Inicio de Administración de una escuela nueva: «0 de 8 pasos hechos» | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-busqueda` | administrador | estado | Inicio de Administración con el buscador usado («precio»): solo lo que coincide y el aviso «Mostrando solo lo que coincide» | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-busqueda-sin-resultados` | administrador | estado | Inicio de Administración con una búsqueda sin resultados: «No hay ninguna pantalla con…» | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-muchos` | administrador | estado | Inicio de Administración con muchos datos (la lista de pasos repetida) | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-vacio` | administrador | estado | Inicio de Administración con la respuesta de los primeros pasos vacía | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-cargando` | administrador | estado | Inicio de Administración mientras llegan los primeros pasos (el menú ya se ve y «Para empezar» todavía no aparece: la pantalla no pinta «Cargando…» ahí) | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-inicio-error` | administrador | estado | Inicio de Administración con error al cargar los primeros pasos (500): el menú sigue funcionando y no sale «Para empezar» | `/admin` | ✔ · ✔ | ✔ · ✔ |
| `adminc-aviso-primeros-pasos-embudo` | administrador | estado | Aviso «Para empezar» arriba del embudo del administrador (van 3 de 8 pasos; botón «Ver los pasos») |  | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-con-datos` | administrador | pantalla | Disciplinas, con datos | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-muchos` | administrador | estado | Disciplinas, con muchos datos | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-vacio` | administrador | estado | Disciplinas, lista vacía | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-cargando` | administrador | estado | Disciplinas, cargando | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-error` | administrador | estado | Disciplinas, con error de carga (500) y «Reintentar» | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-nueva-vacio` | administrador | flotante | Diálogo «Nueva disciplina» vacío | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-nueva-validacion` | administrador | flotante | Diálogo «Nueva disciplina» con errores de validación (sin nombre, color mal escrito, progresión sin nombre del avance, clase muestra sin cotizador) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-nueva-error-servidor` | administrador | flotante | Diálogo «Nueva disciplina» con el error del servidor en el campo («Ya existe una disciplina con ese nombre») | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-nueva-sin-conexion` | administrador | flotante | Diálogo «Nueva disciplina» sin conexión («No hay conexión con el servidor…») | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-editar` | administrador | flotante | Diálogo «Editar disciplina» con los datos de una disciplina (su dirección de página fija) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-editar-error-servidor` | administrador | flotante | Diálogo «Editar disciplina» con un error general del servidor (500) sobre los botones | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-desactivar-error-servidor` | administrador | estado | Disciplinas con el error de «Desactivar» (el servidor lo rechaza) sobre la lista | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-desactivar-sin-conexion` | administrador | estado | Disciplinas sin conexión: «Desactivar» muestra «No hay conexión con el servidor…» sobre la lista | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja la disciplina» (qué pasa, que no hay botón para recuperarla y que mejor se desactive) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja la disciplina» con el error del servidor dentro («tiene programas») | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-con-datos` | administrador | pantalla | Sucursales, con datos | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-muchos` | administrador | estado | Sucursales, con muchos datos | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-vacio` | administrador | estado | Sucursales, lista vacía | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-cargando` | administrador | estado | Sucursales, cargando | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-error` | administrador | estado | Sucursales, con error de carga (500) y «Reintentar» | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-nueva-vacio` | administrador | flotante | Diálogo «Nueva sucursal» vacío | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-nueva-validacion` | administrador | flotante | Diálogo «Nueva sucursal» enviado vacío («Escribe el nombre») | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-nueva-error-servidor` | administrador | flotante | Diálogo «Nueva sucursal» con el error del servidor en el campo («Ya existe una sucursal con ese nombre») | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-nueva-sin-conexion` | administrador | flotante | Diálogo «Nueva sucursal» sin conexión | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-editar` | administrador | flotante | Diálogo «Editar sucursal» con los datos de una sucursal | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-editar-cambia-zona` | administrador | flotante | Diálogo «Editar sucursal» con otra zona horaria elegida (sale la advertencia «Ojo: lo que ya está programado conserva la hora…») | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-editar-error-servidor` | administrador | flotante | Diálogo «Editar sucursal» con un error general del servidor (500) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-ofrece-error-servidor` | administrador | estado | Sucursales con el error al marcar o desmarcar una disciplina que se imparte ahí (el servidor lo rechaza) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja la sucursal» | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja la sucursal» con el error del servidor dentro («tiene programas, usuarios, leads o alumnos») | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-con-datos` | administrador | pantalla | Programas, con datos | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-muchos` | administrador | estado | Programas, con muchos datos | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-vacio` | administrador | estado | Programas, sin programas con el filtro («No hay programas con ese filtro») | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-cargando` | administrador | estado | Programas, cargando | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-error` | administrador | estado | Programas, con error de carga (500) y «Reintentar» | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-filtro-sucursal` | administrador | estado | Programas filtrados por una sucursal | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-paginado` | administrador | estado | Programas con paginador («Página 1 de 3 · 60 en total», Anterior deshabilitado) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo programa» vacío | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo programa» enviado vacío (elige la disciplina, la sucursal, escribe el nombre y las edades) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-nuevo-edades-invertidas` | administrador | flotante | Diálogo «Nuevo programa» con la edad máxima menor que la mínima («La edad máxima no puede ser menor que la mínima») al final del formulario | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo programa» con el error del servidor (edades que se traslapan con otro programa) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-nuevo-sin-conexion` | administrador | flotante | Diálogo «Nuevo programa» sin conexión | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-editar` | administrador | flotante | Diálogo «Editar programa» con los datos de un programa (disciplina y sucursal fijas) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja el programa» | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja el programa» con el error del servidor dentro («tiene grupos o inscripciones») | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-con-datos` | administrador | pantalla | Grupos y horarios, con datos | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-muchos` | administrador | estado | Grupos y horarios, con muchos datos | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-vacio` | administrador | estado | Grupos y horarios, sin grupos («No hay grupos con ese filtro») | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-cargando` | administrador | estado | Grupos y horarios, cargando | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-error` | administrador | estado | Grupos y horarios, con error de carga (500) y «Reintentar» | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-filtro-programa` | administrador | estado | Grupos filtrados por programa | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-busqueda` | administrador | estado | Grupos con el buscador usado (el nombre de un grupo) | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-busqueda-sin-resultados` | administrador | estado | Grupos con una búsqueda sin coincidencias («Ningún grupo coincide con…») | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-paginado` | administrador | estado | Grupos con paginador («Página 1 de 3 · 250 en total») | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo grupo» vacío (sin horarios: «el grupo no aparecerá en el cotizador») | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-con-horarios` | administrador | flotante | Diálogo «Nuevo grupo» con programa, salón, instructor y dos horarios agregados | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo grupo» con errores de validación (elige el programa, nombre, cupo y un horario sin día) | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-validacion-horario` | administrador | flotante | Diálogo «Nuevo grupo» con el error del horario sin día, visto en la parte de los horarios | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo grupo» con el choque de salón o de instructor que detecta el servidor (qué se pisa con qué), junto a los botones | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-nuevo-sin-conexion` | administrador | flotante | Diálogo «Nuevo grupo» sin conexión | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-editar` | administrador | flotante | Diálogo «Editar grupo» con los datos de un grupo (programa fijo, salón, instructor y horarios) | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja el grupo» | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja el grupo» con el error del servidor dentro («tiene alumnos inscritos») | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-con-datos` | administrador | pantalla | Instructores y salones, con datos | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-muchos` | administrador | estado | Instructores y salones, con muchos datos | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-vacio` | administrador | estado | Instructores y salones, lista vacía | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-cargando` | administrador | estado | Instructores y salones, cargando | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-error` | administrador | estado | Instructores y salones, con error de carga (500) y «Reintentar» | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo instructor» vacío | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo instructor» enviado vacío («Escribe el nombre») | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo instructor» con el error del servidor en un campo (correo mal escrito) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-nuevo-sin-conexion` | administrador | flotante | Diálogo «Nuevo instructor» sin conexión | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-editar` | administrador | flotante | Diálogo «Editar instructor» con los datos de un instructor (su usuario y sus sucursales) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja al instructor» | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja al instructor» con el error del servidor dentro («todavía imparte grupos») | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo salón» vacío | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo salón» con errores de validación (sin sucursal, sin nombre, capacidad con letras) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo salón» con el error del servidor en el campo («Ya hay un salón con ese nombre en la sucursal») | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-nuevo-sin-conexion` | administrador | flotante | Diálogo «Nuevo salón» sin conexión | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-editar` | administrador | flotante | Diálogo «Editar salón» con los datos de un salón (sin selector de sucursal) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja el salón» | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja el salón» con el error del servidor dentro («algún grupo lo usa») | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-sin-programa` | administrador | pantalla | Precios sin programa elegido (solo el selector «Elige un programa») | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-con-datos` | administrador | estado | Precios de un programa: historial con un precio vigente y el botón «Nueva vigencia» | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-historial-completo` | administrador | estado | Historial de precios con una vigencia pasada, una vigente y una futura (insignias «Pasada», «Vigente» y «Futura»; «Abierta» y fechas de cierre) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-muchos` | administrador | estado | Precios con muchos datos (historial largo) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-programa-sin-precio` | administrador | estado | Precios de un programa sin ningún precio («Este programa todavía no tiene precio») | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-cargando-programas` | administrador | estado | Precios mientras cargan los programas | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-cargando-historial` | administrador | estado | Precios con un programa elegido mientras carga su historial | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-error-programas` | administrador | estado | Precios con error al cargar los programas (500) y «Reintentar» | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-error-historial` | administrador | estado | Precios con error al cargar el historial de un programa (500) y «Reintentar» | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-nueva-vigencia-vacio` | administrador | flotante | Diálogo «Nueva vigencia de precio» vacío (la fecha de hoy ya puesta) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-nueva-vigencia-validacion` | administrador | flotante | Diálogo «Nueva vigencia de precio» con errores de validación (importes inválidos y fecha vacía) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-nueva-vigencia-error-servidor` | administrador | flotante | Diálogo «Nueva vigencia de precio» con el error del servidor (la fecha no puede ser anterior a la vigencia actual) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-nueva-vigencia-sin-conexion` | administrador | flotante | Diálogo «Nueva vigencia de precio» sin conexión | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-con-datos` | administrador | pantalla | Promociones, con datos | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-muchos` | administrador | estado | Promociones, con muchos datos | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-vacio` | administrador | estado | Promociones, lista vacía | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-cargando` | administrador | estado | Promociones, cargando | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-error` | administrador | estado | Promociones, con error de carga (500) y «Reintentar» | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-paginado` | administrador | estado | Promociones con paginador («Página 1 de 3 · 60 en total») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-vacio` | administrador | flotante | Diálogo «Nueva promoción» vacío (arriba del formulario) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-alcance-y-beneficios` | administrador | flotante | Diálogo «Nueva promoción» visto abajo: «Dónde vale» (disciplinas, sucursales, programas), «Beneficios» y los botones | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-validacion` | administrador | flotante | Diálogo «Nueva promoción» enviado vacío (nombre, código, fecha de inicio; arriba del formulario) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-validacion-beneficios` | administrador | flotante | Diálogo «Nueva promoción» enviado vacío, visto abajo («Agrega al menos un beneficio») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-validacion-fechas-y-cupo` | administrador | flotante | Diálogo «Nueva promoción» con código inválido, fecha final antes del inicio, cupo y prioridad fuera de rango | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-condicion-hermanos` | administrador | flotante | Diálogo «Nueva promoción» con la condición «hermanos inscritos» (aparece «Hermanos inscritos mínimos») y su error («2 a 20») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-condicion-pago-anticipado` | administrador | flotante | Diálogo «Nueva promoción» con la condición «pago anticipado» (aparece «Meses pagados por adelantado») y su error («1 a 24») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-beneficio-validacion` | administrador | flotante | Captura de un beneficio sin valor («Agregar este beneficio» con el porcentaje vacío: error en el campo) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-beneficio-tipos` | administrador | flotante | Captura de un beneficio de producto gratis (cambian los campos: descripción con su ayuda «Qué producto se entrega») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-con-beneficios-listos` | administrador | flotante | Diálogo «Nueva promoción» con dos beneficios ya agregados a la lista (cada uno con «Quitar») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-error-servidor` | administrador | flotante | Diálogo «Nueva promoción» con el error del servidor en el campo («Ya existe una promoción con ese código») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-nueva-sin-conexion` | administrador | flotante | Diálogo «Nueva promoción» sin conexión | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-editar` | administrador | flotante | Diálogo «Editar promoción» con los datos de una promoción (cupo usado, dónde vale y sus beneficios con «Quitar»; botón «Cerrar») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-editar-beneficios` | administrador | flotante | Diálogo «Editar promoción» visto abajo: sus beneficios ya guardados, con «Quitar», y la captura de un beneficio nuevo | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-editar-quitar-error-servidor` | administrador | flotante | Diálogo «Editar promoción» con el error al quitar un beneficio (el servidor lo rechaza) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja la promoción» | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja la promoción» con el error del servidor dentro («tiene beneficios por entregar») | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-con-datos` | administrador | pantalla | Cargar catálogo al abrir: paso 1 con «Descargar todas las plantillas», paso 2 sin archivos («Todavía no elegiste archivos») y «Revisar» deshabilitado | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-plantillas-una-por-una` | administrador | estado | Cargar catálogo con «Descargar una por una» abierto (la lista de plantillas con su descripción) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-muchos` | administrador | estado | Cargar catálogo con muchos datos (la lista de plantillas repetida, abierta) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-vacio` | administrador | estado | Cargar catálogo con la lista de plantillas vacía (abierto «Descargar una por una»: sin ninguna) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-cargando` | administrador | estado | Cargar catálogo mientras cargan las plantillas | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-error` | administrador | estado | Cargar catálogo con error al cargar las plantillas (500) y «Reintentar» | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-archivos-elegidos` | administrador | estado | Cargar catálogo con los ocho archivos CSV elegidos (nombre y tamaño de cada uno, «Quitar», «Revisar» habilitado) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-archivo-de-excel` | administrador | estado | Cargar catálogo con un archivo de Excel (.xlsx) elegido: el aviso de que se leen CSV y cómo guardarlo; «Revisar» deshabilitado | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-demasiados-archivos` | administrador | estado | Cargar catálogo con 13 archivos elegidos (el aviso «se aceptan hasta 12»; «Revisar» deshabilitado) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-archivo-pesado` | administrador | estado | Cargar catálogo con un archivo de más de 5 MB (el aviso «pesan demasiado»; el tamaño en MB) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revisando` | administrador | estado | Cargar catálogo con el botón «Revisar» ocupado (esperando al servidor) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-errores-por-fila` | administrador | estado | Cargar catálogo: resultado de la revisión con cinco errores, por archivo, fila y columna («No se guardó nada»; sin botón «Aplicar») | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-errores-archivo-desconocido` | administrador | estado | Cargar catálogo: errores de un archivo que no es plantilla («no se parece a ninguna») y de otro al que le falta una columna | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-errores-muchos` | administrador | estado | Cargar catálogo: resultado con muchos errores y «… y 40 más. Corrige estas primero.» | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revision-limpia` | administrador | estado | Cargar catálogo: revisión limpia («Todo está en orden»), la frase, la tabla de resumen y el botón «Aplicar» (nada se guardó) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revision-detalle-y-avisos` | administrador | estado | Cargar catálogo: revisión limpia con «Ver cada cambio» y «Para tomar en cuenta» abiertos (instructor sin teléfono) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revision-con-omitidos` | administrador | estado | Cargar catálogo: revisión limpia con muchos cambios («Ver cada cambio» abierto, «… y 120 más.») | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-sin-cambios` | administrador | estado | Cargar catálogo: «Sin cambios» (todo lo subido ya está en el sistema; sin botón «Aplicar») | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revisar-error-servidor` | administrador | estado | Cargar catálogo con error del servidor al revisar (500) debajo del botón «Revisar» | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-revisar-sin-conexion` | administrador | estado | Cargar catálogo sin conexión al revisar («No hay conexión con el servidor…») | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-confirmar` | administrador | flotante | Diálogo «¿Cargar estos cambios?» (la frase de lo que se crea, la nota de precios e inscripciones; «Sí, aplicar» no peligroso y «Cancelar») | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-confirmar-error-servidor` | administrador | flotante | Diálogo «¿Cargar estos cambios?» con el error del servidor dentro (no se cargó nada) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-confirmar-sin-conexion` | administrador | flotante | Diálogo «¿Cargar estos cambios?» sin conexión | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-variedad` | administrador | estado | Disciplinas variadas: completa (con color, avance, evento y «Cotiza por WhatsApp»), inactiva (botón «Activar») y con avance sin cotizador | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-editar-completa` | administrador | flotante | Diálogo «Editar disciplina» con todos los campos llenos (progresión, avance, evento, color, logotipo, cotizador y clase muestra marcados) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-variedad` | administrador | estado | Sucursales variadas: con dirección y disciplina, inactiva sin disciplinas, y con una zona horaria que no está en la lista («Otra zona horaria») | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-editar-otra-zona` | administrador | flotante | Diálogo «Editar sucursal» con una zona horaria que no está en la lista (se agrega como «Otra zona horaria (…)» para no perderla) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-variedad` | administrador | estado | Programas variados: con fecha de corte, «Alternativa» (traslape) e inactivo | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-editar-completo` | administrador | flotante | Diálogo «Editar programa» con fecha de corte, nivel, descripción y traslape marcados, visto abajo | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-variedad` | administrador | estado | Grupos variados: completo (salón, instructor, lista de espera, dos horarios), inactivo y sin horario ni salón | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-editar-completo` | administrador | flotante | Diálogo «Editar grupo» con salón, instructor, lista de espera y dos horarios (cada uno con «Quitar este horario»), visto abajo | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-con-salones` | administrador | estado | Instructores y salones con salones (uno activo con capacidad y otro inactivo sin capacidad registrada) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-variedad` | administrador | estado | Promociones variadas: activas, con prioridad, acumulable, cupo usado, vigencia con y sin fin y varios beneficios | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-editar-completa` | administrador | flotante | Diálogo «Editar promoción» con condición de hermanos, cupo usado, fecha de fin y prioridad (arriba del formulario) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-editar-completa-alcance` | administrador | flotante | Diálogo «Editar promoción» visto abajo: «Dónde vale» con disciplina, sucursal y programa marcados, y dos beneficios con «Quitar» | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-nueva-validacion-abajo` | administrador | flotante | Diálogo «Nueva disciplina» con errores de validación, visto abajo (color mal escrito y clase muestra sin cotizador) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-aviso-guardada` | administrador | flotante | Aviso «ya quedó» sobre Disciplinas: «La disciplina … se guardó.» (guardando sin cambios; la escritura se simula) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-aviso-desactivada` | administrador | flotante | Aviso «ya quedó» sobre Disciplinas: «… quedó desactivada: deja de recibir captación nueva…» (la escritura se simula) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-aviso-activada` | administrador | flotante | Aviso «ya quedó» sobre Disciplinas: «… quedó activa otra vez.» (una disciplina inactiva con el botón «Activar»; la escritura se simula) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-verticales-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Disciplinas: «La disciplina … se dio de baja.» (la escritura se simula) | `/admin/verticales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-aviso-guardada` | administrador | flotante | Aviso «ya quedó» sobre Sucursales: «La sucursal … se guardó.» (la escritura se simula) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-aviso-ofrece` | administrador | flotante | Aviso «ya quedó» sobre Sucursales: «… ahora imparte / ya no imparte …» al marcar una disciplina (la escritura se simula) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-sucursales-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Sucursales: «La sucursal … se dio de baja.» (la escritura se simula) | `/admin/sucursales` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-aviso-guardado` | administrador | flotante | Aviso «ya quedó» sobre Programas: «El programa … se guardó.» (la escritura se simula) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-programas-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Programas: «El programa … se dio de baja.» (la escritura se simula) | `/admin/programas` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-aviso-guardado` | administrador | flotante | Aviso «ya quedó» sobre Grupos y horarios: «El grupo … se guardó.» (la escritura se simula) | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-grupos-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Grupos y horarios: «El grupo … se dio de baja.» (la escritura se simula) | `/admin/grupos` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-aviso-guardado` | administrador | flotante | Aviso «ya quedó» sobre Instructores y salones: «… se guardó como instructor.» (la escritura se simula) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-instructores-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Instructores y salones: «… se dio de baja como instructor.» (la escritura se simula) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-aviso-guardado` | administrador | flotante | Aviso «ya quedó» sobre Instructores y salones: «El salón … se guardó.» (la escritura se simula) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-salones-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Instructores y salones: «El salón … se dio de baja.» (la escritura se simula) | `/admin/instructores` | ✔ · ✔ | ✔ · ✔ |
| `adminc-precios-aviso-nueva-vigencia` | administrador | flotante | Aviso «ya quedó» sobre Precios: «El nuevo precio de … rige desde hoy: inscripción … y mensualidad … Lo ya inscrito conserva el precio…» (la escritura se simula) | `/admin/precios` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-aviso-guardada` | administrador | flotante | Aviso «ya quedó» sobre Promociones: «La promoción … se guardó.» (la escritura se simula) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-aviso-beneficio` | administrador | flotante | Aviso «ya quedó» sobre Promociones: «Beneficio agregado. Se guarda con la promoción.» (al agregar un beneficio a una promoción nueva) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-promociones-aviso-baja` | administrador | flotante | Aviso «ya quedó» sobre Promociones: «La promoción … se dio de baja.» (la escritura se simula) | `/admin/promociones` | ✔ · ✔ | ✔ · ✔ |
| `adminc-catalogo-aplicado` | administrador | estado | Cargar catálogo ya aplicado: «Listo: el catálogo se cargó» con su frase en pasado y el resumen (la aplicación se simula; la base no cambia) | `/admin/catalogo` | ✔ · ✔ | ✔ · ✔ |

## Administración: sistema y mensajería (180)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `admins-modulos-con-datos` | administrador | pantalla | Módulos tal como están sembrados (cada uno con lo que cambia al moverlo) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-cargando` | administrador | estado | Módulos cargando | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-error` | administrador | estado | Módulos con error de carga (500, «Reintentar») | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-todos-encendidos` | administrador | estado | Módulos con todos encendidos: cada interruptor dice «Si lo apagas…» y los que otros necesitan están bloqueados («primero apaga…») | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-algunos-apagados` | administrador | estado | Módulos con varios apagados (Operación, Finanzas y Tableros): «Si lo enciendes…» y el bloqueo «primero enciende…» | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-solo-captacion` | administrador | estado | Módulos con solo la captación encendida (todos los demás apagados) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-apagar-confirmar` | administrador | flotante | Confirmación «Apagar Tableros» (qué cambia y que surte efecto enseguida) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-apagar-error-servidor` | administrador | flotante | Confirmación «Apagar Tableros» con el error del servidor dentro (no se cierra) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-encender-error-servidor` | administrador | estado | Módulos: error del servidor al encender un módulo (el mensaje queda sobre la lista) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-encender-sin-conexion` | administrador | estado | Módulos: sin conexión al encender un módulo («No hay conexión con el servidor…») | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-con-datos` | administrador | pantalla | Usuarios y roles con datos | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-muchos` | administrador | estado | Usuarios y roles con muchos datos (la lista repetida doce veces) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-vacio` | administrador | estado | Usuarios y roles vacía | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-cargando` | administrador | estado | Usuarios y roles cargando | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-error` | administrador | estado | Usuarios y roles con error de carga (500, «Reintentar») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-busqueda` | administrador | estado | Usuarios y roles con una búsqueda que encuentra a una persona («asesor») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-busqueda-sin-resultados` | administrador | estado | Usuarios y roles con una búsqueda sin resultados («Nadie coincide con…») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-con-inactivo-y-agente` | administrador | estado | Usuarios y roles con una persona inactiva («Activar») y un asesor ligado a su agente de Chatwoot | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-activar-error-servidor` | administrador | estado | Usuarios y roles: error del servidor al pulsar «Activar» (el mensaje queda sobre la lista) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo usuario» vacío (asesor por omisión, con las sucursales que atiende) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-administrador` | administrador | flotante | Diálogo «Nuevo usuario» con el rol Administrador (sin sucursales) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo usuario» enviado vacío (nombre, correo y contraseña) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-validacion-contrasena` | administrador | flotante | Diálogo «Nuevo usuario» con un correo mal escrito y una contraseña corta | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo usuario» con el error del servidor («Ya existe un usuario con ese correo») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-nuevo-sin-conexion` | administrador | flotante | Diálogo «Nuevo usuario» sin conexión («No hay conexión con el servidor…») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-editar` | administrador | flotante | Diálogo «Editar usuario» de otra persona (correo fijo, activo, restablecer contraseña opcional) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-editar-yo` | administrador | flotante | Diálogo «Editar usuario» de uno mismo («Tu propia contraseña no se cambia aquí») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-editar-validacion` | administrador | flotante | Diálogo «Editar usuario» con el nombre borrado y una contraseña nueva corta | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-editar-error-servidor` | administrador | flotante | Diálogo «Editar usuario» con el error del servidor (no puede quedar sin administrador) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-restablecer-vacio` | administrador | flotante | Diálogo «Restablecer contraseña» vacío | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-restablecer-validacion` | administrador | flotante | Diálogo «Restablecer contraseña» con una contraseña corta («Debe tener al menos 10 caracteres») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-restablecer-error-servidor` | administrador | flotante | Diálogo «Restablecer contraseña» con el error del servidor (contraseña que lleva el nombre) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-chatwoot-vacio` | administrador | flotante | Diálogo «Agente de Chatwoot» de un asesor sin agente ligado | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-chatwoot-ligado` | administrador | flotante | Diálogo «Agente de Chatwoot» de un asesor ya ligado (con «Desvincular») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-chatwoot-validacion` | administrador | flotante | Diálogo «Agente de Chatwoot» con un número que no es número («Escribe el número del agente») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-chatwoot-error-servidor` | administrador | flotante | Diálogo «Agente de Chatwoot» con el error del servidor (Chatwoot sin configurar en el servidor de pruebas) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-desactivar-confirmar` | administrador | flotante | Confirmación «Desactivar a …» (qué pasa con sus sesiones y sus datos) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-desactivar-error-servidor` | administrador | flotante | Confirmación «Desactivar a …» con el error del servidor dentro | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-con-datos` | administrador | pantalla | Configuración de la escuela con sus ajustes, rangos y efectos | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-cargando` | administrador | estado | Configuración de la escuela cargando | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-error` | administrador | estado | Configuración de la escuela con error de carga (500, «Reintentar») | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-modulos-apagados` | administrador | estado | Configuración con módulos apagados: los ajustes de esos módulos dicen «Ojo: el módulo … está apagado» | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-validacion` | administrador | formulario | Configuración con errores de validación (hora de inicio después de la de fin, un número fuera de rango y uno que no es número) | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-error-servidor` | administrador | formulario | Configuración con el error del servidor al guardar (el mensaje queda sobre el botón «Guardar la configuración») | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-sin-conexion` | administrador | formulario | Configuración sin conexión al guardar («No hay conexión con el servidor…») | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-con-datos` | administrador | pantalla | Textos del asistente por sección (De siempre / Personalizado) | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-vacio` | administrador | estado | Textos del asistente vacía | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cargando` | administrador | estado | Textos del asistente cargando | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-error` | administrador | estado | Textos del asistente con error de carga (500, «Reintentar») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-personalizados` | administrador | estado | Textos del asistente con uno personalizado (insignia «Personalizado») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-modulos-apagados` | administrador | estado | Textos del asistente con los módulos de cotizador y clase muestra apagados (aviso «Puedes dejar estos textos listos…») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» con el texto de siempre (huecos disponibles y «Así se vería») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-vista-previa` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» con huecos agregados al texto y su vista previa | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-sin-huecos` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» de un mensaje sin huecos («Este mensaje no lleva huecos») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-personalizado` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» de un texto personalizado (con «Volver al texto de siempre») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-validacion-vacio` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» con el texto borrado («Escribe el mensaje…») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-validacion-hueco` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» con un hueco que no existe («no se puede usar en este mensaje») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-validacion-obligatorio` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» sin un hueco obligatorio («Falta {…}») | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-textos-cambiar-error-servidor` | administrador | flotante | Diálogo «Cambiar lo que dice el asistente» con el error del servidor bajo el campo | `/admin/textos` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-con-datos` | administrador | pantalla | Etapas del embudo con las del sistema (y las de cierre) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-muchos` | administrador | estado | Etapas del embudo con muchos datos (la lista repetida doce veces) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-vacio` | administrador | estado | Etapas del embudo vacía | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-cargando` | administrador | estado | Etapas del embudo cargando | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-error` | administrador | estado | Etapas del embudo con error de carga (500, «Reintentar») | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-con-propia` | administrador | estado | Etapas del embudo con una etapa propia («Tuya»: se puede subir, bajar y quitar) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-mover-error-servidor` | administrador | estado | Etapas del embudo: error del servidor al subir una etapa (el mensaje queda sobre la lista) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-agregar-vacio` | administrador | flotante | Diálogo «Agregar una etapa» vacío | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-agregar-validacion` | administrador | flotante | Diálogo «Agregar una etapa» enviado vacío y con los días mal escritos | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-agregar-error-servidor` | administrador | flotante | Diálogo «Agregar una etapa» con el error del servidor | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-cambiar` | administrador | flotante | Diálogo «Cambiar la etapa» de una etapa del sistema (nombre y días de aviso) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-cambiar-cierre` | administrador | flotante | Diálogo «Cambiar la etapa» de una etapa de cierre («no avisan por días sin movimiento») | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-cambiar-validacion` | administrador | flotante | Diálogo «Cambiar la etapa» con el nombre borrado | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-quitar-confirmar` | administrador | flotante | Confirmación «Quitar la etapa» | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-etapas-quitar-error-servidor` | administrador | flotante | Confirmación «Quitar la etapa» con el error del servidor (la etapa tiene leads) | `/admin/etapas` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-con-datos` | administrador | pantalla | Motivos de pérdida y de baja con datos (las dos listas) | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-muchos` | administrador | estado | Motivos de pérdida y de baja con muchos datos (la lista repetida doce veces) | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-vacio` | administrador | estado | Motivos de pérdida y de baja vacía | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-cargando` | administrador | estado | Motivos de pérdida y de baja cargando | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-error` | administrador | estado | Motivos de pérdida y de baja con error de carga (500, «Reintentar») | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-modulos-apagados` | administrador | estado | Motivos con el módulo de inscripción apagado (la lista de baja dice «Puedes dejar la lista lista…») | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-con-apagado` | administrador | estado | Motivos con uno apagado en cada lista (insignia «Apagado») | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-agregar-vacio` | administrador | flotante | Diálogo «Agregar un motivo» vacío (lista de pérdida) | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-agregar-baja` | administrador | flotante | Diálogo «Agregar un motivo» de la lista de baja de una inscripción | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-agregar-validacion` | administrador | flotante | Diálogo «Agregar un motivo» enviado vacío y con un lugar que no es número | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-agregar-error-servidor` | administrador | flotante | Diálogo «Agregar un motivo» con el error del servidor | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-cambiar` | administrador | flotante | Diálogo «Cambiar el motivo» (con la casilla «Se ofrece al registrar») | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-cambiar-validacion` | administrador | flotante | Diálogo «Cambiar el motivo» con el nombre borrado | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-quitar-confirmar` | administrador | flotante | Confirmación «Quitar el motivo» | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-motivos-quitar-error-servidor` | administrador | flotante | Confirmación «Quitar el motivo» con el error del servidor dentro | `/admin/motivos` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-con-datos` | administrador | pantalla | Canales de WhatsApp con datos | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-muchos` | administrador | estado | Canales de WhatsApp con muchos datos (la lista repetida doce veces) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-vacio` | administrador | estado | Canales de WhatsApp vacía | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-cargando` | administrador | estado | Canales de WhatsApp cargando | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-error` | administrador | estado | Canales de WhatsApp con error de carga (500, «Reintentar») | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-con-y-sin-bandeja` | administrador | estado | Canales de WhatsApp con un canal sin bandeja de Chatwoot («Agregar bandeja») y otro inactivo con calidad baja | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-nuevo-vacio` | administrador | flotante | Diálogo «Nuevo canal» vacío | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-nuevo-validacion` | administrador | flotante | Diálogo «Nuevo canal» enviado vacío (nombre y disciplina) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-nuevo-error-servidor` | administrador | flotante | Diálogo «Nuevo canal» con el error del servidor (número repetido) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-editar` | administrador | flotante | Diálogo «Editar canal» con sus datos | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-bandeja-agregar` | administrador | flotante | Diálogo «Bandeja de Chatwoot» de un canal sin bandeja (vacío) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-bandeja-editar` | administrador | flotante | Diálogo «Bandeja de Chatwoot» de un canal con bandeja (con sus números) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-bandeja-validacion` | administrador | flotante | Diálogo «Bandeja de Chatwoot» enviado vacío y con la bandeja sin cuenta | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-bandeja-error-servidor` | administrador | flotante | Diálogo «Bandeja de Chatwoot» con el error del servidor | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja el canal» | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja el canal» con el error del servidor (tiene bandeja) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-quitar-bandeja-confirmar` | administrador | flotante | Confirmación «Quitar la bandeja» | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-quitar-bandeja-error-servidor` | administrador | flotante | Confirmación «Quitar la bandeja» con el error del servidor (ya tiene conversaciones) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-con-datos` | administrador | pantalla | Campañas y códigos QR con datos | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-muchos` | administrador | estado | Campañas y códigos QR con muchos datos (la lista repetida doce veces) | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-vacio` | administrador | estado | Campañas y códigos QR vacía | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-cargando` | administrador | estado | Campañas y códigos QR cargando | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-error` | administrador | estado | Campañas y códigos QR con error de carga (500, «Reintentar») | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-con-inactiva` | administrador | estado | Campañas y códigos QR con una inactiva y una de cada origen | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-nueva-vacio` | administrador | flotante | Diálogo «Nueva campaña» vacío | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-nueva-validacion` | administrador | flotante | Diálogo «Nueva campaña» enviado vacío («Escribe un nombre que reconozcas…») | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-nueva-error-servidor` | administrador | flotante | Diálogo «Nueva campaña» con el error del servidor | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-editar` | administrador | flotante | Diálogo «Editar campaña» con sus datos | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-qr` | administrador | flotante | Diálogo «Código QR de la campaña» con el QR, la dirección y las dos descargas | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-qr-sin-sucursales` | administrador | flotante | Diálogo «Código QR de la campaña» sin sucursales que den la disciplina («Ninguna sucursal da esa disciplina todavía») | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja la campaña» | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-baja-error-servidor` | administrador | flotante | Confirmación «Dar de baja la campaña» con el error del servidor (tiene códigos QR en uso) | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-con-datos` | administrador | pantalla | Plantillas de mensaje con una de servicio (aprobada) y una de marketing (pendiente) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-muchos` | administrador | estado | Plantillas de mensaje con muchos datos (la lista repetida doce veces) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-vacio` | administrador | estado | Plantillas de mensaje vacía | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-cargando` | administrador | estado | Plantillas de mensaje cargando | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-error` | administrador | estado | Plantillas de mensaje con error de carga (500, «Reintentar») | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-filtro-servicio` | administrador | estado | Plantillas de mensaje filtradas por la clase «Servicio» | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-filtro-sin-resultados` | administrador | estado | Plantillas de mensaje con un filtro sin resultados («No hay plantillas con ese filtro») | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-estados-variados` | administrador | estado | Plantillas de mensaje en todos los estados de aprobación (aprobada, pendiente, rechazada, pausada, deshabilitada) y una inactiva | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-nueva-vacio` | administrador | flotante | Diálogo «Nueva plantilla» vacío (clase sin elegir) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-nueva-validacion` | administrador | flotante | Diálogo «Nueva plantilla» enviado vacío (código, identificador y clase) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-nueva-servicio-marketing` | administrador | flotante | Diálogo «Nueva plantilla» de servicio con categoría marketing («no puede ser de categoría marketing») | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-nueva-variables` | administrador | flotante | Diálogo «Nueva plantilla» de marketing con variables (una vacía: «Variable 1: posición de 1 a 20…») | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-nueva-error-servidor` | administrador | flotante | Diálogo «Nueva plantilla» con el error del servidor (código repetido) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-editar-servicio` | administrador | flotante | Diálogo «Editar plantilla» de servicio aprobada (con su variable y su texto) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-editar-marketing` | administrador | flotante | Diálogo «Editar plantilla» de marketing pendiente de aprobación | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-baja-confirmar` | administrador | flotante | Confirmación «Dar de baja la plantilla» | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-baja-en-uso` | administrador | flotante | Confirmación «Dar de baja la plantilla» con el error real del servidor (una automatización la usa) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-con-datos` | administrador | pantalla | Automatizaciones con datos (cada una con su evento, desfase, horario y plantilla) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-muchos` | administrador | estado | Automatizaciones con muchos datos (la lista repetida doce veces) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-vacio` | administrador | estado | Automatizaciones vacía | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-cargando` | administrador | estado | Automatizaciones cargando | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-error` | administrador | estado | Automatizaciones con error de carga (500, «Reintentar») | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-en-pausa` | administrador | estado | Automatizaciones con los módulos de clase muestra y finanzas apagados (insignia «En pausa: … está apagado») | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-variadas` | administrador | estado | Automatizaciones apagadas, sin plantilla y con plantilla sin aprobar («¡todavía no se puede mandar!»), de vertical y sucursal | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-alternar-error-servidor` | administrador | estado | Automatizaciones: error del servidor al pulsar «Apagar» (el mensaje queda sobre la lista) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-alternar-sin-conexion` | administrador | estado | Automatizaciones: sin conexión al pulsar «Apagar» («No hay conexión con el servidor…») | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-ajustar-recordatorio` | administrador | flotante | Diálogo «Ajustar la automatización» de un aviso ANTES de la clase (desfase negativo) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-ajustar-pago-atrasado` | administrador | flotante | Diálogo «Ajustar la automatización» de un aviso DESPUÉS del vencimiento (con «Máximo de días de atraso») | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-ajustar-validacion` | administrador | flotante | Diálogo «Ajustar la automatización» con errores (desfase con el signo contrario, intentos fuera de rango, horario fuera de 09:00–20:00 y ningún día) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-ajustar-validacion-atraso` | administrador | flotante | Diálogo «Ajustar la automatización» con el máximo de días de atraso fuera de rango | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-ajustar-error-servidor` | administrador | flotante | Diálogo «Ajustar la automatización» con el error del servidor (plantilla que no sirve) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-con-datos` | administrador | pantalla | Bandeja del administrador con un evento inesperado pendiente y una tarea sin lead | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-muchos` | administrador | estado | Bandeja del administrador con muchos datos (la lista repetida doce veces) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-vacio` | administrador | estado | Bandeja del administrador vacía | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-cargando` | administrador | estado | Bandeja del administrador cargando | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-error` | administrador | estado | Bandeja del administrador con error de carga (500, «Reintentar») | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-eventos-variados` | administrador | estado | Bandeja del administrador con eventos de todo tipo (uno atendido, uno sin tarea, uno repetido 7 veces) y el filtro «Solo los que tienen una tarea pendiente» apagado | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-detalle-abierto` | administrador | estado | Bandeja del administrador con el «Detalle para soporte» del evento desplegado | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-solo-eventos-vacio` | administrador | estado | Bandeja del administrador sin eventos pero con tareas sin lead (cada lista vacía por separado) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-error-solo-tareas` | administrador | estado | Bandeja del administrador con error de carga solo en las tareas sin lead (los eventos sí cargan) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-resolver-error-servidor` | administrador | estado | Bandeja del administrador: error del servidor al pulsar «Descartar» en una tarea (el mensaje queda arriba) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-resolver-sin-conexion` | administrador | estado | Bandeja del administrador: sin conexión al pulsar «Marcar hecha» («No hay conexión con el servidor…») | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-aviso-encendido` | administrador | flotante | Aviso «ya quedó» al encender un módulo («Tableros quedó encendido. …»; el cambio se simula) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-modulos-aviso-apagado` | administrador | flotante | Aviso «ya quedó» al apagar un módulo, después de confirmar («Tableros quedó apagado. …»; el cambio se simula) | `/admin/modulos` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-aviso-creado` | administrador | flotante | Aviso «ya quedó» al crear un usuario («Se creó el usuario …»; el alta se simula) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-aviso-contrasena` | administrador | flotante | Aviso «ya quedó» al restablecer la contraseña de otra persona (el cambio se simula) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-aviso-desactivado` | administrador | flotante | Aviso «ya quedó» al desactivar a una persona, después de confirmar (el cambio se simula) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-aviso-activado` | administrador | flotante | Aviso «ya quedó» al activar de nuevo a una persona («volvió a estar activo…»; el cambio se simula) | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-aviso-canal-guardado` | administrador | flotante | Aviso «ya quedó» al guardar un canal («El canal … se guardó.»; el cambio se simula) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-canales-aviso-bandeja-quitada` | administrador | flotante | Aviso «ya quedó» al quitar la bandeja de un canal, después de confirmar (el cambio se simula) | `/admin/canales` | ✔ · ✔ | ✔ · ✔ |
| `admins-campanas-aviso-guardada` | administrador | flotante | Aviso «ya quedó» al guardar una campaña («Ya puedes bajar su código QR.»; el cambio se simula) | `/admin/campanas` | ✔ · ✔ | ✔ · ✔ |
| `admins-plantillas-aviso-guardada-sin-aprobar` | administrador | flotante | Aviso «ya quedó» al guardar una plantilla sin aprobar («Mientras no esté aprobada, el sistema no la manda.»; el cambio se simula) | `/admin/plantillas` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-aviso-apagada` | administrador | flotante | Aviso «ya quedó» al apagar una automatización (el cambio se simula) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-aviso-encendida` | administrador | flotante | Aviso «ya quedó» al encender una automatización apagada (el cambio se simula) | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-aviso-hecha` | administrador | flotante | Aviso «ya quedó» al marcar atendido un evento de la bandeja («Listo: quedó atendido…»; el cambio se simula) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-bandeja-aviso-descartada` | administrador | flotante | Aviso «ya quedó» al descartar una tarea sin lead («Se descartó: ya no aparece…»; el cambio se simula) | `/admin/bandeja` | ✔ · ✔ | ✔ · ✔ |
| `admins-usuarios-aviso-guardado` | administrador | flotante | Aviso «ya quedó» al guardar los cambios de un usuario sin cambiar nada («Los cambios de … se guardaron.») | `/admin/usuarios` | ✔ · ✔ | ✔ · ✔ |
| `admins-automatizaciones-aviso-guardada` | administrador | flotante | Aviso «ya quedó» al guardar el ajuste de una automatización sin cambiar nada («quedó guardada. Vale para los avisos que se programen…») | `/admin/automatizaciones` | ✔ · ✔ | ✔ · ✔ |
| `admins-configuracion-guardada` | administrador | formulario | Configuración después de guardar sin cambiar nada: el aviso «Configuración guardada.» sobre el botón | `/admin/configuracion` | ✔ · ✔ | ✔ · ✔ |

## Asesor (133)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `asesor-embudo-tablero-datos` | asesor | pantalla | Embudo en tablero, con datos (asesor y administrador); aviso de estancados, «Descargar lista» y filtros | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-tablero-muchos` | asesor | estado | Embudo en tablero, con muchos leads | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-tablero-vacio` | asesor | estado | Embudo en tablero, sin ningún lead | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-sin-etapas` | asesor | estado | Embudo con la API vacía (sin etapas ni leads) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-cargando` | asesor | estado | Embudo cargando | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-error` | asesor | estado | Embudo con error de carga (con «Reintentar») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-truncado` | asesor | estado | Embudo con aviso de «se muestran los primeros N de M leads» | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-filtro-fuente` | asesor | estado | Embudo con el filtro de fuente desplegado y una fuente elegida | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-solo-estancados` | asesor | estado | Embudo con «Solo estancados» marcado (el indicador «Sin movimiento N d») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-filtros-sin-resultados` | asesor | estado | Embudo con filtros que no dejan ningún lead («No hay leads con estos filtros») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-tablero-celular-desplazado` | asesor | estado | Embudo en tablero en celular, desplazado a las últimas columnas (scroll horizontal) | `/embudo` | · · ✔ | · · ✔ |
| `asesor-embudo-administrador-tablero` | administrador | pantalla | Embudo en tablero visto por el administrador (leads de las dos sucursales) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-lista-datos` | asesor | estado | Embudo en lista, con datos | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-lista-muchos` | asesor | estado | Embudo en lista, con muchos leads | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-lista-vacio` | asesor | estado | Embudo en lista, sin ningún lead | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-lista-solo-estancados` | asesor | estado | Embudo en lista con «Solo estancados» (insignia «Estancado») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-abierto` | asesor | flotante | Diálogo «Mover a …» abierto, sin elegir (la etapa de inscrito aparece deshabilitada y se avisa qué falta) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-lista-abierto` | asesor | flotante | Diálogo «Mover a …» abierto desde la fila de la lista | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-etapa-elegida` | asesor | flotante | Diálogo de mover con una etapa abierta elegida y una nota (listo para enviar) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-perder-sin-motivo` | asesor | flotante | Diálogo de mover a «perdido» sin motivo (error de validación: «Elige el motivo de pérdida») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-perder-con-motivo` | asesor | flotante | Diálogo de mover a «perdido» con motivo y nota (listo para enviar) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-recuperar-sin-nota` | asesor | flotante | Diálogo de recuperar un lead perdido sin nota (aviso azul y error: «Escribe una nota: por qué se recupera») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-recuperar-con-nota` | asesor | flotante | Diálogo de recuperar un lead perdido con su nota (listo para enviar) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-error-servidor` | asesor | flotante | Diálogo de mover con error del servidor al enviar | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-conflicto` | asesor | flotante | Diálogo de mover cuando el lead ya cambió de etapa (409: «El lead cambió mientras lo veías») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-sin-conexion` | asesor | flotante | Diálogo de mover sin conexión al enviar («No hay conexión») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-inscripcion-apagada` | asesor | estado | Embudo en tablero con la inscripción apagada (cada tarjeta ofrece «Marcar como inscrito») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-embudo-lista-inscripcion-apagada` | asesor | estado | Embudo en lista con la inscripción apagada («Marcar como inscrito» en cada fila) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-mover-inscripcion-apagada` | asesor | flotante | Diálogo de mover con la inscripción apagada (la etapa de inscrito dice «usa Marcar como inscrito») | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-nota` | asesor | paso | Diálogo «Marcar a … como inscrito», paso 1: la nota (vacío) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-nota-vacia` | asesor | formulario | Marcar como inscrito, paso 1 con error de validación (nota vacía) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-nota-corta` | asesor | formulario | Marcar como inscrito, paso 1 con error de validación (nota demasiado corta) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-confirmar` | asesor | paso | Marcar como inscrito, paso 2: confirmar la nota | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-error-servidor` | asesor | paso | Marcar como inscrito, paso 2 con error del servidor | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-conflicto` | asesor | paso | Marcar como inscrito, paso 2 cuando el lead ya cambió (409) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-sin-conexion` | asesor | paso | Marcar como inscrito, paso 2 sin conexión | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-listo` | asesor | paso | Marcar como inscrito, paso 3: «Listo» | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-marcar-inscrito-sin-etapa` | asesor | estado | Marcar como inscrito cuando la escuela no tiene etapa de inscrito (aviso rojo y «Continuar» deshabilitado) | `/embudo` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-pendientes-datos` | asesor | pantalla | Tareas pendientes, con datos (asesor y administrador) | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-pendientes-muchos` | asesor | estado | Tareas pendientes, con muchas | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-pendientes-vacio` | asesor | estado | Tareas pendientes, vacías | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-cargando` | asesor | estado | Tareas cargando | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-error` | asesor | estado | Tareas con error de carga | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-todos-los-tipos` | asesor | estado | Tareas pendientes de todos los tipos (título, ayuda, código de error, vencimiento) | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-filtro-tipo` | asesor | estado | Tareas con la lista de «Tipo de tarea» y un tipo elegido | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-filtro-sin-resultados` | asesor | estado | Tareas pendientes con un tipo que no tiene ninguna («No hay tareas pendientes») | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-resueltas-datos` | asesor | estado | Tareas resueltas, con datos (hechas y descartadas) | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-resueltas-vacio` | asesor | estado | Tareas resueltas, vacías («Todavía no hay tareas resueltas») | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-resueltas-error` | asesor | estado | Tareas resueltas con error de carga | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-resolver-error` | asesor | estado | Tarea: «Marcar como hecha» con error del servidor | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-descartar-sin-conexion` | asesor | estado | Tarea: «Descartar» sin conexión | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-tareas-resolver-ocupado` | asesor | estado | Tarea: «Marcar como hecha» mientras se guarda (botón ocupado) | `/tareas` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-nuevo-chatwoot-tarea` | asesor | pantalla | Ficha de un lead nuevo con conversación en Chatwoot, campaña, código de rastreo y una tarea pendiente (asesor y administrador) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-contactado` | asesor | pantalla | Ficha de un lead contactado, sin conversación de WhatsApp ni tareas | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-estancado` | asesor | pantalla | Ficha de un lead estancado (diez días sin movimiento) con su tarea «Lead sin movimiento» | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-administrador` | administrador | pantalla | Ficha de un lead vista por el administrador | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-administrador-otra-sucursal` | administrador | pantalla | Ficha de un lead de la otra sucursal, vista por el administrador | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-con-clase-muestra` | asesor | pantalla | Ficha de un lead con clase muestra agendada (con «Reprogramar» y «Cancelar») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-completa` | asesor | pantalla | Ficha con todas las secciones llenas: niños (varios estados), de dónde llegó, cotizaciones, clases muestra, tareas e historial | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-muchos` | asesor | estado | Ficha con muchos datos en cada lista | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-vacia` | asesor | estado | Ficha sin niños, conversaciones, cotizaciones, clases, tareas ni historial (todos los «sin datos») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-perdido` | asesor | estado | Ficha de un lead perdido, con motivo, recuperaciones y su historial de pérdida y recuperación | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-inscrito-a-mano` | asesor | estado | Ficha de un lead inscrito a mano (insignia «Inscrito a mano» y su línea en el historial) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-inscrito-con-inscripcion` | asesor | estado | Ficha de un lead ya inscrito en el sistema, con otro niño por inscribir («Convertir e inscribir» de nuevo) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-sin-sucursal` | asesor | estado | Ficha de un lead sin sucursal (aviso «Falta la sucursal» y botones para elegirla) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-elegir-sucursal-error` | asesor | estado | Ficha sin sucursal: error del servidor al elegir una | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-sin-modulos` | asesor | estado | Ficha con los módulos de cotizador y clase muestra apagados (sin esas secciones ni sus botones) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-inscripcion-apagada` | asesor | estado | Ficha con la inscripción apagada («Marcar como inscrito» en lugar de «Convertir e inscribir») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-cargando` | asesor | estado | Ficha cargando | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-error` | asesor | estado | Ficha con error de carga (con «Reintentar») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-no-encontrado` | asesor | estado | Ficha de un lead que no existe (404) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-de-otra-sucursal` | asesor | estado | Ficha de un lead de otra sucursal, que el asesor no puede ver | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-historial-error` | asesor | estado | Ficha con error al cargar el historial de etapas | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-chatwoot-sin-direccion` | asesor | estado | Ficha con conversación pero sin dirección pública de Chatwoot (aviso «No se puede abrir la conversación») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-chatwoot-dos-conversaciones` | asesor | estado | Ficha con dos conversaciones: un botón «Abrir conversación en Chatwoot» por cada una | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-mover-abierto` | asesor | flotante | Ficha con el diálogo «Mover a …» abierto | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-marcar-inscrito-abierto` | asesor | flotante | Ficha con el diálogo «Marcar a … como inscrito» abierto | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ficha-tarea-resolver-error` | asesor | estado | Ficha: «Marcar como hecha» una tarea pendiente con error del servidor | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ninos-variados` | asesor | estado | Sección «Niños» con un niño por inscribir, uno sin edad, uno que ya es alumno y uno con fecha de nacimiento y programa sugerido | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-ninos-vacio` | asesor | estado | Sección «Niños» sin ningún niño registrado | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-abierto` | asesor | flotante | Diálogo «Agregar otro niño», vacío (con «Escribe el nombre.») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-sin-fecha` | asesor | formulario | Agregar niño con error de validación: falta la fecha de nacimiento o la edad | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-fecha-mala` | asesor | formulario | Agregar niño con error de validación: fecha de nacimiento en el futuro | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-edad-mala` | asesor | formulario | Agregar niño con error de validación: la edad no es un número | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-listo` | asesor | formulario | Agregar niño con todo lleno (botones «Guardar» y «Guardar y agregar otro» habilitados) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-varias-disciplinas` | asesor | formulario | Agregar niño cuando la sucursal ofrece varias disciplinas (aparece «Disciplina de interés») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-error-campo` | asesor | formulario | Agregar niño con errores del servidor en los campos (nombre y fecha de nacimiento) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-error-general` | asesor | formulario | Agregar niño con error general del servidor (tope de niños) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-sin-conexion` | asesor | formulario | Agregar niño sin conexión al guardar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregar-y-otro` | asesor | formulario | Agregar niño tras «Guardar y agregar otro»: el formulario sigue abierto y limpio con «Listo, ya está en la ficha» | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-agregado-con-aviso` | asesor | estado | Ficha tras guardar un niño con avisos del servidor (aviso amarillo sobre la lista de niños) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-corregir-abierto` | asesor | flotante | Diálogo «Corregir a …» abierto, con los datos del niño | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-corregir-sin-nombre` | asesor | formulario | Corregir niño con error de validación: nombre borrado | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-corregir-error-servidor` | asesor | formulario | Corregir niño con error del servidor al guardar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-quitar-abierto` | asesor | flotante | Diálogo «Quitar a …» abierto (confirmación) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-quitar-error` | asesor | flotante | Confirmación de quitar niño con error del servidor | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-nino-quitar-sin-conexion` | asesor | flotante | Confirmación de quitar niño sin conexión | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizaciones-lista` | asesor | estado | Sección «Cotizaciones» con cotizaciones del bot y a mano (vigente, aceptada, vencida; con promociones, sin precio, lista de espera, la familia eligió) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizaciones-vacio` | asesor | estado | Sección «Cotizaciones» vacía («Todavía no se le cotiza nada») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizaciones-error` | asesor | estado | Sección «Cotizaciones» con error de carga | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizaciones-cargando` | asesor | estado | Sección «Cotizaciones» cargando | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-formulario` | asesor | formulario | Formulario «Cotizar a mano» abierto, con los programas que da el cotizador para esa edad | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-desde-nino` | asesor | formulario | Formulario de cotizar abierto desde el botón «Cotizar» del niño (con ese niño elegido) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-con-promociones` | asesor | formulario | Cotizar a mano con el resultado de la cotización: precio con las promociones que aplican hoy, sugerencia de hermanos y meses | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-hermanos-invalido` | asesor | formulario | Cotizar a mano con errores de validación: hermanos y meses que no son números enteros | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-sin-programa` | asesor | formulario | Cotizar a mano cuando no hay programa para esa edad («No hay programas para esa edad en esta sucursal») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-programa-sin-precio` | asesor | formulario | Cotizar a mano con un programa sin precio vigente (opción deshabilitada, «Guardar cotización» deshabilitado) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-error-carga` | asesor | formulario | Cotizar a mano con error al buscar los programas | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-buscando` | asesor | formulario | Cotizar a mano buscando programas («Buscando programas…») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-error-guardar` | asesor | formulario | Cotizar a mano con error del servidor al guardar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-sin-conexion` | asesor | formulario | Cotizar a mano sin conexión al guardar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-sin-sucursal` | asesor | formulario | Cotizar a mano en un lead sin sucursal (aviso «Este lead todavía no tiene sucursal») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-cotizar-sin-edad` | asesor | formulario | Cotizar a mano cuando no hay niños con edad por cotizar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clases-variadas` | asesor | estado | Sección «Clase muestra» con clases en cada estado (agendada, asistió, no asistió, cancelada con motivo) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clases-asistida` | asesor | estado | Sección «Clase muestra» de un lead cuya clase ya se asistió (sin botones) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clases-error` | asesor | estado | Sección «Clase muestra» con error de carga | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clases-cargando` | asesor | estado | Sección «Clase muestra» cargando | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-abierto` | asesor | flotante | Diálogo «Agendar clase muestra» abierto, con las sesiones que tienen lugar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sesion-elegida` | asesor | formulario | Agendar clase muestra con una sesión elegida y notas (listo para enviar) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-dos-alumnos` | asesor | formulario | Agendar clase muestra en una familia con dos niños por inscribir (el selector «Alumno» con opciones) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sin-cupo` | asesor | formulario | Agendar clase muestra con error del servidor: la sesión ya no tiene lugar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sin-horario` | asesor | formulario | Agendar clase muestra con error de validación del servidor: la hora no es un horario del grupo | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sin-conexion` | asesor | formulario | Agendar clase muestra sin conexión al enviar | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sin-sesiones` | asesor | formulario | Agendar clase muestra en un grupo sin sesiones con lugar en los próximos días | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-sin-grupos` | asesor | formulario | Agendar clase muestra cuando no hay grupos activos de esa disciplina en la sucursal | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-error-sesiones` | asesor | formulario | Agendar clase muestra con error al buscar las sesiones | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-agendar-buscando` | asesor | formulario | Agendar clase muestra buscando sesiones («Buscando sesiones con lugar…») | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-reprogramar-abierto` | asesor | flotante | Diálogo «Reprogramar clase muestra» abierto | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-reprogramar-error` | asesor | formulario | Reprogramar clase muestra con error del servidor (sin cupo) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-cancelar-abierto` | asesor | flotante | Diálogo «Cancelar clase muestra» abierto (confirmación) | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-cancelar-con-motivo` | asesor | flotante | Cancelar clase muestra con el motivo escrito | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-cancelar-error` | asesor | flotante | Cancelar clase muestra con error del servidor | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |
| `asesor-clase-cancelar-sin-conexion` | asesor | flotante | Cancelar clase muestra sin conexión | `/leads/:id` | ✔ · ✔ | ✔ · ✔ |

## Conversión e inscripción (73)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `conv-asistente-cargando` | asesor | estado | Asistente de conversión cargando (asesor y administrador) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-asistente-error-de-carga` | asesor | estado | Asistente de conversión con error de carga y botón de reintentar (asesor y administrador) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-asistente-lead-inexistente` | asesor | estado | Asistente de un lead que no existe o no es del alcance de la persona | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-asistente-error-de-oferta` | asesor | estado | Asistente cuando falla el cálculo de la oferta (cotizador): error con reintentar | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-asistente-ya-convertido` | asesor | estado | Asistente de un lead ya convertido: «Todo está convertido e inscrito» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-familia-capturada` | asesor | paso | Paso 1 Familia con los adultos que capturó el maestro («En este paso no hay nada por capturar») | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-familia-lista-para-cerrar` | asesor | paso | Paso 1 Familia con el aviso «El maestro marcó a esta familia como lista para cerrar» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-alumnos-falta-apellidos` | asesor | paso | Paso 2 Alumnos: lo capturado se ve con «Capturado», falta el apellido; «Siguiente» deshabilitado con «Para seguir falta…» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-alumnos-corregir` | asesor | paso | Paso 2 Alumnos tras pulsar «Corregir» el nombre: el campo con «Antes: …» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-alumnos-corregir-fecha` | asesor | paso | Paso 2 Alumnos tras pulsar «Corregir» la fecha de nacimiento y teclear una fecha futura (dato malo) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-alumnos-apellidos-escritos` | asesor | paso | Paso 2 Alumnos con el apellido escrito: «Siguiente» habilitado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-grupo-recomendado` | asesor | paso | Paso 3 Grupo y horario con el grupo «recomendado por el maestro» ya elegido y los lugares reales | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-grupo-mas-opciones` | asesor | paso | Paso 3 Grupo y horario con «Más opciones de la inscripción» abierto y llenas (fecha de inicio, día de corte, meses) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-grupo-mas-opciones-dato-malo` | asesor | paso | Paso 3 Grupo y horario con un día de corte inválido escrito (99): el asistente lo deja pasar y el servidor lo rechazaría | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-grupo-sin-cupo` | asesor | paso | Paso 3 Grupo y horario con el grupo recomendado sin cupo («Lleno», deshabilitado, aviso «ya no tiene lugares») y «Siguiente» bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-grupo-sin-programas` | asesor | paso | Paso 3 Grupo y horario cuando no hay programas para esa edad en la sucursal (aviso) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-precio-con-importes` | asesor | paso | Paso 4 Precio con inscripción, mensualidad y «No aplica ninguna promoción hoy» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-precio-con-promocion` | asesor | paso | Paso 4 Precio con importe tachado → descuento, meses gratis y la lista de promociones que aplican (respuesta del cotizador simulada) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-precio-sin-precio-vigente` | asesor | paso | Paso 4 Precio de un programa sin precio vigente (aviso rojo; respuesta del cotizador simulada) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-reglamento-pendiente` | asesor | paso | Paso 5 Reglamento e imagen sin aceptar: «Falta que la familia acepte», formulario de aceptación del reglamento y de la imagen, «Siguiente» bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-reglamento-otra-persona` | asesor | paso | Paso 5 Reglamento con «Otra persona» elegida: pide el nombre y «Aceptan» queda deshabilitado hasta escribirlo | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-reglamento-texto-abierto` | asesor | paso | Paso 5 Reglamento con «Leer el texto que se le muestra a la familia» abierto | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-reglamento-error-del-servidor` | asesor | paso | Paso 5 Reglamento: el servidor rechaza la aceptación (422) y se ve el error bajo el formulario | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-epsilon-reglamento-sin-red` | asesor | paso | Paso 5 Reglamento sin conexión: al pulsar «Aceptan» sale «No hay conexión con el servidor» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-familia-falta-parentesco` | asesor | paso | Paso 1 Familia de un lead sin registro: el contacto (nombre y teléfono) y el campo «Parentesco» obligatorio; «Siguiente» bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-familia-datos-opcionales` | asesor | paso | Paso 1 Familia con el parentesco escrito y «Datos opcionales del adulto» abierto (apellidos y correo) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-alumnos-sin-registro` | asesor | paso | Paso 2 Alumnos sin registro del maestro: «Todavía no hay registro», apellidos y fecha de nacimiento obligatorios; «Siguiente» bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-alumnos-fecha-imposible` | asesor | paso | Paso 2 Alumnos con apellidos y una fecha de nacimiento futura (2099): sigue faltando la fecha y «Siguiente» sigue bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-alumnos-completos` | asesor | paso | Paso 2 Alumnos con apellidos y fecha válida escritos: «Siguiente» habilitado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-grupo-sin-elegir` | asesor | paso | Paso 3 Grupo y horario sin grupo elegido (ninguno recomendado): «Siguiente» bloqueado, «Para seguir falta: Grupo y horario» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-precio-con-grupo` | asesor | paso | Paso 4 Precio con un grupo elegido (grupo, importes y promociones del grupo elegido) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-zeta-reglamento-sin-clase-muestra` | asesor | paso | Paso 5 Reglamento de un lead sin clase muestra: «Para registrar la aceptación hace falta una clase muestra» con enlace a la ficha; «Siguiente» bloqueado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-reglamento-aceptado` | asesor | paso | Paso 5 Reglamento ya aceptado («La familia ya aceptó el reglamento vigente», insignia «Aceptado»); «Revisar y confirmar» habilitado (ESCRIBE: acepta el reglamento del lead consumible) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-todo-listo` | asesor | paso | Paso 6 Confirmar: «Todo listo para inscribir», resumen de la familia y del alumno con importes; «Convertir e inscribir» habilitado (sin enviar) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-reglamento-pendiente` | asesor | paso | Paso 6 Confirmar con el aviso «Todavía falta el reglamento» (la vista previa dice que el reglamento está pendiente; respuesta simulada) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-faltan-datos` | asesor | paso | Paso 6 Confirmar con «Todavía falta para poder inscribir» y botones «Ir a este paso» (la vista previa trae una falta que ningún paso resuelve; respuesta simulada); «Convertir e inscribir» deshabilitado | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-convirtiendo` | asesor | estado | Paso 6 Confirmar mientras se inscribe: «Convertir e inscribir» con el indicador de «cargando» (el servidor tarda) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-rechazo-grupo-lleno` | asesor | estado | Paso 6 Confirmar: el servidor rechaza con 409 «grupo lleno» («No se inscribió a nadie…», «Ponerlo en lista de espera», «Volver al paso Grupo y horario») | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-lista-de-espera-error` | asesor | estado | Paso 6 Confirmar tras el rechazo por grupo lleno, al pulsar «Ponerlo en lista de espera» el servidor falla (error bajo los botones) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-rechazo-faltan-datos` | asesor | estado | Paso 6 Confirmar: el servidor rechaza con 409 «faltan datos» y lista lo que falta, con «Volver al paso …» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-rechazo-reglamento` | asesor | estado | Paso 6 Confirmar: el servidor rechaza con 409 por el reglamento («Volver al paso Reglamento e imagen») | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-rechazo-fuera-de-edad` | asesor | estado | Paso 6 Confirmar: el servidor rechaza con 409 porque el alumno está fuera del rango de edad del grupo | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-rechazo-datos-invalidos` | asesor | estado | Paso 6 Confirmar: el servidor rechaza con 422 por datos inválidos (error general sin paso al que volver) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-error-del-servidor` | asesor | estado | Paso 6 Confirmar: error 500 del servidor al inscribir | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-confirmar-sin-red` | asesor | estado | Paso 6 Confirmar sin conexión: «No hay conexión con el servidor» al pulsar «Convertir e inscribir» | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-exito-inscrito` | asesor | pantalla | Pantalla «Listo: familia e inscripción creadas»: alumno creado e inscrito con su resumen de importes, «Volver a la ficha» y «Ver el estado de cuenta» (el POST final se responde en la escena) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-exito-ya-existia` | asesor | pantalla | Pantalla «Listo…» cuando el alumno ya existía y ya estaba inscrito en ese grupo (el POST final se responde en la escena) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-cargando` | maestro | estado | Maestro, «Hoy», cierre en sitio revisando si ya se puede inscribir («Revisando si ya se puede inscribir…») | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-error-de-carga` | maestro | estado | Maestro, «Hoy», cierre en sitio cuando falla la vista previa de la conversión (error) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-faltan-datos` | maestro | pantalla | Maestro, «Hoy», cierre en sitio con «Todavía falta para poder inscribirlo» (grupo y reglamento) y «Inscribir a mi alumno» deshabilitado | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-faltan-datos-precio` | maestro | pantalla | Maestro, «Hoy», cierre en sitio con falta de precio del grupo («avísale al asesor») y falta de nombre de alumno (etiquetas genéricas) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-listo` | maestro | pantalla | Maestro, «Hoy», cierre en sitio listo: «Ya está todo lo necesario» y «Inscribir a mi alumno» habilitado | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-ya-inscrito` | maestro | pantalla | Maestro, «Hoy», cierre en sitio de un alumno que ya está inscrito («Este alumno ya está inscrito») | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-dialogo-confirmar` | maestro | flotante | Diálogo «Inscribir a …» con el grupo donde quedará, «Sí, inscribir» y «Todavía no» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-dialogo-inscribiendo` | maestro | flotante | Diálogo «Inscribir a …» mientras se inscribe («Sí, inscribir» cargando; el servidor tarda) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-rechazo-grupo-lleno` | maestro | estado | Maestro, «Hoy», tras confirmar el servidor rechaza por grupo lleno: «El grupo … ya no tiene lugares» y «Avisar al asesor» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-rechazo-otro-motivo` | maestro | estado | Maestro, «Hoy», tras confirmar el servidor rechaza con 409 por otro motivo (reglamento): error y «Avisar al asesor» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-error-del-servidor` | maestro | estado | Maestro, «Hoy», tras confirmar el servidor falla (500): el diálogo se cierra y se ve el error sobre el botón | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-sin-red` | maestro | estado | Maestro, «Hoy», sin conexión al confirmar la inscripción («No hay conexión con el servidor») | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-exito` | maestro | estado | Maestro, «Hoy», tras inscribir: «Listo: tu alumno quedó inscrito» (el POST se responde en la escena) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-avisado` | maestro | estado | Maestro, «Hoy», tras el rechazo por grupo lleno y «Avisar al asesor»: «Listo: el asesor recibió el aviso» (la tarea se responde en la escena) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-cierre-avisar-error` | maestro | estado | Maestro, «Hoy», «Avisar al asesor» falla (500): el error junto al botón | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-familia-y-marcar` | asesor | paso | Lead con dos niños: «¿A quiénes se inscribe ahora?» con una casilla por niño, y el paso 1 Familia (ESCRIBE: agrega un hermano al lead consumible) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-uno-desmarcado` | asesor | paso | Lead con dos niños, con uno desmarcado («Los que no marques se quedan en la ficha»): la casilla del único marcado queda deshabilitada | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-alumnos` | asesor | paso | Paso 2 Alumnos con dos niños: una tarjeta por niño, uno con lo del maestro y otro sin registro; «Para seguir falta» dice de cuál es cada falta | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-grupo` | asesor | paso | Paso 3 Grupo y horario con dos niños: una tarjeta de grupo por niño (el primero ya traía el recomendado, el segundo elegido ahora) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-precio` | asesor | paso | Paso 4 Precio con dos niños: «Se cotiza con 1 hermano ya inscrito (contando a los que se inscriben antes)» para el segundo | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-reglamento-extender` | asesor | paso | Paso 5 Reglamento con dos niños: el segundo sin aceptar con el botón «Aceptan lo mismo que por …» (el primero ya aceptó) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-reglamento-error` | asesor | paso | Paso 5 Reglamento con dos niños: «Aceptan lo mismo que por …» falla en el servidor (error bajo el botón) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-confirmar-listo` | asesor | paso | Paso 6 Confirmar con dos niños: resumen con los dos y «Todo listo» (ESCRIBE: la familia acepta el reglamento del segundo niño) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-rechazo-grupo-lleno` | asesor | estado | Paso 6 Confirmar con dos niños: 409 «grupo lleno» del segundo, con «Dejar fuera a …» y «Ponerlo en lista de espera» (el POST se responde en la escena) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-dejar-fuera` | asesor | estado | Tras «Dejar fuera a …» en el rechazo por grupo lleno: solo queda marcado el primero y el asistente vuelve a calcular lo que falta | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |
| `conv-hermanos-exito` | asesor | pantalla | Pantalla «Listo: familia e inscripción creadas» con dos niños inscritos (el POST final se responde en la escena) | `/leads/:id/convertir` | ✔ · ✔ | ✔ · ✔ |

## Familias, alumnos y expediente (101)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `familia-alumnos-lista` | recepcion | pantalla | Alumnos: buscador y lista con datos (recepción, asesor y administrador) | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-buscar-nombre` | recepcion | estado | Alumnos: búsqueda por nombre con resultados («Hija») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-buscar-telefono` | recepcion | estado | Alumnos: búsqueda por el teléfono de un adulto de la familia | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-sin-resultados` | recepcion | estado | Alumnos: búsqueda sin resultados («No hay alumnos que coincidan») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-filtro-congelados` | recepcion | estado | Alumnos: filtrada por estatus «Congelados» | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-filtro-bajas` | recepcion | estado | Alumnos: filtrada por estatus «Bajas» | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-vacio` | recepcion | estado | Alumnos: lista vacía («No hay alumnos que coincidan») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-muchos` | recepcion | estado | Alumnos: lista con muchos datos (veinte tarjetas) | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-paginacion` | recepcion | estado | Alumnos: paginador «Página 2 de 4» (tras pulsar «Siguiente») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-busqueda-incompleta` | recepcion | estado | Alumnos: aviso «Hay más resultados de los que se pudieron revisar» (búsqueda por nombre incompleta) | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-cargando` | recepcion | estado | Alumnos: cargando | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-error` | recepcion | estado | Alumnos: error de carga con «Reintentar» | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-sin-conexion` | recepcion | estado | Alumnos: al buscar sin conexión («No hay conexión con el servidor») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-recepcion` | recepcion | pantalla | Expediente, «Trayectoria», con datos y las acciones sobre la inscripción (recepción) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-asesor` | asesor | pantalla | Expediente, «Trayectoria», con datos (asesor) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-administrador` | administrador | pantalla | Expediente, «Trayectoria», con datos y el botón «Salud» (administrador) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-economico` | recepcion | pantalla | Expediente, «Económico»: mensualidad, cuenta (recepción, asesor y administrador) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-operativo` | recepcion | pantalla | Expediente, «Operativo»: asistencia, eventos, productos (recepción, asesor y administrador) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-comercial` | recepcion | pantalla | Expediente, «Comercial»: cómo llegó, hermanos (recepción, asesor y administrador) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-completa` | recepcion | estado | Expediente, «Trayectoria» con todo: inscripción activa, congelada y en baja, cambios de grupo, avance y próximo evento | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-economico-completo` | recepcion | estado | Expediente, «Económico» con promoción aplicada y beneficios pendientes | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-economico-sin-cuenta` | recepcion | estado | Expediente, «Económico» con «El estado de cuenta todavía no está disponible» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-operativo-completo` | recepcion | estado | Expediente, «Operativo» con faltas en el umbral, eventos con resultado y productos comprados | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-operativo-sin-datos` | recepcion | estado | Expediente, «Operativo» sin asistencia, sin eventos y con «No disponible todavía» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-comercial-completo` | recepcion | estado | Expediente, «Comercial» con campaña, hermanos inscritos y bajas | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-inscripcion-congelada` | recepcion | estado | Expediente con la inscripción congelada (la acción pasa a «Reactivar») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-inscripcion-baja` | recepcion | estado | Expediente con la inscripción en baja (sin acciones) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-vacio` | recepcion | estado | Expediente, «Trayectoria» sin nada que mostrar (listas vacías) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-trayectoria-muchos` | recepcion | estado | Expediente, «Trayectoria» con muchos datos (listas repetidas) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-economico-vacio` | recepcion | estado | Expediente, «Económico» sin nada que mostrar (listas vacías) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-economico-muchos` | recepcion | estado | Expediente, «Económico» con muchos datos (listas repetidas) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-operativo-vacio` | recepcion | estado | Expediente, «Operativo» sin nada que mostrar (listas vacías) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-operativo-muchos` | recepcion | estado | Expediente, «Operativo» con muchos datos (listas repetidas) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-comercial-vacio` | recepcion | estado | Expediente, «Comercial» sin nada que mostrar (listas vacías) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-comercial-muchos` | recepcion | estado | Expediente, «Comercial» con muchos datos (listas repetidas) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-cargando` | recepcion | estado | Expediente: cargando | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-error` | recepcion | estado | Expediente: error de carga con «Reintentar» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-no-encontrado` | recepcion | estado | Expediente de un alumno que no existe (404) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-vacio` | recepcion | flotante | Cuadro «Cambiar de grupo» vacío (elegir el grupo nuevo; «Confirmar el cambio» apagado) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-elegido` | recepcion | flotante | Cuadro «Cambiar de grupo» con el grupo de un solo lugar elegido («· 1 lugar») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-grupo-lleno` | recepcion | flotante | Cuadro «Cambiar de grupo» con el grupo de un solo lugar ya lleno («· lleno», no se puede elegir) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-sin-grupos` | recepcion | flotante | Cuadro «Cambiar de grupo» sin otro grupo activo del programa | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-cargando` | recepcion | flotante | Cuadro «Cambiar de grupo» cargando los grupos y sus lugares | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-error-carga` | recepcion | flotante | Cuadro «Cambiar de grupo» con error al cargar los lugares de cada grupo («Reintentar») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-error-servidor` | recepcion | flotante | Cuadro «Cambiar de grupo» con el rechazo del servidor (el último lugar se ocupó mientras se miraba) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-sin-conexion` | recepcion | flotante | Cuadro «Cambiar de grupo» sin conexión al confirmar | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-congelar` | recepcion | flotante | Cuadro «Congelar la inscripción»: la confirmación | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-congelar-error-servidor` | recepcion | flotante | Cuadro «Congelar la inscripción» con el rechazo del servidor | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-reactivar` | recepcion | flotante | Cuadro «Reactivar la inscripción»: la confirmación | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-reactivar-error-servidor` | recepcion | flotante | Cuadro «Reactivar la inscripción» con el rechazo del servidor (el grupo se llenó mientras estaba congelada) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-vacio` | recepcion | flotante | Cuadro «Dar de baja» vacío (motivo obligatorio; «Dar de baja» apagado) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-con-motivo` | recepcion | flotante | Cuadro «Dar de baja» con un motivo elegido («Dar de baja» habilitado) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-sin-motivos` | recepcion | flotante | Cuadro «Dar de baja» sin motivos en el catálogo (lista de motivos vacía) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-cargando` | recepcion | flotante | Cuadro «Dar de baja» cargando los motivos | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-error-carga` | recepcion | flotante | Cuadro «Dar de baja» con error al cargar los motivos («Reintentar») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-error-servidor` | recepcion | flotante | Cuadro «Dar de baja» con el rechazo del servidor («La inscripción ya está dada de baja») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-sin-conexion` | recepcion | flotante | Cuadro «Dar de baja» sin conexión al confirmar | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-motivo` | administrador | pantalla | Salud del alumno: se pide el motivo de la consulta (administrador; el maestro la ve igual) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-motivo-escrito` | administrador | estado | Salud del alumno con el motivo escrito («Ver datos de salud» habilitado) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-ficha` | administrador | estado | Salud del alumno: la ficha vista, con la cuenta atrás «Se ocultan en … s» | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-sin-ficha` | administrador | estado | Salud del alumno: «Todavía no hay ficha de salud» (todo «Sin registrar») | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-ficha-parcial` | administrador | estado | Salud del alumno: ficha con contacto de emergencia, atención de urgencia no autorizada y campos sin registrar | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-error-servidor` | administrador | estado | Salud del alumno: la consulta falla (error del servidor bajo el campo del motivo) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-cargando` | administrador | estado | Salud del alumno: cargando | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-salud-error` | administrador | estado | Salud del alumno: error al cargar al alumno con «Reintentar» | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista` | recepcion | pantalla | Familias: buscador y lista con datos (recepción, asesor y administrador) | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-buscar-telefono` | recepcion | estado | Familias: búsqueda por teléfono en cualquier formato, con resultado | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-buscar-nombre` | recepcion | estado | Familias: búsqueda por nombre, con resultado | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-sin-resultados` | recepcion | estado | Familias: búsqueda sin resultados («No encontré a esa familia») | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-vacio` | recepcion | estado | Familias: lista vacía («No encontré a esa familia») | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-muchos` | recepcion | estado | Familias: lista con muchos datos (veinte tarjetas) | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-paginacion` | recepcion | estado | Familias: paginador «Página 2 de 3» (tras pulsar «Siguiente») | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-busqueda-incompleta` | recepcion | estado | Familias: aviso «Hay más resultados de los que se pudieron revisar» | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-cargando` | recepcion | estado | Familias: cargando | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-error` | recepcion | estado | Familias: error de carga con «Reintentar» | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-familias-lista-sin-conexion` | recepcion | estado | Familias: al buscar sin conexión («No hay conexión con el servidor») | `/familias` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo` | asesor | pantalla | Familias con un solo hijo (venta cruzada): con datos (asesor, recepción y administrador) | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-muchos` | asesor | estado | Familias con un solo hijo: muchos datos | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-paginacion` | asesor | estado | Familias con un solo hijo: paginador «Página 2 de 3» (tras pulsar «Siguiente») | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-vacio` | asesor | estado | Familias con un solo hijo: lista vacía | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-cargando` | asesor | estado | Familias con un solo hijo: cargando | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-error` | asesor | estado | Familias con un solo hijo: error de carga con «Reintentar» | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-un-solo-hijo-otra-sucursal` | asesor | estado | Familias con un solo hijo: disciplinas disponibles, en otra sucursal y sin disciplinas por probar | `/familias/un-solo-hijo` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-recepcion` | recepcion | pantalla | Ficha de la familia: adulto, saldo, hijos, «Estado de cuenta» y «Registrar pago» (recepción y administrador) | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-asesor` | asesor | pantalla | Ficha de la familia (asesor: ve el saldo pero no puede registrar un pago) | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-hijos-variados` | recepcion | estado | Ficha de la familia con tres hijos (activo, congelado y baja), sin correo y con dirección | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-sin-hijos` | recepcion | estado | Ficha de la familia sin hijos («Esta familia todavía no tiene alumnos») | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-muchos` | recepcion | estado | Ficha de la familia con muchos hijos | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-saldo-cargando` | recepcion | estado | Ficha de la familia con el saldo cargando | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-saldo-error` | recepcion | estado | Ficha de la familia con error al cargar el saldo («Reintentar» dentro de la tarjeta) | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-cargando` | recepcion | estado | Ficha de la familia: cargando | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-error` | recepcion | estado | Ficha de la familia: error de carga con «Reintentar» | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-no-encontrada` | recepcion | estado | Ficha de una familia que no existe (404) | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-congelar-hecho` | recepcion | estado | Expediente tras congelar de verdad la inscripción (escritorio: hijo mayor; celular: hijo menor): «Congelada» y la acción «Reactivar» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-reactivar-real` | recepcion | flotante | Cuadro «Reactivar la inscripción» sobre una inscripción congelada de verdad (el hijo de la vista) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-reactivar-hecho` | recepcion | estado | Expediente tras reactivar de verdad la inscripción: vuelve a «Activa» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-cambiar-hecho` | recepcion | estado | Expediente tras cambiar de verdad de grupo (al grupo con lugares de sobra): el grupo nuevo y «Cambios de grupo» | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-acciones-baja-hecho` | recepcion | estado | Expediente tras dar de baja de verdad la inscripción: «Baja», sin acciones y el alumno en baja | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-expediente-comercial-con-baja` | recepcion | estado | Expediente, «Comercial», con la tarjeta «Bajas» y el motivo de la baja que se acaba de dar | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `familia-ficha-hijos-en-baja` | recepcion | estado | Ficha de la familia con los dos hijos ya en baja (tras las bajas de arriba) | `/familias/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `familia-alumnos-lista-bajas-reales` | recepcion | estado | Alumnos filtrada por «Bajas», con los dos hijos que se dieron de baja | `/alumnos` | ✔ · ✔ | ✔ · ✔ |

## Fuera de React (39)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `fuera-landing-vacio` | anonimo | fuera-de-react | Landing pública `/l/<vertical>`: formulario vacío (con dos sucursales: aparece el selector «¿En qué sucursal…?») | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-anuncio` | anonimo | fuera-de-react | Landing que llega desde un anuncio (`?c=` código, `utm_*` y `s=` sucursal sugerida): la sucursal ya viene elegida; el código y los utm viajan ocultos | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-anuncio-sucursal-invalida` | anonimo | fuera-de-react | Landing con una `s=` que no es de la vertical y un `c=` con basura: se ignoran en silencio y el selector queda en «Elige una sucursal» | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-una-sucursal` | anonimo | fuera-de-react | Landing de una vertical con UNA sola sucursal (SIMULADO: el mundo tiene dos; se quita el selector de la respuesta real, como lo arma el servidor: la sucursal viaja oculta) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-marca` | anonimo | fuera-de-react | Landing con el logo y el color de marca de la vertical (SIMULADO: color #7b2d8b y un logo propio; el botón y la línea de la cabecera toman el color, el texto del botón se elige por contraste) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-marca-clara` | anonimo | fuera-de-react | Landing con un color de marca CLARO (SIMULADO: #f2c230): el texto del botón se vuelve casi negro por contraste | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-llena` | anonimo | fuera-de-react | Landing con el formulario completo y válido, listo para enviar (el aviso aceptado; no se envía) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-aviso-desplegado` | anonimo | fuera-de-react | Landing con el aviso de privacidad desplegado (el `<details>` abierto con su texto, con scroll si es largo) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-foco-visible` | anonimo | fuera-de-react | Landing con el foco del teclado en el primer campo (anillo de foco de 3 px con el color de marca) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-errores-vacio` | anonimo | fuera-de-react | Landing enviada vacía: resumen «Revisa estos datos» con un enlace por campo y el mensaje bajo cada campo (nombre, edad, sucursal, teléfono, aviso) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-errores-telefono` | anonimo | fuera-de-react | Landing con teléfono malo: solo ese campo con error; el resto de lo escrito se conserva | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-errores-edad` | anonimo | fuera-de-react | Landing con la edad fuera de rango (150): error «de 1 a 99» solo en la edad | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-errores-sin-aviso` | anonimo | fuera-de-react | Landing sin aceptar el aviso de privacidad: error «Para continuar necesitamos que aceptes…» bajo la casilla | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-errores-nombre-con-direccion` | anonimo | fuera-de-react | Landing con un nombre que lleva una dirección web (rechazado): error del nombre y del nombre de contacto con símbolos raros | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-general-aviso-cambio` | anonimo | fuera-de-react | Landing con error GENERAL sin errores por campo: «El aviso de privacidad cambió…» (el aviso vigente cambió mientras se llenaba el formulario) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-general-inesperado` | anonimo | fuera-de-react | Landing con el error general de un dato inesperado (422): «No pudimos registrar tu solicitud. Escríbenos por WhatsApp…» (SIMULADO con el mismo HTML del servidor) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-enviando` | anonimo | fuera-de-react | Landing con el botón en «Enviando…» y deshabilitado (el servidor tarda en responder; se cancela la navegación del formulario para dejarlo en ese estado, no se envía nada) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-gracias` | anonimo | fuera-de-react | Página de gracias de la landing (cuando la vertical no tiene número de WhatsApp: «¡Gracias! Recibimos tus datos…»; SIMULADA con `paginaDeGracias`, porque el mundo siempre tiene número y el envío bueno termina en un 303 a wa.me) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-no-existe` | anonimo | fuera-de-react | Landing: «Página no encontrada» (404) para una vertical que no existe, sin aviso vigente o ambigua (la misma página para las tres, sin revelar cuál) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-enlace-malo` | anonimo | fuera-de-react | Landing: «Página no encontrada» con un enlace mal escrito (mayúsculas y símbolos: no pasa el filtro del identificador) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-origen` | anonimo | fuera-de-react | Landing: «No se pudo enviar» (403) cuando el envío no viene de la propia página (se reenvía la petición real con `Sec-Fetch-Site: cross-site`) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-demasiadas-solicitudes` | anonimo | fuera-de-react | Landing: «Demasiadas solicitudes» (429, límite por IP; SIMULADA con `paginaDeError`, para no agotar el límite del servidor de pruebas) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-landing-error-no-disponible` | anonimo | fuera-de-react | Landing: «No disponible por ahora» (503, falla transitoria de la base; SIMULADA con `paginaDeError`) | `/l/:vertical` | ✔ · ✔ | ✔ · ✔ |
| `fuera-favicon` | anonimo | fuera-de-react | Ícono de la pestaña `/favicon.svg` abierto en su propia página (el SVG ampliado a la ventana; en la pestaña real se ve a 16 px; `web/index.html` lo declara con `<link rel=icon>`) |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-pestana-ventana-chica` | anonimo | fuera-de-react | Ícono de la pestaña a tamaño real: el favicon a 16, 32 y 64 px sobre blanco y sobre oscuro, junto al título «Iniciar sesión · Gestión» (el título lo pone `useTitulo` con `document.title = «<pantalla> · Gestión»`; la pestaña del navegador no se captura) |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-sin-javascript` | anonimo | fuera-de-react | Aviso `<noscript>` de `index.html`: «Esta aplicación necesita JavaScript.» sin hoja de estilos (SIMULADO: el navegador de pruebas tiene JS; se muestra el contenido de `<noscript>` y se impide cargar el script) |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-servidor-404-asset` | anonimo | fuera-de-react | Un archivo de `/assets/` que no existe (404): el navegador muestra una página en blanco (el servidor responde sin cuerpo, nunca el HTML de la aplicación) |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-servidor-404-extension` | anonimo | fuera-de-react | Una dirección con extensión y sin archivo (`/no-existe.js`, 404): la página de error de Express «Cannot GET /no-existe.js» en texto sin estilo |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-servidor-404-prefijo-landing` | anonimo | fuera-de-react | `/l` sin identificador (404 del servidor, no la aplicación): «Cannot GET /l» de Express |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-servidor-404-webhook-get` | anonimo | fuera-de-react | Un GET a un webhook que solo acepta POST (`/webhooks/chatwoot`, 404): «Cannot GET /webhooks/chatwoot» de Express |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-api-404-json` | anonimo | fuera-de-react | Cualquier `/api/...` abierta a mano en el navegador SIN sesión (aquí `/api/no-existe`): el JSON de «no autenticado» (401) como texto plano; la API pide sesión antes de decir si la ruta existe |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-api-404-json-mayusculas` | anonimo | fuera-de-react | `/API/...` en mayúsculas (404 JSON «Ruta no encontrada», no la aplicación): el navegador muestra el JSON como texto |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-salud` | anonimo | fuera-de-react | `/salud` (liveness): el navegador muestra el JSON `{"ok":true}` como texto |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-salud-lista` | anonimo | fuera-de-react | `/salud/lista` (readiness): el JSON con las comprobaciones (base, migraciones, barrido) como texto |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-metricas` | anonimo | fuera-de-react | `/metricas` sin token configurado (404 sin cuerpo) o sin el token (401): el navegador muestra una página en blanco |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-api-404-json-con-sesion` | administrador | fuera-de-react | `/api/...` que no existe, CON sesión de administrador: el JSON 404 «Ruta no encontrada» como texto plano |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-qr-svg` | administrador | fuera-de-react | QR de una campaña servido como imagen SVG (`/api/campanas/:id/qr?formato=svg`): lo que el navegador muestra al abrir la descarga (negro sobre blanco con zona de silencio) |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-qr-png` | administrador | fuera-de-react | QR de una campaña servido como imagen PNG (`formato=png&escala=8`): lo que el navegador muestra |  | ✔ · ✔ | ✔ · ✔ |
| `fuera-qr-url-json` | administrador | fuera-de-react | Datos del QR de una campaña (`formato=url`): el JSON con la dirección de la landing, el código y el código formateado, como texto |  | ✔ · ✔ | ✔ · ✔ |

## Maestro (110)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `maestro-hoy-con-clases` | maestro | pantalla | Hoy, con una clase muestra que ya empezó (asistencia habilitada) y otra dentro de unos días (asistencia apagada con su texto) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-avisos` | maestro | estado | Hoy, con el cuadro «Avisos nuevos» (clase agendada, reprogramada y cancelada) y su botón «Visto» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-aviso-visto-error` | maestro | estado | Hoy, al tocar «Visto» el servidor falla: el error queda dentro del cuadro de avisos | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-sin-clases` | maestro | estado | Hoy, sin clases muestra en estos días | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-muchas-clases` | maestro | estado | Hoy, muy cargado: muchas clases muestra repetidas | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-cargando` | maestro | estado | Hoy, cargando | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-error` | maestro | estado | Hoy, con error de carga | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-estatus-variados` | maestro | estado | Hoy, clases en cada estatus (agendada, asistió, no asistió, reagendada, cancelada) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-clase-asistio` | maestro | estado | Hoy, la clase ya marcada «Asistió»: botón elegido con palomita y «Listo para cerrar la inscripción» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-clase-no-asistio` | maestro | estado | Hoy, la clase ya marcada «No asistió» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-asistencia-procesando` | maestro | estado | Hoy, tocó «Asistió» y la petición sigue en curso («Procesando…» solo en ese botón) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-asistencia-error` | maestro | estado | Hoy, marcar la asistencia falla en el servidor | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-sin-red` | maestro | estado | Hoy, sin señal: al tocar «Asistió» no hay conexión | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-listo-para-cerrar` | maestro | estado | Hoy, tras «Listo para cerrar la inscripción»: el aviso verde de que el asesor lo recibió | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-cierre-en-sitio-falta` | maestro | estado | Hoy, con el modo «el maestro inscribe en sitio»: «Inscribir ahora» dice lo que todavía falta (botón apagado) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-cierre-en-sitio-listo` | maestro | estado | Hoy, modo «inscribe en sitio» con todo capturado: «Inscribir a mi alumno» habilitado | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-cierre-en-sitio-confirmar` | maestro | flotante | Diálogo «Inscribir a …» (confirma el grupo, sin importes) | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-hoy-cierre-en-sitio-grupo-lleno` | maestro | estado | Hoy, al inscribir el grupo ya no tiene lugares: aviso con «Avisar al asesor» | `/hoy` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-vacio` | maestro | pantalla | Registro del alumno de una clase futura, sin nada capturado (lista de lo que falta; asistencia apagada con su texto) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-vacio-todo-abierto` | maestro | pantalla | Registro vacío con todas las secciones abiertas (alumno, adultos, salud, antecedentes, observación, reglamento) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-clase-empezada` | maestro | estado | Registro de la clase que ya empezó: «Asistió» y «No asistió» habilitados | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-asistio` | maestro | estado | Registro con la clase ya marcada «Asistió» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-no-asistio` | maestro | estado | Registro con la clase ya marcada «No asistió» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-asistencia-error` | maestro | estado | Registro, marcar la asistencia falla en el servidor | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-con-datos` | maestro | pantalla | Registro con todo capturado (borrador): secciones con su insignia, faltantes y barra «Todo guardado» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-alumno` | maestro | estado | Registro, sección Alumno abierta con datos | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-adultos` | maestro | estado | Registro, sección «Adultos de la familia» abierta con dos adultos | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-salud` | maestro | estado | Registro, sección «Salud y seguridad» abierta (ya hay datos guardados que no se muestran: pide el motivo para verlos) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-antecedentes` | maestro | estado | Registro, sección Antecedentes abierta («Sí» practicó, motivo «Otro» con su detalle) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-observacion` | maestro | estado | Registro, sección «Observación del maestro» abierta con datos | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-seccion-reglamento` | maestro | estado | Registro, sección «Reglamento y autorización de imagen» abierta (sin respuesta; quién responde y cómo) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-alumno-error-fecha` | maestro | formulario | Registro, sección Alumno: fecha de nacimiento futura al guardar (error junto al campo) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-alumno-error-servidor` | maestro | formulario | Registro, sección Alumno: el servidor rechaza el guardado (aviso rojo y «Reintentar guardado») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-alumno-sin-red` | maestro | formulario | Registro, sección Alumno guardada sin señal: «No hay conexión… Lo que escribiste sigue aquí» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-adultos-fila-nueva` | maestro | formulario | Registro, sección Adultos: «Agregar adulto» deja una fila vacía (cambios sin guardar) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-adultos-error` | maestro | formulario | Registro, sección Adultos: fila vacía y otra con teléfono corto y correo malo al guardar (errores por campo) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-antecedentes-si-practico` | maestro | formulario | Registro, sección Antecedentes vacía y luego «Sí» practicó antes (aparecen dónde y nivel) con motivo «Otro» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-antecedentes-error` | maestro | formulario | Registro, sección Antecedentes: detalle del motivo sin el motivo «Otro» al guardar (el error cae en un campo que ya no se ve: solo queda «Cambios sin guardar») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-observacion-error-servidor` | maestro | formulario | Registro, sección Observación: el servidor rechaza una nota con datos de salud (error en el campo «Notas del maestro») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-primera-vez` | maestro | formulario | Registro, Salud y seguridad sin ficha todavía (formulario vacío, «Ficha incompleta») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-error-sin-cambios` | maestro | formulario | Registro, Salud: «Guardar salud y seguridad» sin tocar nada («No cambiaste nada de esta sección») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-error-contacto` | maestro | formulario | Registro, Salud: contacto de emergencia incompleto (nombre sin teléfono válido) al guardar | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-error-mismo-adulto` | maestro | formulario | Registro, Salud: el contacto de emergencia es uno de los adultos del registro (error junto al nombre) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-escrita` | maestro | formulario | Registro, Salud: formulario escrito a medias (sin guardar), con datos ficticios | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-error-servidor` | maestro | formulario | Registro, Salud: el servidor falla al guardar | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-motivo-corto` | maestro | formulario | Registro, Salud con datos guardados: motivo de la consulta demasiado corto («Ver lo registrado» apagado) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-ver-registrado` | maestro | formulario | Registro, Salud: «Ver lo registrado» con el motivo por omisión (datos ficticios en los campos y «Ocultar lo registrado») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-salud-ver-error` | maestro | formulario | Registro, Salud: «Ver lo registrado» falla (error bajo el motivo) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-texto` | maestro | estado | Registro, Reglamento: «Leer el texto que se le muestra a la familia» desplegado | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-otra-persona` | maestro | formulario | Registro, Reglamento: «Otra persona» responde (nombre y parentesco; «Aceptan» apagado hasta escribir el nombre) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-aceptado` | maestro | estado | Registro, Reglamento aceptado y autorización de imagen aceptada (con «Revocar autorización») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-rechazado` | maestro | estado | Registro, Reglamento rechazado y autorización de imagen revocada | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-error` | maestro | formulario | Registro, Reglamento: «Aceptan» falla en el servidor (error bajo los botones) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-sin-documentos` | maestro | estado | Registro, Reglamento sin documentos vigentes (aviso: pídele al administrador que los publique) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-cargando` | maestro | estado | Registro, Reglamento cargando | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-reglamento-error-carga` | maestro | estado | Registro, Reglamento con error de carga (con «Reintentar») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-barra-sin-cambios` | maestro | estado | Registro, barra de guardado sin cambios («Todo guardado.» y «Guardar borrador» apagado) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-barra-con-cambios` | maestro | estado | Registro, barra de guardado con cambios («Tienes cambios sin guardar.») y la sección en «Sin guardar» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-barra-sin-red` | maestro | estado | Registro, sin señal: «Guardar borrador» muestra en la barra «No hay conexión… lo que escribiste sigue aquí» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-barra-error-servidor` | maestro | estado | Registro, «Guardar borrador» con el servidor fallando: la barra dice qué sección revisar | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-barra-guardando` | maestro | estado | Registro, «Guardar borrador» en curso (botón con «Procesando…») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-borrador-recuperado` | maestro | estado | Registro, borrador recuperado: se escribió algo, se salió a «Hoy» y se regresó («Recuperamos lo que habías escrito…») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-completar-error` | maestro | estado | Registro, «Marcar registro como completo» con faltantes que reporta el servidor (aviso amarillo con la lista) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-completo` | maestro | estado | Registro completo: sin faltantes y con el botón «Cerrar registro» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-cerrar-confirmar` | maestro | flotante | Diálogo «¿Cerrar el registro?» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-cerrar-error` | maestro | estado | Registro, «Sí, cerrar» rechazado porque falta el reglamento (aviso con la lista, tras cerrar el diálogo) | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-cerrado` | maestro | pantalla | Registro cerrado (solo lectura): aviso «ya no se edita», campos apagados, sin barra de guardado ni «Reabrir» | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-ajeno` | maestro | estado | Registro de una clase de otro grupo por URL directa («No se pudo cargar… no se encontró») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-cargando` | maestro | estado | Registro del alumno, cargando | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-registro-error-carga` | maestro | estado | Registro del alumno, con error de carga (y «Reintentar») | `/clases/:id/registro` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-con-alumnos` | maestro | pantalla | Pase de lista de hoy, con los alumnos del grupo sin marcar | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-marcando` | maestro | estado | Pase de lista marcando: presente, falta y justificada (cambios sin guardar) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-todos-presentes` | maestro | estado | Pase de lista tras «Marcar presentes a todos los que faltan por marcar» | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-guardado` | maestro | estado | Pase de lista guardado: aviso «Pase guardado» con el detalle y el aviso de faltas seguidas | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-ya-tomado` | maestro | estado | Pase de lista de un día ya tomado («Pase ya tomado», «Guardar» apagado hasta que haya cambios) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-error-servidor` | maestro | estado | Pase de lista, el servidor rechaza el guardado (error dentro de la barra fija; «tus marcas siguen aquí») | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-sin-red` | maestro | estado | Pase de lista sin señal: «No se guardó nada todavía. Tus marcas siguen aquí…» | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-guardando` | maestro | estado | Pase de lista, guardando (botón «Procesando…») | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-fecha-futura` | maestro | estado | Pase de lista de una fecha que todavía no llega («La clase de ese día todavía no empieza»; sin barra de guardado) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-dia-sin-clase` | maestro | estado | Pase de lista de un día en que el grupo no da clase («Ese día este grupo no da clase. Elige otra fecha.») | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-sin-alumnos` | maestro | estado | Pase de lista de un grupo sin alumnos inscritos en esa fecha | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-alumno-dado-de-baja` | maestro | estado | Pase de lista con un alumno que «ya no está inscrito» (marca anterior conservada) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-sin-grupos` | maestro | estado | Pase de lista sin grupos activos («No tienes grupos activos») | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-muchos-alumnos` | maestro | estado | Pase de lista con un grupo muy grande (alumnos repetidos) | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-cargando` | maestro | estado | Pase de lista, cargando | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-error` | maestro | estado | Pase de lista, con error de carga | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-pase-lista-cargando` | maestro | estado | Pase de lista, los grupos ya cargaron y la lista del grupo sigue cargando («Cargando la lista…») | `/pase` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-lista` | maestro | pantalla | Alumnos, lista de SUS alumnos (sin teléfonos de la familia) | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-sin-resultados` | maestro | estado | Alumnos, una búsqueda por nombre sin coincidencias | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-filtrados` | maestro | estado | Alumnos, buscando un nombre y filtrando por estatus «Activos» | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-vacio` | maestro | estado | Alumnos, sin alumnos («No hay alumnos que coincidan») | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-muchos` | maestro | estado | Alumnos, con muchos alumnos (lista repetida) | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-cargando` | maestro | estado | Alumnos, cargando | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-alumnos-error` | maestro | estado | Alumnos, con error de carga | `/alumnos` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-trayectoria` | maestro | pantalla | Expediente de un alumno propio, pestaña Trayectoria (sin pestañas de dinero ni comercial; con el botón «Salud») | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-operativo` | maestro | estado | Expediente de un alumno propio, pestaña Operativo (asistencia y eventos) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-ajeno` | maestro | estado | Expediente de un alumno que no es suyo por URL directa (no se encontró, con camino de regreso) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-cargando` | maestro | estado | Expediente, cargando | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-error` | maestro | estado | Expediente, con error de carga | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-expediente-con-historial` | maestro | estado | Expediente con avance, próximo evento, cambios de grupo y faltas en el umbral (datos ficticios) | `/alumnos/:id` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-motivo` | maestro | pantalla | Salud del alumno, pide el motivo de la consulta (aviso de datos sensibles; «Ver datos de salud» apagado) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-motivo-corto` | maestro | estado | Salud del alumno, motivo de dos letras (todavía apagado el botón) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-motivo-escrito` | maestro | estado | Salud del alumno, motivo escrito («Clase de hoy») y «Ver datos de salud» habilitado | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-ficha` | maestro | estado | Salud del alumno, ficha a la vista con el contador «Se ocultan en … s» y «Ocultar» (datos de prueba) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-sin-ficha` | maestro | estado | Salud de un alumno sin ficha todavía («Todavía no hay ficha de salud de este alumno», todo «Sin registrar») | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-error-consulta` | maestro | estado | Salud del alumno, la consulta falla (error bajo el motivo) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-sin-red` | maestro | estado | Salud del alumno, sin señal al pedir la consulta | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-ajeno` | maestro | estado | Salud de un alumno que no es suyo por URL directa (no se encontró) | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-cargando` | maestro | estado | Salud del alumno, cargando | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |
| `maestro-salud-error-carga` | maestro | estado | Salud del alumno, con error de carga del alumno | `/alumnos/:id/salud` | ✔ · ✔ | ✔ · ✔ |

## Recepción (98)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `recep-pagos-buscador-inicial` | recepcion | pantalla | Registrar pago sin familia elegida: el buscador, sin búsqueda | `/pagos` | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-una-letra` | recepcion | formulario | Buscador con una sola letra: la ayuda pide al menos dos y «Buscar» está apagado |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-resultados-nombre` | recepcion | estado | Buscador con resultados, buscando por nombre |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-resultados-telefono` | recepcion | estado | Buscador con resultados, buscando por teléfono escrito con espacios y paréntesis |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-sin-resultados` | recepcion | estado | Buscador sin resultados: «No encontré a esa familia» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-telefono-incompleto` | recepcion | estado | Buscador con un teléfono incompleto: aviso «Ese teléfono no está completo» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-busqueda-incompleta` | recepcion | estado | Buscador con resultados y el aviso «Hay más resultados de los que se pudieron revisar» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-muchos-resultados` | recepcion | estado | Buscador con muchos resultados (20 familias) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-buscando` | recepcion | estado | Buscador mientras busca: «Buscando…» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-error` | recepcion | estado | Buscador con error de carga y botón de reintentar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-buscador-sin-red` | recepcion | estado | Buscador sin conexión: la búsqueda falla con «No hay conexión» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-con-adeudo` | recepcion | paso | Registrar pago con la familia elegida desde el buscador: adeudo con cargo vencido, formulario vacío y sin pagos recientes |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-cargando` | recepcion | estado | Registrar pago: la familia está elegida y el estado de cuenta aún carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-error` | recepcion | estado | Registrar pago: error al cargar el estado de cuenta de la familia |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-al-corriente` | recepcion | estado | Registrar pago con una familia sin adeudo (tiene cargos, todos pagados): «No hay nada que cobrar» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-sin-cargos` | recepcion | estado | Registrar pago con una familia que todavía no tiene cargos ni pagos |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-muchos-datos` | recepcion | estado | Registrar pago con muchos hijos y cargos |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-familia-con-pagos-recientes` | recepcion | estado | Registrar pago con una familia que ya pagó: lista «Pagos recientes» con botón «Cancelar pago» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-pagos-recientes-error` | recepcion | estado | Registrar pago: error al cargar «Pagos recientes» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-letras` | recepcion | formulario | Formulario de pago: monto con letras, error de validación y «Registrar pago» apagado |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-cero` | recepcion | formulario | Formulario de pago: monto en cero, error «El importe debe ser mayor que cero» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-decimales` | recepcion | formulario | Formulario de pago: monto con tres decimales, error de validación |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-parcial` | recepcion | formulario | Formulario de pago: monto de $300 que se abona al cargo vencido, con la insignia «Pago parcial» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-varios-cargos` | recepcion | formulario | Formulario de pago: monto de $1,000 repartido entre varios cargos, listo para registrar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-todo-el-saldo` | recepcion | formulario | Formulario de pago: el monto cubre TODO el saldo de la familia; el reparto muestra «Saldo después del pago» en cero |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-monto-mayor-al-saldo` | recepcion | formulario | Formulario de pago: monto mayor a lo que la familia adeuda, aviso «El pago pasa de lo que la familia adeuda» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-propuesta-cargando` | recepcion | estado | Formulario de pago mientras calcula el reparto: «Calculando el reparto…» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-propuesta-error` | recepcion | estado | Formulario de pago: error al calcular el reparto |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-fecha-futura` | recepcion | formulario | Formulario de pago: fecha de mañana, error «La fecha del pago no puede ser de mañana en adelante» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-metodo-tarjeta` | recepcion | formulario | Formulario de pago con método «Tarjeta» y folio de referencia |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-metodo-transferencia` | recepcion | formulario | Formulario de pago con método «Transferencia», referencia y fecha de un día anterior |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-reparto-a-mano` | recepcion | paso | Reparto a mano: parte de la propuesta del servidor, con la suma que cuadra |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-reparto-a-mano-faltan` | recepcion | formulario | Reparto a mano que no cuadra: faltan centavos, «Registrar pago» apagado |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-reparto-a-mano-errores` | recepcion | formulario | Reparto a mano con errores por cargo: «Pasa del saldo de este cargo» y un importe con letras |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-reparto-a-mano-sobran` | recepcion | formulario | Reparto a mano que se pasa del monto: «sobran» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-sin-red` | recepcion | estado | Registrar pago sin conexión: error y la nota «el servidor reconoce la misma clave y NO lo duplica» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-error-del-servidor` | recepcion | estado | Registrar pago: el servidor rechaza el pago y la pantalla muestra el error |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-cancelar-dialogo` | recepcion | flotante | Diálogo «Cancelar el pago» abierto y vacío (el botón de confirmar apagado) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-cancelar-dialogo-motivo` | recepcion | flotante | Diálogo «Cancelar el pago» con el motivo escrito, listo para confirmar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-cancelar-dialogo-error` | recepcion | flotante | Diálogo «Cancelar el pago» con el error del servidor |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-buscador` | recepcion | pantalla | Estado de cuenta sin familia elegida: el buscador (la misma pantalla para recepción, asesor y administrador) | `/cuenta` | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-buscador-resultados` | recepcion | estado | Estado de cuenta: el buscador con resultados |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-buscador-sin-resultados` | recepcion | estado | Estado de cuenta: el buscador sin resultados |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-con-vencidos` | recepcion | pantalla | Estado de cuenta de una familia con cargos vencidos, antigüedad de lo vencido y sin pagos | `/cuenta/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-con-pagos` | recepcion | pantalla | Estado de cuenta de una familia que ya pagó: lista de pagos | `/cuenta/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-al-corriente` | recepcion | estado | Estado de cuenta de una familia sin adeudo (todo pagado) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-sin-cargos` | recepcion | estado | Estado de cuenta de una familia sin cargos ni pagos: «Esta familia todavía no tiene cargos» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-muchos-movimientos` | recepcion | estado | Estado de cuenta con muchos hijos, cargos y pagos |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-cargando` | recepcion | estado | Estado de cuenta mientras carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-error` | recepcion | estado | Estado de cuenta con error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-impresion` | recepcion | impresion | Estado de cuenta en la vista de impresión (para dárselo a la familia en papel) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-solo-lectura-asesor` | asesor | pantalla | Estado de cuenta visto por el asesor (solo lectura; las mismas acciones de imprimir y descargar) | `/cuenta/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-buscador-asesor` | asesor | pantalla | Estado de cuenta: el buscador visto por el asesor | `/cuenta` | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-lista` | recepcion | pantalla | Uniformes por entregar, con un uniforme liberado y la existencia (recepción y administrador) | `/uniformes` | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-vacio` | recepcion | estado | Uniformes por entregar sin nada pendiente: «No hay nada por entregar» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-cargando` | recepcion | estado | Uniformes por entregar mientras carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-error` | recepcion | estado | Uniformes por entregar con error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-muchos-datos` | recepcion | estado | Uniformes por entregar con muchas familias en espera |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-dialogo` | recepcion | flotante | Diálogo «Entregar» abierto: elegir la pieza de la talla del alumno |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-error` | recepcion | flotante | Diálogo «Entregar» con el error del servidor (sin existencia al confirmar) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-ya-entregado` | recepcion | flotante | Diálogo «Entregar» con el aviso «Este uniforme ya se entregó» (otra persona lo marcó antes) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-sin-existencia` | recepcion | flotante | Diálogo «Entregar» sin piezas con existencia de la talla del alumno |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-inventario-error` | recepcion | flotante | Diálogo «Entregar» con error al ver el inventario |  | ✔ · ✔ | ✔ · ✔ |
| `recep-uniformes-entregar-sin-red` | recepcion | flotante | Diálogo «Entregar» sin conexión al confirmar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-inicial` | recepcion | pantalla | Ventas: existencia con «Última pieza», formulario de nueva venta y ventas recientes vacías (recepción y administrador) | `/ventas` | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-vacio` | recepcion | estado | Ventas sin productos ni ventas: «No hay ningún producto con existencia para vender» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-todo-agotado` | recepcion | estado | Ventas con todos los productos agotados (insignia «Agotado») |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-cargando` | recepcion | estado | Ventas mientras carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-error` | recepcion | estado | Ventas con error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-muchos-datos` | recepcion | estado | Ventas con muchos productos en existencia |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-alumno-una-letra` | recepcion | formulario | Nueva venta con una sola letra en la búsqueda del alumno: «Escribe al menos dos letras» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-alumno-encontrado` | recepcion | formulario | Nueva venta con el alumno encontrado y elegido, listo para registrar (total calculado) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-alumno-sin-resultados` | recepcion | formulario | Nueva venta con búsqueda de alumno sin resultados: «No encontré a ese alumno» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-alumno-error` | recepcion | formulario | Nueva venta con error al buscar al alumno |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-cantidad-cero` | recepcion | formulario | Nueva venta con cantidad cero: «Escribe un número entero de piezas» y «Registrar venta» apagado |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-cantidad-mayor-a-la-existencia` | recepcion | formulario | Nueva venta con más piezas de las que hay: «Solo hay 1 en existencia» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-error-del-servidor` | recepcion | formulario | Nueva venta: el servidor rechaza la venta (alguien vendió la última pieza) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-sin-red` | recepcion | formulario | Nueva venta sin conexión al registrar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-anular-dialogo` | recepcion | flotante | Diálogo «Anular la venta» abierto y vacío (el botón de confirmar apagado) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-anular-dialogo-motivo` | recepcion | flotante | Diálogo «Anular la venta» con el motivo escrito, listo para confirmar |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-anular-dialogo-error` | recepcion | flotante | Diálogo «Anular la venta» con el error del servidor |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-hoy` | recepcion | pantalla | Cierre del día con movimientos: cajas por persona, total del día y tabla de pagos (recepción) | `/corte` | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-hoy-administrador` | administrador | pantalla | Cierre del día visto por el administrador (su caja va primero como «Tu caja») | `/corte` | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-dia-sin-cobros` | recepcion | estado | Cierre de un día anterior sin cobros: «Ese día no se registró ningún cobro» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-hoy-sin-cobros` | recepcion | estado | Cierre de hoy sin cobros todavía: «Hoy todavía no se ha registrado ningún cobro» |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-cargando` | recepcion | estado | Cierre del día mientras suma lo cobrado |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-error` | recepcion | estado | Cierre del día con error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-muchos-movimientos` | recepcion | estado | Cierre del día con muchos pagos y varias cajas |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-con-devoluciones` | recepcion | estado | Cierre del día con un pago de otro día cancelado hoy: devoluciones, neto y pagos cancelados |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-impresion` | recepcion | impresion | Cierre del día en la vista de impresión |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-pago-registrado` | recepcion | paso | Pago registrado con el reparto a mano entre dos hijos: recibo con lo aplicado, saldo restante y acciones |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-recibo-impresion` | recepcion | impresion | Recibo del pago en la vista de impresión («Imprimir recibo») |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-pago-ya-estaba-registrado` | recepcion | estado | Aviso «Este pago ya estaba registrado: no se duplicó» (reintento con la misma clave tras un corte de red) |  | ✔ · ✔ | ✔ · ✔ |
| `recep-pagos-pago-cancelado` | recepcion | estado | Pagos recientes con un pago cancelado (queda con su motivo, sin borrarse) y el formulario de nuevo a la vista |  | ✔ · ✔ | ✔ · ✔ |
| `recep-cuenta-familia-tras-varios-pagos` | recepcion | estado | Estado de cuenta de la familia después de varios pagos, uno de ellos cancelado | `/cuenta/:tutorId` | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-venta-registrada` | recepcion | paso | Venta registrada: aviso con el detalle y el botón «Cobrar ahora»; existencia y ventas recientes al día |  | ✔ · ✔ | ✔ · ✔ |
| `recep-ventas-venta-anulada` | recepcion | estado | Ventas recientes con una venta anulada (insignia «Anulada») y la pieza de vuelta en la existencia |  | ✔ · ✔ | ✔ · ✔ |
| `recep-corte-con-cobros-y-cancelados` | recepcion | pantalla | Cierre del día con los cobros de recepción y de administración y un pago cobrado y cancelado hoy | `/corte` | ✔ · ✔ | ✔ · ✔ |

## Tableros (48)

| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |
|---|---|---|---|---|---|---|
| `tabl-clases-con-datos` | administrador | pantalla | Tableros, pestaña «Clases muestra» del administrador: filtros, indicadores, barras por fuente, disciplina y sucursal, y tablas | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-asesor` | asesor | pantalla | Tableros, pestaña «Clases muestra» del asesor (solo «Clases muestra» y «Ejecutivo»; sin «Costo por campaña») | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-asesor-pide-costo` | asesor | estado | El asesor abre /tableros?vista=costo: no hay esa pestaña y se queda en «Clases muestra» | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-muchos-datos` | administrador | estado | «Clases muestra» con muchos datos (cada lista repetida ocho veces: barras y tablas largas) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-vacio` | administrador | estado | «Clases muestra» vacía: indicadores en cero, aviso «No hay clases muestra en este rango.» y barras sin datos |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-cargando` | administrador | estado | «Clases muestra» cargando (filtros y descarga ya puestos; el reporte todavía no llega) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-error` | administrador | estado | «Clases muestra» con error de carga (500) y botón «Reintentar» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-sin-conexion` | administrador | estado | «Clases muestra» sin conexión: al cambiar un filtro el error dice «No hay conexión…» sobre los datos que ya estaban |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-filtro-sucursal` | administrador | estado | «Clases muestra» filtrada por una sucursal sin clases (la sur): ceros y el aviso de rango sin clases |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-filtro-disciplina` | administrador | estado | «Clases muestra» filtrada por una disciplina (la primera de la lista) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-filtro-rango` | administrador | estado | «Clases muestra» con rango de fechas elegido (últimos 30 días, con «Desde» y «Hasta» escritos) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-filtro-rango-invertido` | administrador | estado | «Clases muestra» con el rango al revés («Hasta» anterior a «Desde»): el servidor lo rechaza y se ve el error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-clases-filtro-rango-sin-fechas` | administrador | estado | «Clases muestra» con «Desde» borrado (sin ninguna fecha: todo el historial) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-con-datos` | administrador | pantalla | Tableros, pestaña «Costo por campaña» del administrador: indicadores, aviso de campañas sin gasto, barras de gasto y tabla con «Capturar o ver gastos» | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-con-gasto-en-todas` | administrador | estado | «Costo por campaña» con gasto en todas las campañas y con inscritos a mano (sin aviso de campañas sin gasto; con la nota de inscritos a mano; respuesta ajustada) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-muchos-datos` | administrador | estado | «Costo por campaña» con muchos datos (campañas repetidas ocho veces: barras y tabla largas) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-vacio` | administrador | estado | «Costo por campaña» sin campañas: aviso «Todavía no hay campañas…», barras y tabla vacías |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-cargando` | administrador | estado | «Costo por campaña» cargando |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-error` | administrador | estado | «Costo por campaña» con error de carga (500) y botón «Reintentar» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-sin-conexion` | administrador | estado | «Costo por campaña» sin conexión: al cambiar el rango el error dice «No hay conexión…» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-filtro-rango` | administrador | estado | «Costo por campaña» con rango de fechas elegido (últimos 30 días; este tablero no tiene filtro de sucursal ni de disciplina) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-costo-filtro-rango-invertido` | administrador | estado | «Costo por campaña» con el rango al revés: el servidor lo rechaza y se ve el error de carga |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-con-datos` | administrador | pantalla | Tableros, pestaña «Ejecutivo» del administrador: mes, descargas, seis indicadores, barras de activos, cartera y ocupación, y tabla de ocupación | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-asesor` | asesor | pantalla | Tableros, pestaña «Ejecutivo» del asesor (mismas cifras que el administrador; solo dos pestañas) | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-muchos-datos` | administrador | estado | «Ejecutivo» con muchos datos (disciplinas y grupos repetidos ocho veces) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-vacio` | administrador | estado | «Ejecutivo» vacío (escuela sin alumnos ni grupos): indicadores en cero, deserción «—», barras con «Todavía no hay…» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-cargando` | administrador | estado | «Ejecutivo» cargando |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-error` | administrador | estado | «Ejecutivo» con error de carga (500) y botón «Reintentar» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-sin-conexion` | administrador | estado | «Ejecutivo» sin conexión: al cambiar el mes el error dice «No hay conexión…» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-mes-sin-historia` | administrador | estado | «Ejecutivo» con un mes sin historia (enero de 2020): altas y bajas en cero y deserción «—» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-ejecutivo-mes-futuro` | administrador | estado | «Ejecutivo» con un mes futuro escrito a mano (el campo lo limita al mes actual; lo que responda el servidor se ve) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-vacio` | administrador | flotante | Diálogo «Gastos de la campaña» de una campaña sin gastos: total $0.00, lista vacía y formulario «Capturar un gasto» | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-con-gastos` | administrador | flotante | Diálogo «Gastos de la campaña» con tres gastos capturados (uno sin nota) y su total |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-cargando` | administrador | flotante | Diálogo «Gastos de la campaña» cargando la lista de gastos («Cargando…») |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-error-de-carga` | administrador | flotante | Diálogo «Gastos de la campaña» con error al cargar la lista de gastos (500) y botón «Reintentar» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-validacion-vacio` | administrador | flotante | Diálogo «Gastos de la campaña» enviado sin monto: «Escribe un importe válido mayor que cero…» |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-validacion-monto-con-decimales` | administrador | flotante | Diálogo «Gastos de la campaña» con un monto de tres decimales («12.345»): importe inválido |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-validacion-monto-cero` | administrador | flotante | Diálogo «Gastos de la campaña» con monto cero («0»): importe inválido |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-validacion-monto-letras` | administrador | flotante | Diálogo «Gastos de la campaña» con un monto que no es número («abc»): importe inválido |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-validacion-fecha-y-monto` | administrador | flotante | Diálogo «Gastos de la campaña» con la fecha borrada y sin monto: «Elige la fecha» y el error del importe a la vez |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-capturando` | administrador | flotante | Diálogo «Gastos de la campaña» con el gasto lleno y el botón «Capturar el gasto» ocupado (esperando al servidor) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-error-servidor-en-el-campo` | administrador | flotante | Diálogo «Gastos de la campaña» con el servidor rechazando el monto (400, mensaje bajo el campo «Monto (MXN)») |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-error-servidor` | administrador | flotante | Diálogo «Gastos de la campaña» con error general del servidor al capturar (500) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-sin-conexion` | administrador | flotante | Diálogo «Gastos de la campaña» sin conexión al capturar («No hay conexión con el servidor…») |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-confirmar-baja` | administrador | flotante | Diálogo «Gastos de la campaña» pidiendo confirmar la baja de un gasto en su misma fila («¿Quitar el gasto de …?», «Sí, quitarlo» / «No») |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-baja-error-servidor` | administrador | flotante | Diálogo «Gastos de la campaña» con error del servidor al dar de baja un gasto (500) |  | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-aviso-capturado` | administrador | flotante | Aviso global «ya quedó» al capturar un gasto («Se capturó el gasto de $1,500.50 …: el costo ya está recalculado.») sobre el diálogo, con el gasto nuevo en la lista | `/tableros` | ✔ · ✔ | ✔ · ✔ |
| `tabl-gastos-aviso-quitado` | administrador | flotante | Aviso global «ya quedó» al dar de baja un gasto («Se quitó el gasto de … : el costo ya está recalculado.») sobre el diálogo |  | ✔ · ✔ | ✔ · ✔ |

