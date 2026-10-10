# Mainnie's Beauty

Tienda demostrativa desarrollada con HTML, CSS y JavaScript, un servidor Node.js y Caddy como proxy HTTPS.

## Inicio de sesión

Al abrir la tienda se solicita iniciar sesión o crear una cuenta. Las cuentas se guardan en `data/users.json`; las contraseñas se almacenan como hashes `scrypt` con salt aleatorio y nunca en texto plano. Se requieren contraseñas de al menos 12 caracteres.

Las sesiones usan cookies `HttpOnly`, `SameSite=Strict` y una duración máxima de 8 horas. En Docker, `COOKIE_SECURE=true` añade el atributo `Secure`, por lo que la sesión solo viaja por HTTPS. Las rutas del catálogo y de pedidos requieren una sesión; las solicitudes que modifican datos también requieren un token CSRF y origen coincidente.

Las sesiones se guardan en memoria y se invalidan al reiniciar el servidor. Los usuarios y pedidos permanecen en el directorio `data`, que está excluido de Git y de la imagen Docker.

## Ejecutar con Node.js

```powershell
npm start
```

Abre `http://localhost:3000`. En el primer acceso, selecciona **Crear cuenta**. En modo local HTTP, la cookie se configura sin `Secure`; para probar cookies seguras usa Docker con Caddy.

## Ejecutar con Docker

```powershell
docker compose up -d --build
```

Abre `https://localhost:8443`. El servicio web usa `COOKIE_SECURE=true`; Caddy debe estar activo para servir la página por HTTPS.

## Estructura

- `public/`: interfaz, estilos e interacción del navegador.
- `catalog/products.json`: catálogo del sitio.
- `img/`: imágenes de productos.
- `server.js`: API, autenticación, sesiones y archivos estáticos.
- `compose.yaml`, `Dockerfile`, `Caddyfile`: contenedores y proxy HTTPS.
- `data/`: almacenamiento local persistente de usuarios y pedidos; no se versiona.

## Alcance

Es una implementación educativa para la tienda de demostración. Los pedidos no cobran dinero. Para producción se recomienda una base de datos con copias de seguridad, almacenamiento de sesiones compartido, verificación de correo, recuperación segura de cuentas, monitoreo y una autoridad TLS pública para el dominio real.
